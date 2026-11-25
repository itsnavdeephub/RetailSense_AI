import json
import joblib
import numpy as np
import pandas as pd
import torch

from ml.baseline_models import predict_moving_average, predict_seasonal_naive
from ml.config import (
    DATASETS_DIR,
    FORECAST_HORIZON,
    LSTM_SEQ_LEN,
    MODELS_DIR,
    RESULTS_DIR,
    TEST_ORIGINS,
    VAL_ORIGINS,
)
from ml.features import LGBM_FEATURE_COLS, build_direct_multistep_table
from ml.metrics import compute_all_metrics
from ml.train_lstm import RetailLSTM, build_lstm_sequences


def _predict_lgbm(df: pd.DataFrame, bundle: dict, origins: list[int]) -> pd.DataFrame:
    tbl = build_direct_multistep_table(df, bundle["meta"], origins, horizon=FORECAST_HORIZON, include_target=True)
    preds = np.clip(bundle["model"].predict(tbl[LGBM_FEATURE_COLS]), 0.0, None)
    out = tbl[["item_id", "origin_d_idx", "target_d_idx", "target_date", "horizon", "y_true"]].copy()
    out["y_pred"] = preds
    return out


def _predict_lstm(df: pd.DataFrame, ckpt: dict, prep: dict, origins: list[int]) -> pd.DataFrame:
    meta = prep["meta"]
    scaler = prep["scaler"]
    X_raw, y_log, seq_meta = build_lstm_sequences(df, meta, origins, seq_len=LSTM_SEQ_LEN, horizon=FORECAST_HORIZON, include_target=True)
    n_feats = X_raw.shape[2]
    X_scaled = scaler.transform(X_raw.reshape(-1, n_feats)).reshape(X_raw.shape).astype(np.float32)

    model = RetailLSTM(input_size=n_feats, horizon=FORECAST_HORIZON)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()
    with torch.no_grad():
        pred_log = model(torch.from_numpy(X_scaled)).numpy()

    pred_units = np.clip(np.expm1(pred_log), 0.0, None)
    true_units = np.clip(np.expm1(y_log), 0.0, None)

    # Map dates cleanly
    cal_map = df[["d_idx", "date"]].drop_duplicates().set_index("d_idx")["date"].to_dict()
    rows = []
    for i, m in enumerate(seq_meta):
        orig_d = m["origin_d_idx"]
        for h in range(1, FORECAST_HORIZON + 1):
            tgt_d = orig_d + h
            rows.append(
                {
                    "item_id": m["item_id"],
                    "origin_d_idx": orig_d,
                    "target_d_idx": tgt_d,
                    "target_date": pd.Timestamp(cal_map[tgt_d]),
                    "horizon": h,
                    "y_true": float(true_units[i, h - 1]),
                    "y_pred": float(pred_units[i, h - 1]),
                }
            )
    return pd.DataFrame(rows)


def run_evaluation() -> dict:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    df = pd.read_pickle(DATASETS_DIR / "processed_sales.pkl")

    lgbm_bundle = joblib.load(MODELS_DIR / "lightgbm_forecaster.joblib")
    lstm_prep = joblib.load(MODELS_DIR / "lstm_preprocessing.joblib")
    lstm_ckpt = torch.load(MODELS_DIR / "lstm_best.pt", map_location="cpu", weights_only=False)

    models_val = {
        "seasonal_naive": predict_seasonal_naive(df, VAL_ORIGINS, include_target=True),
        "moving_average": predict_moving_average(df, VAL_ORIGINS, window=28, include_target=True),
        "lightgbm": _predict_lgbm(df, lgbm_bundle, VAL_ORIGINS),
        "lstm": _predict_lstm(df, lstm_ckpt, lstm_prep, VAL_ORIGINS),
    }

    models_test = {
        "seasonal_naive": predict_seasonal_naive(df, TEST_ORIGINS, include_target=True),
        "moving_average": predict_moving_average(df, TEST_ORIGINS, window=28, include_target=True),
        "lightgbm": _predict_lgbm(df, lgbm_bundle, TEST_ORIGINS),
        "lstm": _predict_lstm(df, lstm_ckpt, lstm_prep, TEST_ORIGINS),
    }

    # Verify identical evaluation alignment across all models
    ref_len = len(models_test["seasonal_naive"])
    for name, pred_df in models_test.items():
        assert len(pred_df) == ref_len, f"Mismatch in test prediction rows for {name}: {len(pred_df)} != {ref_len}"

    val_summary = {}
    test_summary = {}
    for name in models_test:
        val_df = models_val[name]
        test_df = models_test[name]
        val_summary[name] = compute_all_metrics(val_df["y_true"].values, val_df["y_pred"].values)
        test_summary[name] = compute_all_metrics(test_df["y_true"].values, test_df["y_pred"].values)

    # Determine best model per validation metric (used for automatic model selection without test leakage)
    best_by_metric = {}
    for metric in ["mae", "rmse", "wape", "smape"]:
        best_model = min(val_summary.keys(), key=lambda m: val_summary[m][metric])
        best_by_metric[metric] = best_model

    # Aggregate daily actual vs predicted over the 28-day test period across all 35 products
    daily_comparison = []
    merged_dates = sorted(models_test["seasonal_naive"]["target_date"].unique())
    for dt in merged_dates:
        row = {"date": str(pd.Timestamp(dt).date())}
        sub_ref = models_test["seasonal_naive"][models_test["seasonal_naive"]["target_date"] == dt]
        row["actual"] = round(float(sub_ref["y_true"].sum()), 2)
        for name, pdf in models_test.items():
            sub = pdf[pdf["target_date"] == dt]
            row[name] = round(float(sub["y_pred"].sum()), 2)
        daily_comparison.append(row)

    # Error distribution histogram on test predictions (residuals = y_true - y_pred)
    err_bins = [-999, -10, -5, -2, -0.5, 0.5, 2, 5, 10, 999]
    err_labels = ["<-10", "-10 to -5", "-5 to -2", "-2 to -0.5", "-0.5 to 0.5", "0.5 to 2", "2 to 5", "5 to 10", ">10"]
    error_distribution = []
    errs_by_model = {
        name: (pdf["y_true"].values - pdf["y_pred"].values) for name, pdf in models_test.items()
    }
    for idx, label in enumerate(err_labels):
        lo, hi = err_bins[idx], err_bins[idx + 1]
        entry = {"bucket": label}
        for name, errs in errs_by_model.items():
            entry[name] = int(np.sum((errs > lo) & (errs <= hi)))
        error_distribution.append(entry)

    # Per-product evaluation + empirical validation residual std for safety stock & uncertainty intervals
    product_rows = []
    val_residual_lookup = {}
    items = sorted(df["item_id"].unique().tolist())
    for item_id in items:
        item_entry = {"item_id": item_id, "models": {}}
        val_residual_lookup[item_id] = {}
        for name in models_test:
            t_sub = models_test[name][models_test[name]["item_id"] == item_id]
            v_sub = models_val[name][models_val[name]["item_id"] == item_id]
            t_metrics = compute_all_metrics(t_sub["y_true"].values, t_sub["y_pred"].values)
            v_residuals = v_sub["y_true"].values - v_sub["y_pred"].values
            val_rmse = float(np.sqrt(np.mean(v_residuals ** 2)))
            val_std = float(np.std(v_residuals, ddof=1)) if len(v_residuals) > 1 else val_rmse
            # Empirical 10th and 90th percentile of validation residuals for calibrated 80% intervals
            q10 = float(np.percentile(v_residuals, 10))
            q90 = float(np.percentile(v_residuals, 90))
            item_entry["models"][name] = {
                **t_metrics,
                "val_rmse": round(val_rmse, 4),
                "val_residual_std": round(val_std, 4),
                "val_q10_residual": round(q10, 4),
                "val_q90_residual": round(q90, 4),
            }
            val_residual_lookup[item_id][name] = {
                "val_rmse": round(val_rmse, 4),
                "val_residual_std": round(val_std, 4),
                "val_q10_residual": round(q10, 4),
                "val_q90_residual": round(q90, 4),
            }
        item_entry["best_model_mae"] = min(
            item_entry["models"].keys(), key=lambda m: item_entry["models"][m]["mae"]
        )
        product_rows.append(item_entry)

    # Save test predictions for quick product-level actual vs predicted inspection in UI
    test_preds_combined = models_test["seasonal_naive"][["item_id", "target_date", "horizon", "y_true"]].copy()
    test_preds_combined["target_date"] = test_preds_combined["target_date"].dt.strftime("%Y-%m-%d")
    for name, pdf in models_test.items():
        test_preds_combined[name] = np.round(pdf["y_pred"].values, 3)
    test_preds_combined.to_csv(RESULTS_DIR / "test_predictions.csv", index=False)

    with open(RESULTS_DIR / "validation_residuals.json", "w", encoding="utf-8") as f:
        json.dump(val_residual_lookup, f, indent=2)

    with open(RESULTS_DIR / "product_evaluation.json", "w", encoding="utf-8") as f:
        json.dump(product_rows, f, indent=2)

    lstm_hist_path = RESULTS_DIR / "lstm_training_history.json"
    lstm_hist = json.loads(lstm_hist_path.read_text(encoding="utf-8")) if lstm_hist_path.exists() else {}

    summary = {
        "evaluation_protocol": {
            "validation_period": "2016-03-28 to 2016-04-24 (28 days, 4 rolling 7-day origins)",
            "test_period": "2016-04-25 to 2016-05-22 (28 days, 4 rolling 7-day origins)",
            "forecast_horizon_days": FORECAST_HORIZON,
            "num_products": len(items),
            "test_observations_per_model": int(ref_len),
        },
        "validation_metrics": val_summary,
        "test_metrics": test_summary,
        "best_model_by_validation_metric": best_by_metric,
        "daily_comparison": daily_comparison,
        "error_distribution": error_distribution,
        "model_metadata": {
            "seasonal_naive": {
                "name": "Seasonal Naive (7-Day)",
                "status": "Ready",
                "description": "Repeats actual sales from the exact same weekday 7 days prior as the baseline benchmark.",
            },
            "moving_average": {
                "name": "Moving Average (28-Day)",
                "status": "Ready",
                "description": "Projects the trailing 28-day mean daily sales flatly across the 7-day forecast horizon.",
            },
            "lightgbm": {
                "name": "LightGBM Regressor",
                "status": "Trained",
                "best_iteration": lgbm_bundle.get("best_iteration"),
                "train_rows": lgbm_bundle.get("train_rows"),
                "description": "Direct multi-step gradient boosted trees using 1/7/14/28-day lags, rolling statistics, price dynamics, and calendar/holiday features.",
            },
            "lstm": {
                "name": "PyTorch LSTM",
                "status": "Trained",
                "best_epoch": lstm_hist.get("best_epoch"),
                "total_epochs_run": lstm_hist.get("total_epochs_run"),
                "early_stopped": lstm_hist.get("early_stopped"),
                "architecture": "28-day seq -> LSTM(64) -> LSTM(32) -> Dropout(0.2) -> FC(32) -> Output(7)",
                "description": "Two-layer stacked LSTM sequence model capturing 28-day temporal demand trajectories, pricing, and cyclical seasonality.",
            },
        },
    }

    with open(RESULTS_DIR / "evaluation_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print("Evaluation complete! Test metrics:")
    print(json.dumps(test_summary, indent=2))
    print("Best model by validation metric:", best_by_metric)
    return summary


if __name__ == "__main__":
    run_evaluation()
