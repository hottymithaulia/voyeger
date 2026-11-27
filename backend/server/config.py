import os
from functools import lru_cache
from pathlib import Path
from typing import Tuple, List

from pydantic import BaseModel


def _load_dotenv(env_path: Path = Path(".env")) -> None:
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


class Settings(BaseModel):
    app_env: str = "dev"
    host: str = "0.0.0.0"
    port: int = 8000
    database_url: str = "sqlite:///./voyeger.db"
    admin_token: str = "change-me"
    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
    ]
    pack_dir: Path = Path("./pack")
    tiles_dir: Path = Path("./tiles")
    content_dir: Path = Path("./content")
    public_base_url: str = "http://localhost:8000"
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    wikivoyage_api: str = "https://en.wikivoyage.org/w/api.php"
    enrichment_ttl_hours: int = 168
    bhopal_bbox: Tuple[float, float, float, float] = (23.10, 77.25, 23.35, 77.55)
    required_languages: List[str] = ["en", "hi"]
    publish_statuses: List[str] = ["ready", "draft"]
    app_min_version: str = "1.0.0"
    rate_limit_per_minute: int = 60
    osm_user_agent: str = "VoyegerBhopal/1.0 (contact@voyeger.local)"

    @property
    def is_prod(self) -> bool:
        return self.app_env.lower() == "prod"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    _load_dotenv()

    def _split_csv(key: str, default: str) -> List[str]:
        raw = os.environ.get(key, default)
        return [item.strip() for item in raw.split(",") if item.strip()]

    bbox_raw = os.environ.get("BHOPAL_BBOX", "23.10,77.25,23.35,77.55")
    bbox_parts = [float(x.strip()) for x in bbox_raw.split(",")]
    if len(bbox_parts) != 4:
        raise ValueError("BHOPAL_BBOX must have 4 comma-separated floats: south,west,north,east")

    app_env = os.environ.get("APP_ENV", "dev")
    default_publish = "ready" if app_env.lower() == "prod" else "ready,draft"
    publish_statuses = [
        item for item in _split_csv("PUBLISH_STATUSES", default_publish) if item in {"ready", "draft"}
    ]

    return Settings(
        app_env=app_env,
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
        database_url=os.environ.get("DATABASE_URL", "sqlite:///./voyeger.db"),
        admin_token=os.environ.get("ADMIN_TOKEN", "change-me"),
        cors_origins=_split_csv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080",
        ),
        pack_dir=Path(os.environ.get("PACK_DIR", "./pack")),
        tiles_dir=Path(os.environ.get("TILES_DIR", "./tiles")),
        content_dir=Path(os.environ.get("CONTENT_DIR", "./content")),
        public_base_url=os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/"),
        overpass_url=os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter"),
        wikivoyage_api=os.environ.get("WIKIVOYAGE_API", "https://en.wikivoyage.org/w/api.php"),
        enrichment_ttl_hours=int(os.environ.get("ENRICHMENT_TTL_HOURS", "168")),
        bhopal_bbox=(bbox_parts[0], bbox_parts[1], bbox_parts[2], bbox_parts[3]),
        required_languages=_split_csv("REQUIRED_LANGUAGES", "en,hi"),
        publish_statuses=publish_statuses,
        app_min_version=os.environ.get("APP_MIN_VERSION", "1.0.0"),
        rate_limit_per_minute=int(os.environ.get("RATE_LIMIT_PER_MINUTE", "60")),
        osm_user_agent=os.environ.get(
            "OSM_USER_AGENT", "VoyegerBhopal/1.0 (contact@voyeger.local)"
        ),
    )
