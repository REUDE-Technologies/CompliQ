"""Point scheme, severity rule and folder scanning — checked against the ML spec's own examples."""
from pathlib import Path

from PIL import Image

from compliq_studio.config import ClassDef
from compliq_studio.scanner import classify_folder, point_number, scan_input
from compliq_studio.scheme import all_blade_codes, distance_m, parse_blade_code, parse_component_code, zone_for
from compliq_studio.severity import suggest_severity


def test_point_scheme_matches_spec():
    codes = all_blade_codes()
    assert len(codes) == 240 and len(set(codes)) == 240
    assert codes[0] == "B1-SS-01" and codes[-1] == "B3-TE-20"
    assert parse_blade_code("B1-TE-07") == (1, "TE", 7)
    assert parse_blade_code("B4-SS-01") is None and parse_blade_code("B1-SS-21") is None
    assert parse_component_code("NAC-03") == ("nacelle", 3) and parse_component_code("TWR-00") is None
    assert [zone_for(p) for p in (1, 7, 8, 14, 15, 20)] == ["root", "root", "mid", "mid", "tip", "tip"]
    # spec example: B1-TE-07 on a 48.5 m blade -> 15.32 m; P20 is the blade length
    assert distance_m(7, 48.5) == 15.32 and distance_m(8, 48.5) == 17.87 and distance_m(20, 48.5) == 48.5
    assert distance_m(5, None) is None


def test_severity_rule_spec_examples(cfg):
    rules, cls = cfg.severity, cfg.classes
    assert suggest_severity(cls["trailing_edge_split"], 226.0, "root", rules) == (4, "class min 3; length 226 mm (+1)")
    assert suggest_severity(cls["trailing_edge_split"], 420.0, "mid", rules) == (5, "class min 3; length 420 mm (+2)")
    assert suggest_severity(cls["crack"], None, "mid", rules) == (2, "class min 2; size unknown")
    assert suggest_severity(cls["leading_edge_erosion"], 40.0, "tip", rules) == (2, "class min 1; tip zone (+1)")
    assert suggest_severity(cls["coating_gelcoat_damage"], 500.0, "tip", rules)[0] == 3   # never above its range
    cat, why = suggest_severity(ClassDef("x", "X", 1, 2, 0.3), 500.0, "root", rules)
    assert cat == 2 and why == "class min 1; length 500 mm (+2); capped at 2"
    assert suggest_severity(cls["crack"], 50.0, "root", rules)[0] == 3      # 50 mm is in the 50-300 band
    assert suggest_severity(cls["crack"], 300.0, "root", rules)[0] == 3     # 300 mm still +1
    assert suggest_severity(cls["crack"], 300.1, "root", rules)[0] == 4     # over 300 mm is +2
    assert suggest_severity(ClassDef("x", "X", 2, 5, 0.3), 49.9, "root", rules)[0] == 2


def test_class_name_mapping(cfg):
    assert cfg.class_for_model_name("crack") == "crack"
    assert cfg.class_for_model_name("Leading Edge Erosion") == "leading_edge_erosion"
    assert cfg.class_for_model_name("Cracks") == "crack"                       # by dashboard label
    assert cfg.class_for_model_name("rust") is None


def test_folder_names():
    assert classify_folder("B1-SS") == ("blade", "B1-SS")
    assert classify_folder("b2_le") == ("blade", "B2-LE")
    assert classify_folder("Blade 3/PS") == ("blade", "B3-PS")
    assert classify_folder("blade1 trailing") == ("blade", "B1-TE")
    assert classify_folder("NACELLE") == ("nacelle", "nacelle")
    assert classify_folder("nasal-rotor") == ("nacelle", "nacelle")
    assert classify_folder("Pole") == ("tower", "tower")
    assert classify_folder("misc") is None
    assert point_number("B1-SS-07") == 7 and point_number("P05") == 5 and point_number("20") == 20
    assert point_number("DJI_0001") is None and point_number("DJI_20261104103002_0001_Z") is None


def _photos(folder: Path, names):
    folder.mkdir(parents=True, exist_ok=True)
    for n in names:
        Image.new("RGB", (64, 48), (200, 200, 200)).save(folder / n)


def test_scanner_rules(cfg, tmp_path):
    root = tmp_path / "WTG-014_2026-11-05"
    for b in (1, 2, 3):
        for s in ("SS", "LE", "PS", "TE"):
            _photos(root / f"Blade {b}" / s, [f"DJI_{i:04d}.JPG" for i in range(1, 21)])
    _photos(root / "Nacelle", [f"n{i}.jpg" for i in range(1, 6)])
    _photos(root / "Tower", [f"t{i}.jpg" for i in range(1, 4)])
    r = scan_input(root, cfg)
    assert r.ok, r.to_dict()
    assert r.suggested_turbine == "WTG-014" and r.suggested_date == "2026-11-05"
    plan = r.plan()
    assert len([i for i in plan if i.group == "blade"]) == 240
    assert [i.code for i in plan if i.group == "nacelle"] == [f"NAC-0{i}" for i in range(1, 6)]
    assert plan[0].photo.name == "DJI_0001.JPG" and plan[19].photo.name == "DJI_0020.JPG"

    # flip one pass: P01 becomes the last photo
    r2 = scan_input(root, cfg, {"B1-SS": {"reverse": True}})
    assert r2.plan()[0].photo.name == "DJI_0020.JPG"

    # 19 photos without point numbers cannot be mapped safely
    (root / "Blade 2" / "LE" / "DJI_0020.JPG").unlink()
    r3 = scan_input(root, cfg)
    assert not r3.ok and "19 photos" in r3.folders["B2-LE"].issues[0]

    # ...but numbered photos can: the gap becomes 'unavailable'
    le = root / "Blade 2" / "LE"
    for p in sorted(le.iterdir()):
        p.rename(le / f"B2-LE-{int(p.stem.split('_')[1]):02d}.jpg")
    r4 = scan_input(root, cfg)
    assert r4.ok and r4.folders["B2-LE"].mode == "numbered"
    gap = [i for i in r4.plan() if i.code == "B2-LE-20"][0]
    assert gap.photo is None and gap.unavailable_reason

    # a side that was not filmed
    import shutil
    shutil.rmtree(root / "Blade 3" / "TE")
    assert not scan_input(root, cfg).ok
    r5 = scan_input(root, cfg, {"B3-TE": {"not_filmed": "wind gust aborted pass"}})
    assert r5.ok
    assert all(i.unavailable_reason == "wind gust aborted pass" for i in r5.plan() if i.key == "B3-TE")

    # too many nacelle photos for the configured range
    cfg.settings["input"]["nacelle_max_photos"] = 4
    assert not scan_input(root, cfg, {"B3-TE": {"not_filmed": "x"}}).ok
