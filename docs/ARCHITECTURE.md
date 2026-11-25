# RetailSense AI — System Architecture

## 1. Logical Separation of Concerns

```
RetailSense_AI/
├── datasets/       # Raw M5 CSVs + processed_sales.pkl + preprocessing_report.json
├── ml/             # Training, feature engineering, evaluation & production inference
│   ├── config.py           # Chronological splits, active store/dept scope
│   ├── preprocess.py       # Duplicate checks, causal price imputation, M5 melting
│   ├── features.py         # Zero-leakage lag/rolling/price/calendar features
│   ├── baseline_models.py  # Seasonal Naive (7d) & Moving Average (28d)
│   ├── train_lightgbm.py   # Direct multi-step LightGBM regressor
│   ├── train_lstm.py       # PyTorch LSTM(64) -> LSTM(32) -> Dropout -> FC -> Output(7)
│   ├── evaluate_models.py  # Rolling-origin validation/test benchmark
│   └── inference.py        # Cached ForecasterService (no retraining per request)
├── backend/        # Flask REST API, SQLite ORM & Inventory Optimization Engine
│   ├── app.py              # REST endpoints & validation
│   ├── database.py         # SQLAlchemy InventoryState model & demo seeding
│   ├── inventory_engine.py # Safety stock, ROP, Target Stock, Order Qty formulas
│   └── reports.py          # CSV & ReportLab PDF export builders
├── frontend/       # React + Vite + Tailwind + Framer Motion + Recharts SPA
├── models/         # Saved LightGBM joblib bundle & PyTorch LSTM checkpoint
├── results/        # Evaluation JSON/CSV artifacts & LSTM training loss curve
└── tests/          # Unit & integration tests (pytest)
```

## 2. Time-Series Leakage Prevention

- **Chronological Splits:**
  - Train: `d_1` to `d_1885` (`2011-01-29` to `2016-03-27`)
  - Validation: `d_1886` to `d_1913` (`2016-03-28` to `2016-04-24`, 4 rolling 7-day origins)
  - Held-Out Test: `d_1914` to `d_1941` (`2016-04-25` to `2016-05-22`, 4 rolling 7-day origins)
- **Strict Causality:** All scalers (`StandardScaler`), item statistics, and encoders are fit exclusively on `d_idx <= 1885`. At any forecast origin `t`, lag and rolling features only inspect `sales[<= t]`.
- **Same-Weekday Lag:** For forecast step `h in 1..7`, `same_weekday_lag_7 = sales[t + h - 7]`, which is strictly `<= t`.

## 3. Inventory Optimization Mathematics

- **Inventory Position:** `Current Stock + Incoming Stock - Backorders`
- **Safety Stock (Lead Time `L`):** `z * sigma_d * sqrt(L)`, where `z = Phi^-1(service_level)` and `sigma_d` is the product's empirical validation residual standard deviation.
- **Reorder Point:** `Forecast Demand During L + Lead-Time Safety Stock`
- **Target Stock (`L + R`):** `Forecast Demand During (L + R) + z * sigma_d * sqrt(L + R)`
- **Recommended Order Quantity:** `round(max(0, Target Stock - Inventory Position))`
- **Extended Horizons:** When `L + R > 7`, `ForecasterService` generates up to 28-day forecasts using known M5 future calendar dates (`d_1942..d_1969`), and `inventory_engine` emits an explicit warning if `L + R` exceeds the generated horizon.
