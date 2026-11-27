#!/usr/bin/env python3
"""
Voyeger — Single-Command Cross-Platform Project Launcher

Coordinates environment checks, dependency installation, preflight validation,
testing, production builds, and concurrent startup of the FastAPI backend
and React/Vite frontend.

Usage:
    python run.py              # Check, install if needed, test, build, and start both servers
    python run.py --check      # Inspect prerequisites and configuration (read-only)
    python run.py --setup      # Install dependencies and initialize missing .env / DB / pack
    python run.py --test       # Run backend and frontend tests + TypeScript validation
    python run.py --build      # Run frontend production build
    python run.py --no-tests   # Check prerequisites and start both servers without running tests/build
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"

MIN_PYTHON = (3, 11)
MIN_NODE_MAJOR = 20

BACKEND_HOST = "0.0.0.0"
BACKEND_PORT = 8000
BACKEND_HEALTH_URL = f"http://127.0.0.1:{BACKEND_PORT}/api/health"
FRONTEND_PORT = 8080
FRONTEND_URL = f"http://localhost:{FRONTEND_PORT}"

REQUIRED_BACKEND_IMPORTS = (
    "fastapi",
    "uvicorn",
    "sqlalchemy",
    "pydantic",
    "alembic",
    "httpx",
    "yaml",
    "PIL",
    "pytest",
)


def _banner(title: str) -> None:
    print(f"\n{'=' * 64}")
    print(f"  {title}")
    print(f"{'=' * 64}")


def _is_windows() -> bool:
    return os.name == "nt"


def _resolve_executable(name: str) -> Optional[str]:
    """Locate an executable on PATH (handles .cmd/.exe on Windows)."""
    return shutil.which(name)


def _run_cmd(
    cmd: List[str],
    cwd: Path,
    capture: bool = False,
) -> subprocess.CompletedProcess[str]:
    """Run a subprocess cleanly without shell injection."""
    return subprocess.run(
        cmd,
        cwd=str(cwd),
        text=True,
        capture_output=capture,
        encoding="utf-8",
        errors="replace",
    )


def _venv_python(venv_dir: Path) -> Path:
    if _is_windows():
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def _detect_frontend_pm() -> Tuple[str, str]:
    """
    Determine the authoritative frontend package manager from lockfiles and PATH.
    Returns (manager_name, executable_path).
    """
    has_npm_lock = (FRONTEND_DIR / "package-lock.json").is_file()
    has_bun_lock = (FRONTEND_DIR / "bun.lock").is_file() or (FRONTEND_DIR / "bun.lockb").is_file()

    npm_bin = _resolve_executable("npm")
    bun_bin = _resolve_executable("bun")

    if has_npm_lock and npm_bin:
        return ("npm", npm_bin)
    if has_bun_lock and bun_bin:
        return ("bun", bun_bin)
    if npm_bin:
        return ("npm", npm_bin)
    if bun_bin:
        return ("bun", bun_bin)
    return ("none", "")


def check_prerequisites() -> Dict[str, str]:
    """Verify Python, Node.js, package manager, and repository directories."""
    _banner("Phase 1: Checking Prerequisites & Repository Layout")

    if not BACKEND_DIR.is_dir() or not FRONTEND_DIR.is_dir():
        print(f"ERROR: Expected 'backend/' and 'frontend/' under {ROOT_DIR}")
        sys.exit(1)

    # 1. Python
    py_ver = sys.version_info[:3]
    py_str = f"{py_ver[0]}.{py_ver[1]}.{py_ver[2]}"
    if sys.version_info < MIN_PYTHON:
        print(f"ERROR: Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+ is required (found {py_str}).")
        print("Install from: https://www.python.org/downloads/")
        sys.exit(1)
    print(f"  [OK] Python:          {py_str} ({sys.executable})")

    # 2. Node.js
    node_bin = _resolve_executable("node")
    if not node_bin:
        print(f"ERROR: Node.js {MIN_NODE_MAJOR}+ is required but was not found on PATH.")
        print("Install from: https://nodejs.org/")
        sys.exit(1)
    node_res = _run_cmd([node_bin, "--version"], ROOT_DIR, capture=True)
    node_raw = node_res.stdout.strip()
    match = re.search(r"v?(\d+)\.(\d+)\.(\d+)", node_raw)
    if not match or int(match.group(1)) < MIN_NODE_MAJOR:
        print(f"ERROR: Node.js {MIN_NODE_MAJOR}+ is required (found '{node_raw}').")
        print("Install from: https://nodejs.org/")
        sys.exit(1)
    print(f"  [OK] Node.js:         {node_raw} ({node_bin})")

    # 3. Package Manager
    pm_name, pm_bin = _detect_frontend_pm()
    if pm_name == "none" or not pm_bin:
        print("ERROR: Neither 'npm' nor 'bun' was found on PATH.")
        print("Install Node.js (includes npm): https://nodejs.org/")
        sys.exit(1)
    pm_ver_res = _run_cmd([pm_bin, "--version"], ROOT_DIR, capture=True)
    print(f"  [OK] Package manager: {pm_name} {pm_ver_res.stdout.strip()} ({pm_bin})")

    # 4. npx (needed for tsc --noEmit when using npm)
    npx_bin = _resolve_executable("npx") or ""
    if pm_name == "npm" and not npx_bin:
        print("ERROR: 'npx' was not found on PATH.")
        print("Install Node.js (includes npm/npx): https://nodejs.org/")
        sys.exit(1)

    # 5. Git (optional check)
    git_bin = _resolve_executable("git")
    if git_bin:
        git_res = _run_cmd([git_bin, "--version"], ROOT_DIR, capture=True)
        print(f"  [OK] Git:             {git_res.stdout.strip()}")
    else:
        print("  [INFO] Git not found on PATH (optional for runtime).")

    return {
        "node": node_bin,
        "pm_name": pm_name,
        "pm_bin": pm_bin,
        "npx_bin": npx_bin,
    }


def _backend_imports_ok(py_exe: Path) -> bool:
    if not py_exe.is_file():
        return False
    check_code = "; ".join(f"import {mod}" for mod in REQUIRED_BACKEND_IMPORTS)
    res = _run_cmd([str(py_exe), "-c", check_code], BACKEND_DIR, capture=True)
    return res.returncode == 0


def _frontend_deps_ok() -> bool:
    node_modules = FRONTEND_DIR / "node_modules"
    required_pkgs = [
        node_modules / "vite",
        node_modules / "vitest",
        node_modules / "typescript",
        node_modules / "@testing-library" / "dom",
    ]
    return all(p.exists() for p in required_pkgs)


def _has_built_pack() -> bool:
    pack_dir = BACKEND_DIR / "pack"
    if not pack_dir.is_dir():
        return False
    return any(
        entry.is_dir() and entry.name.startswith("v") and (entry / "manifest.json").is_file()
        for entry in pack_dir.iterdir()
    )


def ensure_setup(env_info: Dict[str, str], check_only: bool = False) -> Path:
    """Ensure backend venv, .env files, database, content pack, and frontend node_modules exist."""
    _banner("Phase 2: Checking & Preparing Environment & Dependencies")

    backend_venv = BACKEND_DIR / ".venv"
    venv_py = _venv_python(backend_venv)
    root_venv_py = _venv_python(ROOT_DIR / ".venv")

    # Prefer backend/.venv; create/install if missing or incomplete
    active_py = venv_py
    if _backend_imports_ok(venv_py):
        print(f"  [OK] Backend dependencies already installed in {backend_venv}")
    elif _backend_imports_ok(root_venv_py) and check_only:
        active_py = root_venv_py
        print(f"  [OK] Backend dependencies available in {ROOT_DIR / '.venv'}")
    else:
        if check_only:
            print(f"  [MISSING] Backend virtualenv/dependencies not initialized at {backend_venv}")
        else:
            if not venv_py.is_file():
                print(f"  Creating virtual environment at {backend_venv} ...")
                res = _run_cmd([sys.executable, "-m", "venv", str(backend_venv)], BACKEND_DIR)
                if res.returncode != 0:
                    print("ERROR: Failed to create backend/.venv")
                    sys.exit(res.returncode)
            req_file = BACKEND_DIR / "requirements.txt"
            print(f"  Installing backend dependencies from {req_file} ...")
            _run_cmd([str(venv_py), "-m", "pip", "install", "--upgrade", "pip"], BACKEND_DIR)
            res = _run_cmd([str(venv_py), "-m", "pip", "install", "-r", str(req_file)], BACKEND_DIR)
            if res.returncode != 0:
                print("ERROR: Backend dependency installation failed.")
                sys.exit(res.returncode)
            print("  [OK] Backend dependencies installed.")

    # Backend .env
    backend_env = BACKEND_DIR / ".env"
    backend_env_example = BACKEND_DIR / ".env.example"
    if backend_env.is_file():
        print(f"  [OK] Backend .env present ({backend_env})")
    elif check_only:
        print(f"  [MISSING] Backend .env missing (template: {backend_env_example})")
    elif backend_env_example.is_file():
        shutil.copyfile(backend_env_example, backend_env)
        print(f"  [CREATED] Copied {backend_env_example.name} -> {backend_env}")

    # Backend database & pack initialization (only when missing!)
    db_file = BACKEND_DIR / "voyeger.db"
    has_pack = _has_built_pack()
    if db_file.is_file() and has_pack:
        print(f"  [OK] SQLite database and content pack present ({db_file.name})")
    elif check_only:
        if not db_file.is_file():
            print("  [MISSING] backend/voyeger.db not initialized yet (will initialize on setup)")
        if not has_pack:
            print("  [MISSING] backend/pack/ not built yet (will build on setup)")
    else:
        print("  Initializing backend database and content pack ...")
        alembic_res = _run_cmd([str(active_py), "-m", "alembic", "upgrade", "head"], BACKEND_DIR)
        if alembic_res.returncode != 0:
            print("ERROR: Database migration (alembic upgrade head) failed.")
            sys.exit(alembic_res.returncode)

        places_dir = BACKEND_DIR / "content" / "places"
        if places_dir.is_dir() and any(places_dir.glob("*.yaml")):
            ingest_res = _run_cmd([str(active_py), "-m", "pipeline.ingest_curated"], BACKEND_DIR)
        else:
            ingest_res = _run_cmd([str(active_py), "-m", "pipeline.seed"], BACKEND_DIR)
        if ingest_res.returncode != 0:
            print("ERROR: Content ingestion failed.")
            sys.exit(ingest_res.returncode)

        if not has_pack:
            pack_res = _run_cmd([str(active_py), "-m", "pipeline.build_pack"], BACKEND_DIR)
            if pack_res.returncode != 0:
                print("ERROR: Initial pack build failed.")
                sys.exit(pack_res.returncode)
        print("  [OK] Backend database and content pack initialized.")

    # Frontend dependencies
    pm_name = env_info["pm_name"]
    pm_bin = env_info["pm_bin"]
    if _frontend_deps_ok():
        print(f"  [OK] Frontend dependencies already installed in {FRONTEND_DIR / 'node_modules'}")
    elif check_only:
        print(f"  [MISSING] Frontend dependencies not installed in {FRONTEND_DIR / 'node_modules'}")
    else:
        if pm_name == "npm":
            if (FRONTEND_DIR / "package-lock.json").is_file():
                install_cmd = [pm_bin, "ci", "--legacy-peer-deps"]
            else:
                install_cmd = [pm_bin, "install", "--legacy-peer-deps"]
        else:
            install_cmd = [pm_bin, "install", "--frozen-lockfile"]
        print(f"  Installing frontend dependencies: {' '.join(install_cmd)} ...")
        res = _run_cmd(install_cmd, FRONTEND_DIR)
        if res.returncode != 0:
            print("ERROR: Frontend dependency installation failed.")
            sys.exit(res.returncode)
        print("  [OK] Frontend dependencies installed.")

    # Frontend .env (UTF-8 without BOM, configured for connected HTTP mode)
    frontend_env = FRONTEND_DIR / ".env"
    if frontend_env.is_file():
        raw = frontend_env.read_bytes()
        if raw.startswith(b"\xef\xbb\xbf"):
            print("  [WARN] frontend/.env contains a UTF-8 BOM which can break Vite env parsing!")
        else:
            print(f"  [OK] Frontend .env present ({frontend_env})")
    elif check_only:
        print(f"  [MISSING] Frontend .env missing (template: {FRONTEND_DIR / '.env.example'})")
    else:
        default_fe_env = (
            "VITE_API_MODE=http\n"
            f"VITE_API_BASE_URL=http://localhost:{BACKEND_PORT}\n"
            f"VITE_PACK_BASE_URL=http://localhost:{BACKEND_PORT}/pack\n"
            f"VITE_TILES_URL=http://localhost:{BACKEND_PORT}/tiles/bhopal.pmtiles\n"
        )
        frontend_env.write_bytes(default_fe_env.encode("utf-8"))
        print(f"  [CREATED] Created {frontend_env} (HTTP connected mode, UTF-8 without BOM)")

    return active_py


def run_preflight_checks(
    active_py: Path,
    env_info: Dict[str, str],
    run_tests: bool = True,
    run_build: bool = True,
) -> bool:
    """Run backend validation/tests, TypeScript check, frontend tests, and production build."""
    _banner("Phase 3: Preflight Validation, Tests & Production Build")

    results: Dict[str, str] = {
        "Dependency validation": "PASS" if _backend_imports_ok(active_py) and _frontend_deps_ok() else "FAIL",
        "Backend validation & tests": "SKIPPED",
        "TypeScript": "SKIPPED",
        "Frontend tests": "SKIPPED",
        "Production build": "SKIPPED",
    }

    overall_ok = results["Dependency validation"] == "PASS"

    if run_tests:
        print("\n-> Running backend compile & content validation ...")
        comp = _run_cmd([str(active_py), "-m", "compileall", "-q", "server", "pipeline", "tests"], BACKEND_DIR)
        val = _run_cmd([str(active_py), "-m", "pipeline.validate"], BACKEND_DIR)
        print("\n-> Running backend pytest suite (isolated temp DB) ...")
        pyt = _run_cmd([str(active_py), "-m", "pytest", "-v"], BACKEND_DIR)
        if comp.returncode == 0 and val.returncode == 0 and pyt.returncode == 0:
            results["Backend validation & tests"] = "PASS"
        else:
            results["Backend validation & tests"] = "FAIL"
            overall_ok = False

        print("\n-> Running frontend TypeScript check (tsc --noEmit) ...")
        pm_bin = env_info["pm_bin"]
        npx_bin = env_info["npx_bin"]
        tsc_cmd = [npx_bin, "tsc", "--noEmit"] if npx_bin else [pm_bin, "x", "tsc", "--noEmit"]
        tsc = _run_cmd(tsc_cmd, FRONTEND_DIR)
        if tsc.returncode == 0:
            results["TypeScript"] = "PASS"
        else:
            results["TypeScript"] = "FAIL"
            overall_ok = False

        print("\n-> Running frontend Vitest suite ...")
        fe_test = _run_cmd([pm_bin, "run", "test"], FRONTEND_DIR)
        if fe_test.returncode == 0:
            results["Frontend tests"] = "PASS"
        else:
            results["Frontend tests"] = "FAIL"
            overall_ok = False

    if run_build:
        print("\n-> Running frontend production build ...")
        pm_bin = env_info["pm_bin"]
        fe_build = _run_cmd([pm_bin, "run", "build"], FRONTEND_DIR)
        if fe_build.returncode == 0:
            results["Production build"] = "PASS"
        else:
            results["Production build"] = "FAIL"
            overall_ok = False

    _banner("Preflight Summary")
    for label, status in results.items():
        print(f"  {label:<28}: {status}")

    if not overall_ok:
        print("\nOne or more preflight checks failed.")
        print("Inspect the test/build output above before launching.")
        print("If you are intentionally bypassing known failing tests to start services, run:")
        print("  python run.py --no-tests")
    return overall_ok


def _port_in_use(port: int) -> bool:
    for family, addr in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
        try:
            with socket.socket(family, socket.SOCK_STREAM) as sock:
                sock.settimeout(0.5)
                if sock.connect_ex((addr, port)) == 0:
                    return True
        except OSError:
            pass
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("0.0.0.0", port))
    except OSError:
        return True
    return False


def _stream_pipe(pipe, prefix: str) -> None:
    try:
        for line in iter(pipe.readline, ""):
            if line:
                sys.stdout.write(f"[{prefix}] {line}")
                sys.stdout.flush()
    except Exception:
        pass
    finally:
        try:
            pipe.close()
        except Exception:
            pass


def _terminate_process_tree(proc: subprocess.Popen[str], name: str) -> None:
    if proc.poll() is not None:
        return
    print(f"Stopping {name} (PID {proc.pid}) ...")
    try:
        if _is_windows():
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                capture_output=True,
                check=False,
            )
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            proc.wait(timeout=5)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def _wait_for_health(proc: subprocess.Popen[str], timeout_sec: float = 30.0) -> bool:
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(BACKEND_HEALTH_URL, timeout=1.5) as resp:
                if resp.status == 200:
                    return True
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(0.5)
    return False


def start_services(active_py: Path, env_info: Dict[str, str]) -> int:
    """Start FastAPI backend, wait for /api/health, then start Vite frontend."""
    _banner("Phase 4: Starting Voyeger Backend & Frontend")

    if _port_in_use(BACKEND_PORT):
        print(f"ERROR: Port {BACKEND_PORT} is already in use. Stop the conflicting process first.")
        return 1
    if _port_in_use(FRONTEND_PORT):
        print(f"ERROR: Port {FRONTEND_PORT} is already in use. Stop the conflicting process first.")
        return 1

    popen_kwargs: dict = {
        "stdout": subprocess.PIPE,
        "stderr": subprocess.STDOUT,
        "text": True,
        "encoding": "utf-8",
        "errors": "replace",
    }
    if _is_windows():
        popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        popen_kwargs["preexec_fn"] = os.setsid

    backend_cmd = [
        str(active_py),
        "-m",
        "uvicorn",
        "server.main:app",
        "--host",
        BACKEND_HOST,
        "--port",
        str(BACKEND_PORT),
    ]
    print(f"Starting backend: {' '.join(backend_cmd)}")
    backend_proc = subprocess.Popen(backend_cmd, cwd=str(BACKEND_DIR), **popen_kwargs)
    threading.Thread(target=_stream_pipe, args=(backend_proc.stdout, "backend"), daemon=True).start()

    print(f"Waiting for backend readiness at {BACKEND_HEALTH_URL} ...")
    if not _wait_for_health(backend_proc, timeout_sec=30.0):
        print("ERROR: Backend failed to become healthy on /api/health.")
        _terminate_process_tree(backend_proc, "backend")
        return 1
    print(f"  [OK] Backend healthy at http://localhost:{BACKEND_PORT}")

    pm_bin = env_info["pm_bin"]
    frontend_cmd = [pm_bin, "run", "dev"]
    print(f"Starting frontend: {' '.join(frontend_cmd)}")
    frontend_proc = subprocess.Popen(frontend_cmd, cwd=str(FRONTEND_DIR), **popen_kwargs)
    threading.Thread(target=_stream_pipe, args=(frontend_proc.stdout, "frontend"), daemon=True).start()

    print("\n" + "-" * 64)
    print(f"  Voyeger Frontend : {FRONTEND_URL}")
    print(f"  Voyeger Backend  : http://localhost:{BACKEND_PORT}")
    print(f"  Health Endpoint  : {BACKEND_HEALTH_URL}")
    print("  Press Ctrl+C to stop both services cleanly.")
    print("-" * 64 + "\n")

    exit_code = 0
    try:
        while True:
            b_rc = backend_proc.poll()
            f_rc = frontend_proc.poll()
            if b_rc is not None:
                print(f"\nERROR: Backend exited unexpectedly with code {b_rc}.")
                exit_code = b_rc or 1
                break
            if f_rc is not None:
                print(f"\nERROR: Frontend exited unexpectedly with code {f_rc}.")
                exit_code = f_rc or 1
                break
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nReceived Ctrl+C — shutting down Voyeger services...")
    finally:
        _terminate_process_tree(frontend_proc, "frontend")
        _terminate_process_tree(backend_proc, "backend")

    return exit_code


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Voyeger — Clone-and-Run Project Launcher",
    )
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "--check",
        action="store_true",
        help="Inspect prerequisites and repository configuration without modifying files",
    )
    mode_group.add_argument(
        "--setup",
        action="store_true",
        help="Install project dependencies and initialize missing .env/DB/pack without starting services",
    )
    mode_group.add_argument(
        "--test",
        action="store_true",
        help="Run backend validation/tests, TypeScript check, and frontend tests without starting services",
    )
    mode_group.add_argument(
        "--build",
        action="store_true",
        help="Run frontend production build without starting services",
    )
    mode_group.add_argument(
        "--no-tests",
        action="store_true",
        help="Skip test/build checks and start backend + frontend directly",
    )

    args = parser.parse_args()
    env_info = check_prerequisites()

    if args.check:
        ensure_setup(env_info, check_only=True)
        return

    active_py = ensure_setup(env_info, check_only=False)

    if args.setup:
        print("\nSetup complete. Run 'python run.py' to validate and start Voyeger.")
        return

    if args.test:
        ok = run_preflight_checks(active_py, env_info, run_tests=True, run_build=False)
        sys.exit(0 if ok else 1)

    if args.build:
        ok = run_preflight_checks(active_py, env_info, run_tests=False, run_build=True)
        sys.exit(0 if ok else 1)

    if not args.no_tests:
        ok = run_preflight_checks(active_py, env_info, run_tests=True, run_build=True)
        if not ok:
            sys.exit(1)

    rc = start_services(active_py, env_info)
    sys.exit(rc)


if __name__ == "__main__":
    main()
