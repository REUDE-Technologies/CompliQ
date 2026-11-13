"""Model wrapper. Runs the Ultralytics model on the full-resolution, upright photo (ML spec step 6),
optionally on overlapping tiles for small defects, and returns boxes as 0-1 fractions of that frame."""
from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import numpy as np
from PIL import Image

from .imaging import sha256_file

DEMO_MODEL = "demo"   # special model path: replays *.truth.json sidecars made by the sample generator


@dataclass
class RawDetection:
    cls_name: str        # class name as the model reports it
    confidence: float
    x0: float            # box corners as fractions of the frame the model saw
    y0: float
    x1: float
    y1: float


class Detector(Protocol):
    names: dict[int, str]
    info: dict[str, Any]

    def detect(self, img: Image.Image, photo_path: Path | None = None) -> list[RawDetection]: ...


def model_info(model_path: str | Path, name: str | None = None, version: str | None = None) -> dict[str, Any]:
    """model_name / model_version from settings, else models/model.json (or <model>.json), else the file name."""
    if str(model_path) == DEMO_MODEL:
        return {"path": DEMO_MODEL, "model_name": name or "demo-sample-truth", "model_version": version or "0.0.0",
                "sha256": None, "demo": True}
    p = Path(model_path)
    meta: dict[str, Any] = {}
    for side in (p.with_suffix(".json"), p.parent / "model.json"):
        if side.exists():
            try:
                meta = json.loads(side.read_text(encoding="utf-8"))
                break
            except (OSError, json.JSONDecodeError):
                pass
    return {
        "path": str(p),
        "model_name": name or meta.get("model_name") or p.stem,
        "model_version": version or meta.get("model_version") or "0.0.0",
        "version_from": "settings" if version else ("model.json" if meta.get("model_version") else "default"),
        "sha256": sha256_file(p) if p.exists() else None,
        "demo": False,
    }


def _nms(boxes: np.ndarray, scores: np.ndarray, iou_thr: float = 0.5, ios_thr: float = 0.85) -> list[int]:
    """Greedy NMS that also drops a box mostly inside a stronger one (partial boxes cut by tile edges)."""
    order = scores.argsort()[::-1]
    areas = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
    keep: list[int] = []
    while order.size:
        i = int(order[0])
        keep.append(i)
        rest = order[1:]
        xx0 = np.maximum(boxes[i, 0], boxes[rest, 0])
        yy0 = np.maximum(boxes[i, 1], boxes[rest, 1])
        xx1 = np.minimum(boxes[i, 2], boxes[rest, 2])
        yy1 = np.minimum(boxes[i, 3], boxes[rest, 3])
        inter = np.clip(xx1 - xx0, 0, None) * np.clip(yy1 - yy0, 0, None)
        iou = inter / np.maximum(areas[i] + areas[rest] - inter, 1e-9)
        ios = inter / np.maximum(np.minimum(areas[i], areas[rest]), 1e-9)
        order = rest[(iou <= iou_thr) & (ios <= ios_thr)]
    return keep


def _tile_origins(length: int, tile: int, stride: int) -> list[int]:
    if length <= tile:
        return [0]
    xs = list(range(0, length - tile + 1, stride))
    if xs[-1] + tile < length:
        xs.append(length - tile)
    return xs


class UltralyticsDetector:
    def __init__(self, model_path: str | Path, imgsz: int = 1024, device: str | int | None = "auto",
                 tiled: bool = False, tile_size: int = 1280, tile_overlap: float = 0.2, conf_floor: float = 0.05,
                 info: dict[str, Any] | None = None):
        from ultralytics import YOLO  # imported here so demo mode and tests run without torch

        self.model = YOLO(str(model_path))
        self.names = {int(k): str(v) for k, v in dict(self.model.names).items()}
        self.imgsz = int(imgsz)
        self.device = None if device in (None, "", "auto") else device
        self.tiled = bool(tiled)
        self.tile_size = int(tile_size)
        self.tile_overlap = float(tile_overlap)
        self.conf_floor = float(conf_floor)
        self.info = info or model_info(model_path)
        self._lock = threading.Lock()

    def _predict(self, source: Any) -> list[Any]:
        with self._lock:
            return self.model.predict(source, imgsz=self.imgsz, conf=self.conf_floor, device=self.device,
                                      verbose=False)

    def detect(self, img: Image.Image, photo_path: Path | None = None) -> list[RawDetection]:
        w, h = img.size
        if not self.tiled:
            r = self._predict(img)[0]
            if r.boxes is None or len(r.boxes) == 0:
                return []
            xyxyn = r.boxes.xyxyn.cpu().numpy()
            conf = r.boxes.conf.cpu().numpy()
            cls = r.boxes.cls.cpu().numpy().astype(int)
            return [RawDetection(self.names.get(int(c), str(c)), float(s), *map(float, b))
                    for b, s, c in zip(xyxyn, conf, cls)]
        # SAHI-style: full frame + overlapping tiles, boxes mapped back to full-frame pixels, then merged
        tile = min(self.tile_size, max(w, h))
        stride = max(1, int(tile * (1 - self.tile_overlap)))
        origins = [(x, y) for y in _tile_origins(h, tile, stride) for x in _tile_origins(w, tile, stride)]
        all_boxes, all_scores, all_cls = [], [], []

        def collect(results: list[Any], offsets: list[tuple[int, int]]) -> None:
            for r, (ox, oy) in zip(results, offsets):
                if r.boxes is None or len(r.boxes) == 0:
                    continue
                b = r.boxes.xyxy.cpu().numpy() + np.array([ox, oy, ox, oy], dtype=np.float32)
                all_boxes.append(b)
                all_scores.append(r.boxes.conf.cpu().numpy())
                all_cls.append(r.boxes.cls.cpu().numpy().astype(int))

        collect(self._predict(img), [(0, 0)])
        for i in range(0, len(origins), 4):  # small batches keep a 2 GB GPU happy
            chunk = origins[i:i + 4]
            crops = [img.crop((x, y, min(x + tile, w), min(y + tile, h))) for x, y in chunk]
            collect(self._predict(crops), chunk)
        if not all_boxes:
            return []
        boxes, scores, classes = np.concatenate(all_boxes), np.concatenate(all_scores), np.concatenate(all_cls)
        out: list[RawDetection] = []
        for c in np.unique(classes):
            idx = np.where(classes == c)[0]
            for k in _nms(boxes[idx], scores[idx]):
                bx = boxes[idx][k]
                out.append(RawDetection(self.names.get(int(c), str(c)), float(scores[idx][k]),
                                        float(bx[0] / w), float(bx[1] / h), float(bx[2] / w), float(bx[3] / h)))
        return out


class DemoDetector:
    """Stands in for model.pt on sample data: replays the boxes the sample generator wrote to
    <photo>.truth.json. Lets the team try the review and upload flow before the model is ready."""

    def __init__(self, class_codes: list[str], info: dict[str, Any] | None = None):
        self.names = {i: c for i, c in enumerate(class_codes)}
        self.info = info or model_info(DEMO_MODEL)

    def detect(self, img: Image.Image, photo_path: Path | None = None) -> list[RawDetection]:
        if photo_path is None:
            return []
        side = photo_path.with_name(photo_path.name + ".truth.json")
        if not side.exists():
            return []
        data = json.loads(side.read_text(encoding="utf-8"))
        return [RawDetection(d["class"], float(d.get("confidence", 0.8)), *map(float, d["bbox"]))
                for d in data.get("detections", [])]


_cache: dict[tuple, Detector] = {}
_cache_lock = threading.Lock()


def load_detector(model_path: str, settings_model: dict[str, Any], class_codes: list[str],
                  conf_floor: float) -> Detector:
    """Cached per model file + settings, so a second run does not reload the weights."""
    if str(model_path) == DEMO_MODEL:
        return DemoDetector(class_codes)
    p = Path(model_path)
    if not p.exists():
        raise FileNotFoundError(f"Model not found: {p}. Put model.pt in the models folder or pick it in Setup.")
    key = (str(p.resolve()), p.stat().st_mtime, json.dumps(settings_model, sort_keys=True, default=str),
           round(conf_floor, 4))
    with _cache_lock:
        if key not in _cache:
            while len(_cache) >= 3:  # blade model + up to two component models
                _cache.pop(next(iter(_cache)))
            info = model_info(p, settings_model.get("name"), settings_model.get("version"))
            _cache[key] = UltralyticsDetector(
                p, imgsz=settings_model.get("imgsz", 1024), device=settings_model.get("device", "auto"),
                tiled=settings_model.get("tiled", False), tile_size=settings_model.get("tile_size", 1280),
                tile_overlap=settings_model.get("tile_overlap", 0.2), conf_floor=conf_floor, info=info)
        return _cache[key]
