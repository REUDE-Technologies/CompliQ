"""Loads config/classes.yaml, config/severity_rules.yaml and config/settings.yaml
(plus settings.local.yaml, which holds what the app's Settings screen saved)."""
from __future__ import annotations

import copy
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .scheme import DEFAULT_ZONES, SIDES

PROJECT_ROOT = Path(os.environ.get("COMPLIQ_STUDIO_HOME", Path(__file__).resolve().parent.parent))


@dataclass(frozen=True)
class ClassDef:
    code: str
    label: str
    cat_min: int
    cat_max: int
    threshold: float
    sides: tuple[str, ...] | None = None


@dataclass
class SeverityRules:
    zones: dict[str, tuple[int, int]] = field(default_factory=lambda: dict(DEFAULT_ZONES))
    length_steps: list[dict[str, float]] = field(default_factory=list)
    tip_zone: str = "tip"
    tip_add: int = 1
    tip_classes: frozenset[str] = frozenset()


@dataclass
class Config:
    root: Path
    classes: dict[str, ClassDef]
    model_name_map: dict[str, str]
    severity: SeverityRules
    settings: dict[str, Any]

    # ---- helpers -------------------------------------------------------
    def get(self, dotted: str, default: Any = None) -> Any:
        node: Any = self.settings
        for part in dotted.split("."):
            if not isinstance(node, dict) or part not in node:
                return default
            node = node[part]
        return node

    def resolve_path(self, value: str | os.PathLike | None) -> Path | None:
        """Relative paths in settings are relative to the project folder."""
        if value in (None, ""):
            return None
        p = Path(value).expanduser()
        return p if p.is_absolute() else (self.root / p)

    @property
    def output_dir(self) -> Path:
        return self.resolve_path(self.get("package.output_dir", "output"))  # type: ignore[return-value]

    def class_for_model_name(self, model_name: str) -> str | None:
        """Map a class name from model.pt to one of the six codes, or None if unknown."""
        if model_name in self.model_name_map:
            target = self.model_name_map[model_name]
            return target if target in self.classes else None
        key = normalise_name(model_name)
        for code, cdef in self.classes.items():
            if key in (normalise_name(code), normalise_name(cdef.label)):
                return code
        return None


def normalise_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(name).lower()).strip("_")


def deep_merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def _read_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path.name}: expected a mapping at the top level")
    return data


def _parse_classes(raw: dict) -> dict[str, ClassDef]:
    classes: dict[str, ClassDef] = {}
    for code, spec in (raw.get("classes") or {}).items():
        lo, hi = (int(x) for x in spec["cat"])
        if not (1 <= lo <= hi <= 5):
            raise ValueError(f"classes.yaml: {code} has an invalid CAT range {spec['cat']}")
        thr = float(spec.get("threshold", 0.30))
        if not 0 <= thr <= 1:
            raise ValueError(f"classes.yaml: {code} threshold must be between 0 and 1")
        sides = spec.get("sides")
        if sides:
            bad = [s for s in sides if s not in SIDES]
            if bad:
                raise ValueError(f"classes.yaml: {code} has unknown sides {bad}")
        classes[code] = ClassDef(code, str(spec.get("label", code)), lo, hi, thr, tuple(sides) if sides else None)
    if not classes:
        raise ValueError("classes.yaml defines no classes")
    return classes


def _parse_severity(raw: dict) -> SeverityRules:
    zones = {k: (int(v[0]), int(v[1])) for k, v in (raw.get("zones") or DEFAULT_ZONES).items()}
    covered = sorted(p for lo, hi in zones.values() for p in range(lo, hi + 1))
    if covered != list(range(1, 21)):
        raise ValueError("severity_rules.yaml: zones must cover points 1-20 exactly once")
    steps = []
    for step in raw.get("length_steps") or []:
        if "above_mm" not in step and "from_mm" not in step:
            raise ValueError("severity_rules.yaml: each length step needs above_mm or from_mm")
        steps.append({k: float(v) for k, v in step.items()})
    tip = raw.get("tip_bonus") or {}
    return SeverityRules(
        zones=zones,
        length_steps=steps,
        tip_zone=str(tip.get("zone", "tip")),
        tip_add=int(tip.get("add", 0)),
        tip_classes=frozenset(tip.get("classes") or []),
    )


def load_config(root: str | os.PathLike | None = None) -> Config:
    root_path = Path(root) if root else PROJECT_ROOT
    cdir = root_path / "config"
    raw_classes = _read_yaml(cdir / "classes.yaml")
    settings = deep_merge(_read_yaml(cdir / "settings.yaml"), _read_yaml(cdir / "settings.local.yaml"))
    return Config(
        root=root_path,
        classes=_parse_classes(raw_classes),
        model_name_map={str(k): str(v) for k, v in (raw_classes.get("model_name_map") or {}).items()},
        severity=_parse_severity(_read_yaml(cdir / "severity_rules.yaml")),
        settings=settings,
    )


def save_local_settings(updates: dict, root: str | os.PathLike | None = None) -> Path:
    """Merge `updates` into config/settings.local.yaml (what the Settings screen saves)."""
    root_path = Path(root) if root else PROJECT_ROOT
    path = root_path / "config" / "settings.local.yaml"
    merged = deep_merge(_read_yaml(path), updates)
    path.write_text(
        "# Saved by the app's Settings screen. Overrides settings.yaml. Safe to delete.\n"
        + yaml.safe_dump(merged, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    return path
