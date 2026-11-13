"""Where one inspection's files live.

    output/
      WTG-001_2026-11-04/        the package — upload exactly this folder (manifest.json, points.json, images/)
      WTG-001_2026-11-04_qa/     stays local, never uploaded
        annotated/               annotated QA copies (JPEG), one per photo
        webp/                    clean WebP cache the package is built from
        inspection.json          turbine, date, inspection_id, model
        run.json                 raw model results per position code
        review.json              approvals, removed boxes, points marked unusable
        validation.json          last validator report
        upload.json              Cloudflare upload result
        qa_note.md               failed / unavailable points with reasons (ML2 hand-over)
        run_log.txt
"""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any

KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$")


def safe_name(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "-", text.strip()).strip("-.") or "inspection"


def write_json_atomic(path: Path, data: Any, indent: int | None = 2) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=indent, ensure_ascii=False) + ("\n" if indent else ""), encoding="utf-8")
    for attempt in range(10):  # Windows: another process may have the file open for a moment
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            time.sleep(0.05 * (attempt + 1))
    os.replace(tmp, path)


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


class Workspace:
    def __init__(self, output_dir: str | Path, key: str):
        if not KEY_RE.match(key):
            raise ValueError(f"invalid inspection folder name: {key!r}")
        self.output_dir = Path(output_dir)
        self.key = key
        self.package_dir = self.output_dir / key
        self.qa_dir = self.output_dir / f"{key}_qa"

    # ---- paths -----------------------------------------------------------
    images_dir = property(lambda self: self.package_dir / "images")
    webp_dir = property(lambda self: self.qa_dir / "webp")
    annotated_dir = property(lambda self: self.qa_dir / "annotated")
    log_path = property(lambda self: self.qa_dir / "run_log.txt")
    qa_note_path = property(lambda self: self.qa_dir / "qa_note.md")

    def qa_file(self, name: str) -> Path:
        return self.qa_dir / f"{name}.json"

    def read(self, name: str, default: Any = None) -> Any:
        return read_json(self.qa_file(name), default)

    def write(self, name: str, data: Any) -> None:
        write_json_atomic(self.qa_file(name), data)

    def exists(self) -> bool:
        return self.qa_file("inspection").exists()

    def log(self, message: str) -> None:
        self.qa_dir.mkdir(parents=True, exist_ok=True)
        with self.log_path.open("a", encoding="utf-8") as f:
            f.write(f"{datetime.now().isoformat(timespec='seconds')}  {message}\n")

    # ---- naming ----------------------------------------------------------
    @staticmethod
    def key_for(turbine_code: str, inspection_date: str) -> str:
        return f"{safe_name(turbine_code)}_{inspection_date[:10]}"

    @classmethod
    def list_all(cls, output_dir: str | Path) -> list["Workspace"]:
        out = Path(output_dir)
        if not out.is_dir():
            return []
        found = []
        for d in out.iterdir():
            if d.is_dir() and d.name.endswith("_qa") and (d / "inspection.json").exists():
                key = d.name[:-3]
                if KEY_RE.match(key):
                    found.append(cls(out, key))
        return sorted(found, key=lambda w: w.qa_file("inspection").stat().st_mtime, reverse=True)
