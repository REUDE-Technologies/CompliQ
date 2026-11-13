"""Finds the 14 photo folders in an inspection input folder and maps each photo to a position code.

Expected input (folder names are matched loosely: "B1-SS", "B1_SS", "Blade 1/SS", "blade1 suction" all work):

    WTG-001_2026-11-04/
      B1-SS/  B1-LE/  B1-PS/  B1-TE/      20 photos each, P01 (root) -> P20 (tip)
      B2-SS/  ...     B3-TE/
      NACELLE/                            nacelle / rotor photos (any number up to the setting)
      TOWER/                              tower / pole photos (any number up to the setting)

A blade folder maps by file number when every photo is named with its point (01..20, P05, B1-SS-07),
otherwise by sort order, which then needs exactly 20 photos.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import Config
from .photo_meta import read_meta
from .scheme import (BLADES, COMPONENT_NAMES, POINTS_PER_SIDE, SIDES, all_side_keys, blade_code,
                     component_code, side_key)

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".bmp"}
MAX_DEPTH = 3

_SIDE_WORDS = {"ss": "SS", "le": "LE", "ps": "PS", "te": "TE",
               "suction": "SS", "leading": "LE", "pressure": "PS", "trailing": "TE"}
_BLADE_RE = re.compile(r"(?<![a-z0-9])(?:b|blade|bld)[ _\-]*([123])(?![0-9])")
_SIDE_RE = re.compile(r"(?<![a-z])(ss|le|ps|te|suction|leading|pressure|trailing)(?![a-z])")
_NACELLE_RE = re.compile(r"nacelle|nasal|nacel|rotor|spinner|(?<![a-z])hub(?![a-z])|(?<![a-z])nac(?![a-z])")
_TOWER_RE = re.compile(r"tower|pole|(?<![a-z])twr(?![a-z])|(?<![a-z])mast(?![a-z])")
_POINT_NUM_RE = re.compile(r"(?:^|[-_ .])(?:p|pt|point)?[-_ ]?(0[1-9]|1[0-9]|20|[1-9])$", re.IGNORECASE)
_TURBINE_RE = re.compile(r"([A-Za-z]{2,6}-?\d{1,5})")
_DATE_RE = re.compile(r"(20\d{2})[-_]?(\d{2})[-_]?(\d{2})")


def natural_key(p: Path) -> list[Any]:
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", p.name)]


def classify_folder(rel: str) -> tuple[str, str] | None:
    """('blade', 'B1-SS') | ('nacelle', 'nacelle') | ('tower', 'tower') | None."""
    s = rel.lower().replace("\\", "/")
    b, side = _BLADE_RE.search(s), None
    if b:
        tail = s[b.end():]
        m = _SIDE_RE.search(tail) or _SIDE_RE.search(s[:b.start()])
        side = _SIDE_WORDS[m.group(1)] if m else None
    if b and side:
        return "blade", side_key(int(b.group(1)), side)
    if _NACELLE_RE.search(s):
        return "nacelle", "nacelle"
    if _TOWER_RE.search(s):
        return "tower", "tower"
    return None


def list_photos(folder: Path) -> list[Path]:
    return sorted((p for p in folder.iterdir()
                   if p.is_file() and p.suffix.lower() in IMAGE_EXTS and not p.name.startswith(".")),
                  key=natural_key)


def point_number(stem: str) -> int | None:
    m = _POINT_NUM_RE.search(stem)
    return int(m.group(1)) if m else None


@dataclass
class FolderMatch:
    key: str                       # "B1-SS", "nacelle" or "tower"
    group: str                     # "blade", "nacelle" or "tower"
    path: Path | None = None
    photos: list[Path] = field(default_factory=list)
    assignment: dict[str, Path] = field(default_factory=dict)   # position code -> photo
    unavailable: dict[str, str] = field(default_factory=dict)   # position code -> reason
    mode: str = "order"            # "numbered" | "order" | "not_filmed" | "missing"
    reversed: bool = False
    issues: list[str] = field(default_factory=list)             # block the run
    warnings: list[str] = field(default_factory=list)

    def to_dict(self, root: Path) -> dict[str, Any]:
        return {
            "key": self.key, "group": self.group,
            "path": str(self.path.relative_to(root)) if self.path else None,
            "photo_count": len(self.photos), "mode": self.mode, "reversed": self.reversed,
            "assigned": len(self.assignment), "unavailable": len(self.unavailable),
            "issues": self.issues, "warnings": self.warnings,
            "first_photo": self.photos[0].name if self.photos else None,
            "last_photo": self.photos[-1].name if self.photos else None,
        }


@dataclass
class PlannedItem:
    code: str
    group: str                      # "blade" | "nacelle" | "tower"
    key: str
    photo: Path | None
    unavailable_reason: str | None = None


@dataclass
class ScanResult:
    input_dir: Path
    folders: dict[str, FolderMatch]
    unrecognised: list[str]
    issues: list[str]
    warnings: list[str]
    suggested_turbine: str | None
    suggested_date: str | None

    @property
    def ok(self) -> bool:
        return not self.issues and not any(f.issues for f in self.folders.values())

    def plan(self, include_components: bool = True) -> list[PlannedItem]:
        items: list[PlannedItem] = []
        for key in all_side_keys():
            fm = self.folders[key]
            blade, side = int(key[1]), key[3:]
            for p in range(1, POINTS_PER_SIDE + 1):
                code = blade_code(blade, side, p)
                items.append(PlannedItem(code, "blade", key, fm.assignment.get(code),
                                         fm.unavailable.get(code) or (None if code in fm.assignment
                                                                      else "no photo for this point")))
        if include_components:
            for comp in ("nacelle", "tower"):
                fm = self.folders[comp]
                for code, photo in fm.assignment.items():
                    items.append(PlannedItem(code, comp, comp, photo))
        return items

    def to_dict(self) -> dict[str, Any]:
        blade_photos = sum(len(self.folders[k].assignment) for k in all_side_keys())
        return {
            "input_dir": str(self.input_dir), "ok": self.ok,
            "folders": {k: f.to_dict(self.input_dir) for k, f in self.folders.items()},
            "unrecognised": self.unrecognised, "issues": self.issues, "warnings": self.warnings,
            "suggested_turbine": self.suggested_turbine, "suggested_date": self.suggested_date,
            "blade_photo_count": blade_photos,
            "nacelle_photo_count": len(self.folders["nacelle"].assignment),
            "tower_photo_count": len(self.folders["tower"].assignment),
        }


def _photo_dirs(root: Path) -> list[Path]:
    found: list[Path] = []

    def walk(d: Path, depth: int) -> None:
        try:
            children = sorted((c for c in d.iterdir() if c.is_dir() and not c.name.startswith(".")),
                              key=natural_key)
        except OSError:
            return
        for c in children:
            if c.name.endswith("_qa"):
                continue
            if list_photos(c):
                found.append(c)
            if depth < MAX_DEPTH:
                walk(c, depth + 1)

    walk(root, 1)
    return found


def _sort_photos(photos: list[Path], order: str, cfg: Config, fm: FolderMatch) -> list[Path]:
    if order != "capture_time":
        return photos
    tz = cfg.get("inspection.timezone", "+05:30")
    times = {p: read_meta(p, tz)["captured_at"] for p in photos}
    if any(t is None for t in times.values()):
        fm.warnings.append("some photos have no capture time; sorted by file name instead")
        return photos
    return sorted(photos, key=lambda p: (times[p], natural_key(p)))


def _assign_blade(fm: FolderMatch, order: str, reverse: bool, cfg: Config) -> None:
    blade, side = int(fm.key[1]), fm.key[3:]
    numbers = [point_number(p.stem) for p in fm.photos]
    if fm.photos and all(n is not None for n in numbers) and len(set(numbers)) == len(numbers):
        fm.mode = "numbered"
        for p, n in zip(fm.photos, numbers):
            fm.assignment[blade_code(blade, side, n)] = p  # type: ignore[arg-type]
        missing = [n for n in range(1, POINTS_PER_SIDE + 1) if n not in numbers]
        for n in missing:
            fm.unavailable[blade_code(blade, side, n)] = "no photo for this point"
        if missing:
            fm.warnings.append(f"no photo numbered {', '.join(f'{n:02d}' for n in missing)}; "
                               "those points will be 'unavailable'")
        return
    fm.mode = "order"
    if len(fm.photos) != POINTS_PER_SIDE:
        fm.issues.append(f"{len(fm.photos)} photos; expected {POINTS_PER_SIDE}. Add or remove photos, "
                         "or name them 01-20 (missing numbers become 'unavailable').")
        return
    ordered = _sort_photos(fm.photos, order, cfg, fm)
    if reverse:
        ordered = list(reversed(ordered))
    fm.reversed = reverse
    for i, p in enumerate(ordered, start=1):
        fm.assignment[blade_code(blade, side, i)] = p


def scan_input(input_dir: str | Path, cfg: Config, overrides: dict[str, dict] | None = None) -> ScanResult:
    """overrides: per folder key, {"reverse": bool, "not_filmed": "reason"}."""
    root = Path(input_dir).expanduser()
    overrides = overrides or {}
    folders: dict[str, FolderMatch] = {k: FolderMatch(k, "blade") for k in all_side_keys()}
    folders["nacelle"] = FolderMatch("nacelle", "nacelle")
    folders["tower"] = FolderMatch("tower", "tower")
    issues: list[str] = []
    warnings: list[str] = []
    unrecognised: list[str] = []

    if not root.is_dir():
        return ScanResult(root, folders, [], [f"Folder not found: {root}"], [], None, None)
    if list_photos(root):
        warnings.append("photos directly in the input folder are ignored; put them in the 14 sub-folders")

    for d in _photo_dirs(root):
        rel = str(d.relative_to(root))
        hit = classify_folder(rel)
        if not hit:
            unrecognised.append(rel)
            continue
        _, key = hit
        fm = folders[key]
        if fm.path is not None:
            # e.g. "B1-SS" and "B1-SS/rejects": keep the one whose own name is the match
            own_old = (classify_folder(fm.path.name) or (None, None))[1] == key
            own_new = (classify_folder(d.name) or (None, None))[1] == key
            nested = fm.path in d.parents or d in fm.path.parents
            if nested and own_old != own_new:
                ignored = d if own_old else fm.path
                fm.warnings.append(f"ignored '{ignored.relative_to(root)}'")
                if own_old:
                    continue
            else:
                fm.issues.append(f"two folders match {key}: '{fm.path.relative_to(root)}' and '{rel}'")
                continue
        fm.path, fm.photos = d, list_photos(d)
    if unrecognised:
        warnings.append("folders not recognised (ignored): " + ", ".join(unrecognised))

    order = cfg.get("input.order", "name")
    default_reverse = cfg.get("input.direction", "root_to_tip") == "tip_to_root"
    for key in all_side_keys():
        fm, ov = folders[key], overrides.get(key, {})
        if ov.get("not_filmed"):
            fm.mode, fm.issues = "not_filmed", []
            blade, side = int(key[1]), key[3:]
            for n in range(1, POINTS_PER_SIDE + 1):
                fm.unavailable[blade_code(blade, side, n)] = str(ov["not_filmed"])
            fm.warnings.append(f"marked not filmed: {ov['not_filmed']}")
            continue
        if fm.path is None:
            fm.mode = "missing"
            fm.issues.append("folder not found. Add it, or mark this side as not filmed.")
            continue
        if fm.issues:
            continue
        _assign_blade(fm, order, default_reverse != bool(ov.get("reverse", False)), cfg)

    for comp in ("nacelle", "tower"):
        fm = folders[comp]
        limit = int(cfg.get(f"input.{comp}_max_photos", 40 if comp == "nacelle" else 60))
        if fm.path is None:
            fm.mode = "missing"
            fm.warnings.append(f"no {COMPONENT_NAMES[comp].lower()} folder found; the package will have "
                               f"no {comp} images")
            continue
        if fm.issues:
            continue
        if len(fm.photos) > limit:
            fm.issues.append(f"{len(fm.photos)} photos; the limit is {limit} "
                             f"(change input.{comp}_max_photos in Settings)")
            continue
        for i, p in enumerate(_sort_photos(fm.photos, order, cfg, fm), start=1):
            fm.assignment[component_code(comp, i)] = p

    turbine = date = None
    for name in (root.name, root.parent.name):
        if not turbine and (m := _TURBINE_RE.search(name)):
            turbine = m.group(1).upper()
        if not date and (m := _DATE_RE.search(name)):
            date = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return ScanResult(root, folders, unrecognised, issues, warnings, turbine, date)


__all__ = ["scan_input", "ScanResult", "FolderMatch", "PlannedItem", "classify_folder", "point_number",
           "IMAGE_EXTS", "BLADES", "SIDES"]
