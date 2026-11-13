# Put the model here

- `model.pt` — the ML1 weights (Ultralytics YOLO, the six CompliQ classes). An ONNX export also works; pick it in Setup.
- `model.json` — name and version written into every manifest:

```json
{ "model_name": "compliq-blade6-yolo11s", "model_version": "1.0.0" }
```

Without `model.json` the manifest uses the file name and version `0.0.0`.
If the model's class names differ from the six codes, map them in `config/classes.yaml` → `model_name_map`.
