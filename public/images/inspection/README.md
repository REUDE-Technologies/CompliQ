# Inspection image library

Inspection images are grouped by turbine, then by their state (`original` or `annotated`). The WTG-001 folders are the starter structure used by the wind asset detail viewer.

```text
inspection/WTG-001/
├── original/
│   ├── blades/Blade_A/{SS,LE,PS,TE}/
│   ├── blades/Blade_B/{SS,LE,PS,TE}/
│   ├── blades/Blade_C/{SS,LE,PS,TE}/
│   ├── nacelle/
│   └── tower/
└── annotated/
    ├── blades/Blade_A/{SS,LE,PS,TE}/
    ├── blades/Blade_B/{SS,LE,PS,TE}/
    ├── blades/Blade_C/{SS,LE,PS,TE}/
    ├── nacelle/
    └── tower/
```

Blade side codes: `SS` suction side, `LE` leading edge, `PS` pressure side, and `TE` trailing edge. The tower folder is for tower/pole inspection images.

For blade captures, use `P01.jpg` through `P20.jpg` in `original/`; put the matching `P01_annotated.jpg` through `P20_annotated.jpg` in the corresponding `annotated/` folder. PNG is also supported. Keep the blade letter and side folder names exactly as shown. The viewer checks this local layout first, then falls back to the existing Gamesa G97 image source.

For nacelle and tower images, use `capture-01.jpg` in each `original/` folder and `capture-01_annotated.jpg` in the matching `annotated/` folder. Additional captures can use `capture-02`, `capture-03`, and so on. Create the same turbine folder layout for additional assets, using the turbine's asset ID in place of `WTG-001`.
