import socket
import sys
import threading
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from compliq_studio.config import load_config  # noqa: E402
from compliq_studio.pipeline import RunRequest, run_inspection  # noqa: E402
from compliq_studio.sample import SAMPLE_CAMERA, make_sample  # noqa: E402

DATE = "2026-11-04T10:30:00+05:30"


@pytest.fixture
def cfg(tmp_path):
    c = load_config(ROOT)
    c.settings["package"]["output_dir"] = str(tmp_path / "out")
    c.settings["package"]["schema_version"] = "1.1"
    return c


@pytest.fixture(scope="session")
def sample_dir(tmp_path_factory):
    """Small synthetic inspection (258 photos at 480x360) shared by the tests."""
    return make_sample(tmp_path_factory.mktemp("sample"), size=(480, 360))


def demo_request(sample_dir, **kw):
    base = dict(input_dir=str(sample_dir), turbine_code="WTG-001", inspection_date=DATE, blade_length_m=48.5,
                model_path="demo", camera=dict(SAMPLE_CAMERA))
    base.update(kw)
    return RunRequest(**base)


@pytest.fixture
def demo_run(cfg, sample_dir):
    """A finished demo run; returns (cfg, workspace key, result)."""
    result = run_inspection(demo_request(sample_dir), cfg)
    return cfg, result["workspace"], result


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture
def fake_cloud(tmp_path):
    """tools/fake_cloudflare.py in a thread: D1 = SQLite with the real CompliQ migrations, R2 = a folder.
    Yields (CloudSettings, app, db_path) with one extra organization, 'Acme Wind' (id org-acme)."""
    import sqlite3

    import uvicorn
    from fake_cloudflare import apply_migrations, create_app

    from compliq_studio.cloud import CloudSettings

    db = tmp_path / "d1.sqlite"
    apply_migrations(db)
    con = sqlite3.connect(db)
    con.execute("INSERT INTO organizations (id, name, org_key) VALUES ('org-acme', 'Acme Wind', 'acmewind')")
    con.commit()
    con.close()
    app = create_app(db, tmp_path / "r2")
    port = free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    deadline = time.time() + 10
    while not server.started and time.time() < deadline:
        time.sleep(0.05)
    cs = CloudSettings(account_id="acc", d1_database_id="db", api_token="test-token", r2_access_key_id="test-key",
                       r2_secret_access_key="test-secret", api_base=f"http://127.0.0.1:{port}/client/v4",
                       r2_endpoint=f"http://127.0.0.1:{port}")
    yield cs, app, db
    server.should_exit = True
