"""Suggested CAT from class, size and zone (ML spec rule; thresholds in severity_rules.yaml)."""
from __future__ import annotations

from .config import ClassDef, SeverityRules


def suggest_severity(cdef: ClassDef, length_mm: float | None, zone: str | None,
                     rules: SeverityRules) -> tuple[int, str]:
    """Returns (severity_suggested, severity_reason), e.g. (4, "class min 3; length 226 mm (+1)")."""
    cat = cdef.cat_min
    why = [f"class min {cdef.cat_min}"]
    if length_mm is None:
        why.append("size unknown")
    else:
        for step in rules.length_steps:
            hit = (length_mm > step["above_mm"]) if "above_mm" in step else (length_mm >= step["from_mm"])
            if hit and "to_mm" in step:
                hit = length_mm <= step["to_mm"]
            if hit:
                add = int(step.get("add", 0))
                cat += add
                why.append(f"length {length_mm:.0f} mm (+{add})")
                break
    if zone is not None and zone == rules.tip_zone and cdef.code in rules.tip_classes and rules.tip_add:
        cat += rules.tip_add
        why.append(f"tip zone (+{rules.tip_add})")
    if cat > cdef.cat_max:
        cat = cdef.cat_max
        why.append(f"capped at {cdef.cat_max}")
    return cat, "; ".join(why)
