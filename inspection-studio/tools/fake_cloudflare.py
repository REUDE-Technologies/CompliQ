"""A local stand-in for the two Cloudflare APIs the tool uses, for tests and for trying uploads offline.

    D1:  POST /client/v4/accounts/{account}/d1/database/{db}/query   ({sql, params} or {batch: [...]})
    R2:  S3 path-style  PUT/GET/HEAD/DELETE /{bucket}/{key}  and  GET /{bucket}?list-type=2

The database is a real SQLite file with the CompliQ migrations applied (the same engine D1 runs), so the tool's
SQL is checked against the real tables and constraints. Images are stored as files.

    python tools/fake_cloudflare.py --db fake.sqlite --r2 fake_r2 --port 8789
    -> in the tool's Settings → Cloudflare: API base http://127.0.0.1:8789/client/v4,
       R2 endpoint http://127.0.0.1:8789, token test-token, R2 key test-key / test-secret, any account and DB id.

This is a test double, not Cloudflare. It does not check permissions beyond the token and key id.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import threading
from email.utils import formatdate
from pathlib import Path
from typing import Callable
from xml.sax.saxutils import escape

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

MIGRATIONS = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "d1"


def apply_migrations(db_path: str | Path, migrations_dir: str | Path = MIGRATIONS) -> None:
    con = sqlite3.connect(db_path, isolation_level=None)
    con.execute("PRAGMA foreign_keys = ON")
    for f in sorted(Path(migrations_dir).glob("*.sql")):
        con.executescript("BEGIN;\n" + f.read_text(encoding="utf-8") + "\nCOMMIT;")
    con.close()


def _s3_error(code: str, status: int, message: str = "") -> Response:
    body = f"<?xml version='1.0' encoding='UTF-8'?><Error><Code>{code}</Code><Message>{escape(message or code)}</Message></Error>"
    return Response(body, status_code=status, media_type="application/xml")


def create_app(db_path: str | Path, r2_dir: str | Path, token: str = "test-token", access_key: str = "test-key",
               on_put: Callable[[str, bytes, str], None] | None = None) -> FastAPI:
    app = FastAPI(title="fake Cloudflare (D1 + R2)")
    r2 = Path(r2_dir)
    r2.mkdir(parents=True, exist_ok=True)
    lock = threading.Lock()
    app.state.d1_calls = 0
    app.state.r2_puts = 0

    def run(statements: list[dict]) -> list[dict]:
        con = sqlite3.connect(db_path, isolation_level=None, timeout=30)
        con.execute("PRAGMA foreign_keys = ON")
        out = []
        try:
            con.execute("BEGIN")
            for st in statements:
                before = con.total_changes
                cur = con.execute(st["sql"], st.get("params") or [])
                cols = [d[0] for d in cur.description] if cur.description else []
                rows = [dict(zip(cols, r)) for r in cur.fetchall()]
                out.append({"results": rows, "success": True,
                            "meta": {"changes": con.total_changes - before, "last_row_id": cur.lastrowid}})
            con.execute("COMMIT")
        except Exception:
            con.execute("ROLLBACK")
            raise
        finally:
            con.close()
        return out

    @app.post("/client/v4/accounts/{account}/d1/database/{db}/query")
    async def d1_query(account: str, db: str, request: Request):
        if request.headers.get("authorization") != f"Bearer {token}":
            return JSONResponse({"success": False, "errors": [{"code": 10000, "message": "Authentication error"}]}, 403)
        body = await request.json()
        statements = body["batch"] if "batch" in body else [{"sql": body["sql"], "params": body.get("params")}]
        app.state.d1_calls += 1
        try:
            with lock:
                result = run(statements)
        except sqlite3.Error as e:
            return JSONResponse({"success": False, "errors": [{"code": 7500, "message": f"{e}: SQLITE_ERROR"}],
                                 "messages": [], "result": []}, 400)
        return {"success": True, "errors": [], "messages": [], "result": result}

    def authorised(request: Request) -> bool:
        return f"Credential={access_key}/" in request.headers.get("authorization", "")

    def meta_path(key: str) -> Path:
        return r2 / (key + ".__meta__.json")

    @app.api_route("/{bucket}", methods=["GET", "HEAD"])
    async def list_bucket(bucket: str, request: Request):
        if not authorised(request):
            return _s3_error("InvalidAccessKeyId", 403)
        prefix = request.query_params.get("prefix", "")
        keys = sorted(str(p.relative_to(r2)).replace("\\", "/") for p in r2.rglob("*")
                      if p.is_file() and not p.name.endswith(".__meta__.json"))
        keys = [k for k in keys if k.startswith(prefix)][: int(request.query_params.get("max-keys", 1000))]
        items = "".join(f"<Contents><Key>{escape(k)}</Key><Size>{(r2 / k).stat().st_size}</Size></Contents>" for k in keys)
        body = (f"<?xml version='1.0' encoding='UTF-8'?><ListBucketResult><Name>{bucket}</Name><Prefix>{escape(prefix)}"
                f"</Prefix><KeyCount>{len(keys)}</KeyCount><IsTruncated>false</IsTruncated>{items}</ListBucketResult>")
        return Response(body, media_type="application/xml")

    @app.api_route("/{bucket}/{key:path}", methods=["PUT", "GET", "HEAD", "DELETE"])
    async def obj(bucket: str, key: str, request: Request):
        if not authorised(request):
            return _s3_error("InvalidAccessKeyId", 403)
        path = r2 / key
        if request.method == "PUT":
            data = await request.body()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            meta = {k[len("x-amz-meta-"):]: v for k, v in request.headers.items() if k.lower().startswith("x-amz-meta-")}
            ctype = request.headers.get("content-type", "application/octet-stream")
            meta_path(key).write_text(json.dumps({"meta": meta, "type": ctype}))
            app.state.r2_puts += 1
            if on_put:
                on_put(key, data, ctype)
            return Response(status_code=200, headers={"ETag": f'"{hashlib.md5(data).hexdigest()}"'})
        if request.method == "DELETE":
            for p in (path, meta_path(key)):
                if p.exists():
                    p.unlink()
            return Response(status_code=204)
        if not path.exists():
            return Response(status_code=404) if request.method == "HEAD" else _s3_error("NoSuchKey", 404)
        info = json.loads(meta_path(key).read_text()) if meta_path(key).exists() else {"meta": {}, "type": "application/octet-stream"}
        data = path.read_bytes()
        headers = {"Content-Type": info["type"], "Content-Length": str(len(data)), "ETag": f'"{hashlib.md5(data).hexdigest()}"',
                   "Last-Modified": formatdate(path.stat().st_mtime, usegmt=True)}
        headers.update({f"x-amz-meta-{k}": v for k, v in info["meta"].items()})
        if request.method == "HEAD":
            return Response(status_code=200, headers=headers)
        return Response(data, headers=headers)

    return app


if __name__ == "__main__":
    import uvicorn

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default="fake_d1.sqlite", help="SQLite file; created with the migrations if missing")
    ap.add_argument("--r2", default="fake_r2", help="folder for the images")
    ap.add_argument("--port", type=int, default=8789)
    args = ap.parse_args()
    if not Path(args.db).exists():
        apply_migrations(args.db)
        print(f"Created {args.db} with the CompliQ migrations")
    print(f"Fake Cloudflare on http://127.0.0.1:{args.port}  (token test-token, R2 key test-key / test-secret)")
    uvicorn.run(create_app(args.db, args.r2), host="127.0.0.1", port=args.port, log_level="warning")
