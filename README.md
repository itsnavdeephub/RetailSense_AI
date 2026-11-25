# RetailSense AI

**Retail Demand Forecasting and Inventory Replenishment Optimization Using Machine Learning and Deep Learning**

RetailSense AI is a full-stack enterprise retail intelligence platform built on the real **M5 Walmart Forecasting Dataset** (`sales_train_evaluation.csv`, `calendar.csv`, `sell_prices.csv`). It combines classical statistical baselines, a direct multi-step **LightGBM Regressor**, and a **PyTorch Stacked LSTM** neural network with an empirical **Inventory Replenishment Optimization Engine** to curb both stockouts and overstocking (supporting **SDG 12**, **SDG 9**, and **SDG 8**).

## Key Features

- **Real M5 Dataset Pipeline (`Store CA_1` · `Dept FOODS_3` · 35 Stratified SKUs):**
  - Duplicate detection, missing event/price handling without future leakage, and chronological train / validation / test splits.
- **Three Forecasting Paradigms Compared Fairly:**
  - **Baselines:** 7-Day Seasonal Naive & 28-Day Moving Average.
  - **Machine Learning:** Direct Multi-Step LightGBM with lags (`1, 7, 14, 28`), rolling mean/std, price dynamics, and cyclical calendar/holiday features.
  - **Deep Learning:** PyTorch LSTM (`28-day sequence -> LSTM(64) -> LSTM(32) -> Dropout -> FC -> Output(7)`) with early stopping, checkpointing, and non-negative predictions.
  - Evaluated identically across 4 rolling 7-day origins on held-out test data using **MAE**, **RMSE**, **WAPE**, and **sMAPE** (with zero-denominator handling).
- **Inventory Replenishment Engine:**
  - Calculates Inventory Position, Lead-Time & Protection-Period Safety Stock (using empirical validation residuals), Reorder Point, Target Stock, Recommended Order Quantity, and Days of Stock Remaining.
  - Includes a live **Side Drawer Editor** (persisted in SQLite) and a **What-If Scenario Simulator**.
- **Enterprise SaaS Dashboard:**
  - 2-second intro SVG trend animation (respecting `prefers-reduced-motion` and playing once per session), Dark/Light themes, Overview, Sales Analytics, Demand Forecasting, Inventory Management, Model Performance, CSV/PDF Reports, and Settings.

## Installation & Setup

### 1. Python Environment

```bash
pip install -r requirements.txt
```

### 2. Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

### 3. Run Data Preprocessing, Model Training & Evaluation

Ensure `sales_train_evaluation.csv`, `calendar.csv`, and `sell_prices.csv` are inside `datasets/` (included in `datasets/m5.zip`).

```bash
python -m ml.run_pipeline
```

### 4. Start the Backend API & Frontend Dev Server

Terminal 1 (Flask REST API on port 5000):

```bash
python -m backend.app
```

Terminal 2 (React + Vite frontend on port 5173):

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

## Running Automated Tests

```bash
pytest -v
```

## Architecture Documentation

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details on module boundaries, leakage prevention, and inventory optimization equations.
