import json
import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

from ml.config import (
    DATASETS_DIR,
    FORECAST_HORIZON,
    MODELS_DIR,
    RANDOM_SEED,
    RESULTS_DIR,
    TRAIN_END_D,
    VAL_ORIGINS,
)
from ml.features import LGBM_FEATURE_COLS, build_direct_multistep_table, fit_feature_metadata
from ml.metrics import compute_all_metrics


def train_lightgbm() -> dict:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_pickle(DATASETS_DIR / "processed_sales.pkl")
    meta = fit_feature_metadata(df)

    # Use rolling origins inside training window (last ~730 days of train for rich recent seasonality)
    train_start_orig = max(29, TRAIN_END_D - 730)
    train_origins = list(range(train_start_orig, TRAIN_END_D - FORECAST_HORIZON + 1, 2))
    # Also include dense recent training origins in last 180 days
    recent_origins = list(range(TRAIN_END_D - 180, TRAIN_END_D - FORECAST_HORIZON + 1))
    train_origins = sorted(set(train_origins + recent_origins))

    print(f"Building LightGBM train table ({len(train_origins)} origins)...")
    train_tbl = build_direct_multistep_table(df, meta, train_origins, horizon=FORECAST_HORIZON, include_target=True)

    print(f"Building LightGBM validation table ({len(VAL_ORIGINS)} rolling origins)...")
    val_tbl = build_direct_multistep_table(df, meta, VAL_ORIGINS, horizon=FORECAST_HORIZON, include_target=True)

    X_train = train_tbl[LGBM_FEATURE_COLS]
    y_train = train_tbl["y_true"].values
    X_val = val_tbl[LGBM_FEATURE_COLS]
    y_val = val_tbl["y_true"].values

    model = lgb.LGBMRegressor(
        objective="regression",
        n_estimators=1200,
        learning_rate=0.03,
        num_leaves=47,
        max_depth=8,
        min_child_samples=25,
        subsample=0.85,
        subsample_freq=1,
        colsample_bytree=0.85,
        reg_alpha=0.2,
        reg_lambda=1.0,
        random_state=RANDOM_SEED,
        n_jobs=-1,
        verbose=-1,
    )

    model.fit(
        X_train,
        y_train,
        eval_set=[(X_val, y_val)],
        eval_metric="l1",
        callbacks=[lgb.early_stopping(stopping_rounds=60, verbose=False)],
    )

    val_preds = np.clip(model.predict(X_val), 0.0, None)
    val_metrics = compute_all_metrics(y_val, val_preds)

    # Feature importances
    importances = model.feature_importances_
    total_imp = float(np.sum(importances)) or 1.0
    feat_imp = [
        {
            "feature": col,
            "importance": int(imp),
            "importance_pct": round(100.0 * float(imp) / total_imp, 2),
        }
        for col, imp in zip(LGBM_FEATURE_COLS, importances)
    ]
    feat_imp.sort(key=lambda x: x["importance"], reverse=True)

    bundle = {
        "model": model,
        "meta": meta,
        "feature_cols": LGBM_FEATURE_COLS,
        "best_iteration": int(model.best_iteration_ or model.n_estimators),
        "val_metrics": val_metrics,
        "feature_importances": feat_imp,
        "train_rows": int(len(X_train)),
        "val_rows": int(len(X_val)),
    }
    joblib.dump(bundle, MODELS_DIR / "lightgbm_forecaster.joblib")

    with open(RESULTS_DIR / "lightgbm_feature_importance.json", "w", encoding="utf-8") as f:
        json.dump(feat_imp, f, indent=2)

    print(f"LightGBM trained (best_iter={bundle['best_iteration']}). Validation metrics: {val_metrics}")
    return bundle


if __name__ == "__main__":
    train_lightgbm()
