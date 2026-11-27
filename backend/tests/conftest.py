from __future__ import annotations

import shutil
from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from pipeline.seed import write_seed_yaml
from server.config import get_settings
from server.db import Base, create_db_engine, get_db
from server.main import create_app
from server.routers.health import set_cached_version
from server.security import rate_limiter


@pytest.fixture()
def test_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[dict, None, None]:
    db_path = tmp_path / "test.db"
    pack_dir = tmp_path / "pack"
    tiles_dir = tmp_path / "tiles"
    content_dir = tmp_path / "content"
    pack_dir.mkdir(parents=True, exist_ok=True)
    tiles_dir.mkdir(parents=True, exist_ok=True)

    write_seed_yaml(content_dir, force=True)

    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("PACK_DIR", str(pack_dir))
    monkeypatch.setenv("TILES_DIR", str(tiles_dir))
    monkeypatch.setenv("CONTENT_DIR", str(content_dir))
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "100")

    get_settings.cache_clear()
    rate_limiter.reset()
    set_cached_version(0)

    engine = create_db_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

    app = create_app()

    def _override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db

    with TestClient(app) as client:
        yield {
            "client": client,
            "SessionLocal": TestingSessionLocal,
            "pack_dir": pack_dir,
            "tiles_dir": tiles_dir,
            "content_dir": content_dir,
            "tmp_path": tmp_path,
        }

    engine.dispose()
    get_settings.cache_clear()
