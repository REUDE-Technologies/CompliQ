"""Point scheme.

Blades (ML spec): 3 blades x 4 sides x 20 points = 240 position codes, B1-SS-01 ... B3-TE-20.
Components (schema 1.1, proposed in the PRD): nacelle NAC-01..NAC-nn, tower TWR-01..TWR-nn.
"""
from __future__ import annotations

import re

BLADES = (1, 2, 3)
SIDES = ("SS", "LE", "PS", "TE")
SIDE_NAMES = {
    "SS": "Suction side",
    "LE": "Leading edge",
    "PS": "Pressure side",
    "TE": "Trailing edge",
}
POINTS_PER_SIDE = 20
EXPECTED_BLADE_POINTS = len(BLADES) * len(SIDES) * POINTS_PER_SIDE  # 240

COMPONENTS = {"nacelle": "NAC", "tower": "TWR"}
COMPONENT_NAMES = {"nacelle": "Nacelle / rotor", "tower": "Tower"}
PREFIX_TO_COMPONENT = {v: k for k, v in COMPONENTS.items()}

DEFAULT_ZONES = {"root": (1, 7), "mid": (8, 14), "tip": (15, 20)}

BLADE_CODE_RE = re.compile(r"^B([1-3])-(SS|LE|PS|TE)-(0[1-9]|1[0-9]|20)$")
COMPONENT_CODE_RE = re.compile(r"^(NAC|TWR)-(\d{2})$")
ULID_RE = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")


def blade_code(blade: int, side: str, point: int) -> str:
    return f"B{blade}-{side}-{point:02d}"


def all_blade_codes() -> list[str]:
    """B1-SS-01 ... B3-TE-20, in dashboard order (blade, then side SS/LE/PS/TE, then root to tip)."""
    return [blade_code(b, s, p) for b in BLADES for s in SIDES for p in range(1, POINTS_PER_SIDE + 1)]


def side_key(blade: int, side: str) -> str:
    """Key for one blade side's photo folder, e.g. 'B1-SS'."""
    return f"B{blade}-{side}"


def all_side_keys() -> list[str]:
    return [side_key(b, s) for b in BLADES for s in SIDES]


def component_code(component: str, seq: int) -> str:
    return f"{COMPONENTS[component]}-{seq:02d}"


def parse_blade_code(code: str) -> tuple[int, str, int] | None:
    m = BLADE_CODE_RE.match(code or "")
    if not m:
        return None
    return int(m.group(1)), m.group(2), int(m.group(3))


def parse_component_code(code: str) -> tuple[str, int] | None:
    m = COMPONENT_CODE_RE.match(code or "")
    if not m or int(m.group(2)) < 1:
        return None
    return PREFIX_TO_COMPONENT[m.group(1)], int(m.group(2))


def zone_for(point: int, zones: dict[str, tuple[int, int]] | None = None) -> str:
    for name, (lo, hi) in (zones or DEFAULT_ZONES).items():
        if lo <= point <= hi:
            return name
    raise ValueError(f"point {point} is in no zone")


def distance_m(point: int, blade_length_m: float | None) -> float | None:
    """Distance from the blade root, even spacing: (point - 1) x L / 19 (ML spec)."""
    if not blade_length_m:
        return None
    return round((point - 1) * float(blade_length_m) / (POINTS_PER_SIDE - 1), 2)


def is_ulid(value: object) -> bool:
    return isinstance(value, str) and bool(ULID_RE.match(value))
