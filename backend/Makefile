PYTHON ?= python
VENV_PY ?= .venv/bin/python
ifeq ($(OS),Windows_NT)
	VENV_PY = .venv/Scripts/python.exe
endif

.PHONY: install migrate seed import cleanup geo-resolve geo-apply links media todo build-pack publish run test check lint

install:
	$(PYTHON) -m venv .venv
	$(VENV_PY) -m pip install -r requirements.txt

migrate:
	$(VENV_PY) -m alembic upgrade head

seed:
	$(VENV_PY) -m pipeline.seed

import:
	$(VENV_PY) -m pipeline.import_incoming

cleanup:
	$(VENV_PY) -m pipeline.cleanup_text

geo-resolve:
	$(VENV_PY) -m pipeline.resolve_geo

geo-apply:
	$(VENV_PY) -m pipeline.apply_geo

links:
	$(VENV_PY) -m pipeline.compute_links

media:
	$(VENV_PY) -m pipeline.ingest_media

todo:
	$(VENV_PY) -m pipeline.todo_report

build-pack:
	$(VENV_PY) -m pipeline.validate
	$(VENV_PY) -m pipeline.build_pack

publish:
	$(VENV_PY) -m pipeline.validate
	$(VENV_PY) -m pipeline.build_pack --bump

run:
	$(VENV_PY) -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload

test:
	$(VENV_PY) -m pytest -v

check:
	$(VENV_PY) -m pipeline.check_local

lint:
	$(VENV_PY) -m compileall -q server pipeline tests
