## Flask API (uv + MongoDB)

### Stack
- Flask
- MongoEngine (ODM)
- MongoDB (Docker for development)

All Mongo collections created by this API use the `cinnomon_` prefix.

### 1. Start MongoDB (development)
```powershell
docker compose up -d
```

### 2. Configure environment
`.env` is already set for local development. If needed, copy from:
```powershell
Copy-Item .env.example .env
```

Performance-related environment options:
- `MAX_ANALYSIS_IMAGE_DIM` (default `1280`): downscales very large uploads before width estimation.
- `ML_WARMUP_ON_STARTUP` (default `1`): preloads model/thresholds during app startup to reduce first-request latency.
- `RULER_CALIBRATION_PATH` (default `model_assets/ruler_calibration.json`): ruler-reference calibration payload (tick-to-cm ratio, KNN reference samples, fallback linear parameters).
- `THICKNESS_T1_CM` (default `0.8`): thickness (cm) calibration point mapped to lower threshold `t1`.
- `THICKNESS_T2_CM` (default `1.8`): thickness (cm) calibration point mapped to upper threshold `t2`.

### 3. Install dependencies
```powershell
uv sync
```

### 4. Run API
```powershell
uv run python main.py
```

The server runs at `http://127.0.0.1:5000` (or your machine IP when bound to `0.0.0.0`).

Uploaded photos are served from:
`http://<host>:5000/uploads/<filename>`

---

## Cinnamon stem analysis API

### Health
- `GET /health`

### Upload image + analyze + store
- `POST /api/v1/analyses/upload`
- Content type: `multipart/form-data`
- Fields:
  - `image` (required): `.jpg`, `.jpeg`, `.png`, `.webp`
  - `thickness` (optional): number

Example:
```powershell
curl -X POST "http://127.0.0.1:5000/api/v1/analyses/upload" `
  -F "image=@D:\path\to\stem.jpg"
```

Response includes:
- `status` (`unmatured`, `matured`, `overmatured`, `invalid`)
- `confidence`
- `time_required_to_mature_days` (only set for `unmatured`)
- `time_required_to_mature_range` (for `unmatured`, e.g. `10 to 13 months`)
- `analyzed_at`
- `thickness`
- `photo` (`filename`, `path`, `url`)

> Current behavior:
> 1. image class is predicted by MobileNetV2 from `MODEL_PATH` (`immature`, `mature`, `overmature`, `invalid`)
> 2. for `immature`, API first attempts ruler-referenced thickness estimation when ruler marks are confidently detected
> 3. if ruler detection is unavailable/low-confidence, API falls back to the existing contour-based width estimation path
> 4. if width quality is weak, API applies fallback-safe width inference instead of returning an analysis error
> 5. months and width category are inferred from estimated thickness
> 6. month output is a range string (e.g. `6 to 9 months`); `time_required_to_mature_days` is stored as midpoint-derived days for compatibility

The upload response also includes ML fields:
- `class`
- `normalized_width`
- `width_category`
- `months`
- `confidence`
- `status` (`ok` or `error`)

### Estimate month period from thickness
- `POST /api/v1/analyses/estimate-months`
- Accepts `thickness_cm` via JSON body (or form/query).

Example:
```powershell
curl -X POST "http://127.0.0.1:5000/api/v1/analyses/estimate-months" `
  -H "Content-Type: application/json" `
  -d "{\"thickness_cm\": 1.2}"
```

Response includes:
- `thickness_cm`
- `normalized_width`
- `width_category`
- `months`
- `confidence`
- `status`

### Recalibrate ruler-reference parameters (optional)
If you update the ruler-labeled dataset, regenerate calibration values:

```powershell
uv run python scripts\calibrate_ruler_reference.py `
  --dataset ..\models\dataset\ruler_based `
  --output model_assets\ruler_calibration.json
```

Calibration output now includes:
- `ratio_constant_tick_to_cm`
- `knn_neighbors`
- `reference_samples` (feature vectors + target cm)
- fallback linear fields (`ratio_to_thickness_slope`, `ratio_to_thickness_intercept`)

### List records (pagination + filters)
- `GET /api/v1/analyses`
- Query params:
  - `page` (default `1`)
  - `per_page` (default `10`, max `100`)
  - `status` (`immatured` alias is accepted and normalized to `unmatured`)
  - `thickness_min`
  - `thickness_max`
  - `analyzed_from` (ISO datetime)
  - `analyzed_to` (ISO datetime)

Example:
```powershell
curl "http://127.0.0.1:5000/api/v1/analyses?page=1&per_page=10&status=unmatured&thickness_min=2.0"
```

### Get one record by id
- `GET /api/v1/analyses/<id>`

### Delete one record by id
- `DELETE /api/v1/analyses/<id>`
- Also removes its uploaded photo from disk when present.
