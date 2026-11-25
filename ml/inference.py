import json
from functools import lru_cache
import joblib
import numpy as np
import pandas as pd
import torch

from ml.config import (
    DATASETS_DIR,
    FORECAST_HORIZON,
    LSTM_SEQ_LEN,
    MODELS_DIR,
    RESULTS_DIR,
    TEST_END_D,
)
from ml.features import LGBM_FEATURE_COLS, compute_origin_history_features
from ml.train_lstm import RetailLSTM, _extract_day_features


class ForecasterService:
    """
    Production inference service that loads pre-trained models and datasets once
    into memory and generates 7-day (or extended up to 28-day) non-negative forecasts.
    """

    def __init__(self):
        self.df = pd.read_pickle(DATASETS_DIR / "processed_sales.pkl")
        self.future_cal = pd.read_pickle(DATASETS_DIR / "future_calendar.pkl")

        lgbm_path = MODELS_DIR / "lightgbm_forecaster.joblib"
        lstm_ckpt_path = MODELS_DIR / "lstm_best.pt"
        lstm_prep_path = MODELS_DIR / "lstm_preprocessing.joblib"
        eval_path = RESULTS_DIR / "evaluation_summary.json"
        res_path = RESULTS_DIR / "validation_residuals.json"

        self.lgbm_bundle = joblib.load(lgbm_path) if lgbm_path.exists() else None
        self.lstm_prep = joblib.load(lstm_prep_path) if lstm_prep_path.exists() else None
        self.lstm_ckpt = (
            torch.load(lstm_ckpt_path, map_location="cpu", weights_only=False)
            if lstm_ckpt_path.exists()
            else None
        )
        self.lstm_model = None
        if self.lstm_ckpt is not None:
            self.lstm_model = RetailLSTM(
                input_size=self.lstm_ckpt["input_size"],
                horizon=self.lstm_ckpt["horizon"],
            )
            self.lstm_model.load_state_dict(self.lstm_ckpt["model_state_dict"])
            self.lstm_model.eval()

        self.eval_summary = (
            json.loads(eval_path.read_text(encoding="utf-8")) if eval_path.exists() else {}
        )
        self.val_residuals = (
            json.loads(res_path.read_text(encoding="utf-8")) if res_path.exists() else {}
        )

        # Pre-index per-item chronological series for O(1) lookup
        self.item_groups = {}
        for item_id, grp in self.df.groupby("item_id", sort=True):
            self.item_groups[item_id] = grp.sort_values("d_idx").reset_index(drop=True)

        self.future_cal = self.future_cal.sort_values("d_idx").reset_index(drop=True)

    def available_items(self) -> list[str]:
        return sorted(self.item_groups.keys())

    def resolve_best_model(self, metric: str = "mae") -> str:
        best_map = self.eval_summary.get("best_model_by_validation_metric", {})
        chosen = best_map.get(metric)
        if chosen in ("lightgbm", "lstm", "seasonal_naive", "moving_average"):
            return chosen
        return "lightgbm" if self.lgbm_bundle is not None else "seasonal_naive"

    def is_model_available(self, model_name: str) -> bool:
        if model_name in ("seasonal_naive", "moving_average", "best"):
            return True
        if model_name == "lightgbm":
            return self.lgbm_bundle is not None
        if model_name == "lstm":
            return self.lstm_model is not None and self.lstm_prep is not None
        return False

    def _build_future_calendar_rows(self, last_row: pd.Series, horizon: int) -> list[dict]:
        """Use known M5 future calendar rows (d_1942..d_1969), extending dates if horizon > 28."""
        rows = []
        last_d = int(last_row["d_idx"])
        last_date = pd.Timestamp(last_row["date"])
        last_price = float(last_row["sell_price"])

        fcal_by_d = {int(r["d_idx"]): r for _, r in self.future_cal.iterrows()}
        for h in range(1, horizon + 1):
            d_idx = last_d + h
            if d_idx in fcal_by_d:
                fc = fcal_by_d[d_idx]
                rows.append(
                    {
                        "d_idx": d_idx,
                        "date": pd.Timestamp(fc["date"]),
                        "wday": int(fc["wday"]),
                        "month": int(fc["month"]),
                        "event_type_1": str(fc["event_type_1"]),
                        "event_name_1": str(fc["event_name_1"]),
                        "snap_CA": int(fc["snap_CA"]),
                        "sell_price": last_price,
                    }
                )
            else:
                dt = last_date + pd.Timedelta(days=h)
                # M5 wday: Saturday=1, Sunday=2, ..., Friday=7
                py_wd = dt.weekday()  # Mon=0..Sun=6
                m5_wday = ((py_wd + 2) % 7) + 1
                rows.append(
                    {
                        "d_idx": d_idx,
                        "date": dt,
                        "wday": m5_wday,
                        "month": dt.month,
                        "event_type_1": "None",
                        "event_name_1": "None",
                        "snap_CA": 0,
                        "sell_price": last_price,
                    }
                )
        return rows

    def predict(
        self,
        item_id: str,
        model_name: str = "best",
        horizon: int = FORECAST_HORIZON,
    ) -> dict:
        if item_id not in self.item_groups:
            raise ValueError(f"Unknown product '{item_id}'.")

        horizon = int(horizon)
        if horizon < 1 or horizon > 28:
            raise ValueError("Forecast horizon must be between 1 and 28 days.")

        resolved_model = (
            self.resolve_best_model("mae") if model_name == "best" else model_name
        )
        if not self.is_model_available(resolved_model):
            raise RuntimeError(f"Model '{resolved_model}' is not trained or unavailable.")

        grp = self.item_groups[item_id]
        last_row = grp.iloc[-1]
        future_cal = self._build_future_calendar_rows(last_row, horizon)

        sales_hist = grp["sales"].values.astype(np.float32).tolist()
        price_hist = grp["sell_price"].values.astype(np.float32).tolist()

        preds = []
        if resolved_model == "seasonal_naive":
            for h in range(1, horizon + 1):
                src_idx = len(sales_hist) - 7 + ((h - 1) % 7)
                preds.append(float(max(0.0, sales_hist[src_idx])))

        elif resolved_model == "moving_average":
            ma = float(max(0.0, np.mean(sales_hist[-28:])))
            preds = [ma] * horizon

        elif resolved_model == "lightgbm":
            preds = self._predict_lgbm_multiweek(grp, item_id, future_cal, horizon)

        elif resolved_model == "lstm":
            preds = self._predict_lstm_multiweek(grp, item_id, future_cal, horizon)

        # Attach empirically calibrated validation residual intervals (80% interval from q10/q90)
        res_info = self.val_residuals.get(item_id, {}).get(resolved_model)
        daily_rows = []
        for idx, fc in enumerate(future_cal):
            yhat = round(float(max(0.0, preds[idx])), 2)
            entry = {
                "date": fc["date"].strftime("%Y-%m-%d"),
                "day_step": idx + 1,
                "item_id": item_id,
                "predicted_demand": yhat,
                "model_used": resolved_model,
                "event_name": fc["event_name_1"] if fc["event_name_1"] != "None" else None,
            }
            if res_info is not None:
                lo = max(0.0, yhat + float(res_info["val_q10_residual"]))
                hi = max(yhat, yhat + float(res_info["val_q90_residual"]))
                entry["lower_80"] = round(lo, 2)
                entry["upper_80"] = round(hi, 2)
            daily_rows.append(entry)

        return {
            "item_id": item_id,
            "store_id": str(last_row["store_id"]),
            "dept_id": str(last_row["dept_id"]),
            "requested_model": model_name,
            "model_used": resolved_model,
            "horizon": horizon,
            "extended_beyond_base_7d": horizon > 7,
            "uncertainty_source": (
                "Empirical 10th-90th percentile validation residuals (2016-03-28 to 2016-04-24)"
                if res_info is not None
                else None
            ),
            "validation_residual_std": res_info["val_residual_std"] if res_info else None,
            "forecast": daily_rows,
        }

    def _predict_lgbm_multiweek(
        self, grp: pd.DataFrame, item_id: str, future_cal: list[dict], horizon: int
    ) -> list[float]:
        meta = self.lgbm_bundle["meta"]
        model = self.lgbm_bundle["model"]
        stat = meta["item_stats"][item_id]
        item_code = meta["item_to_code"][item_id]
        event_to_code = meta["event_to_code"]

        sales_buf = grp["sales"].values.astype(np.float32).tolist()
        price_buf = grp["sell_price"].values.astype(np.float32).tolist()

        preds = []
        offset = 0
        while offset < horizon:
            block_h = min(FORECAST_HORIZON, horizon - offset)
            t_pos = len(sales_buf) - 1
            hist_feats = compute_origin_history_features(
                np.array(sales_buf, dtype=np.float32),
                np.array(price_buf, dtype=np.float32),
                t_pos,
                stat,
            )

            rows = []
            for h in range(1, block_h + 1):
                fc = future_cal[offset + h - 1]
                tgt_wday = fc["wday"]
                tgt_month = fc["month"]
                tgt_doy = fc["date"].dayofyear
                ev_str = fc["event_type_1"]

                same_wk_7 = sales_buf[t_pos + h - 7]
                same_wk_14 = sales_buf[t_pos + h - 14]

                rows.append(
                    {
                        "horizon": h,
                        "item_code": item_code,
                        "item_train_mean": stat["train_mean"],
                        "item_train_std": stat["train_std"],
                        **hist_feats,
                        "same_weekday_lag_7": float(same_wk_7),
                        "same_weekday_lag_14": float(same_wk_14),
                        "target_wday": tgt_wday,
                        "target_dow_sin": float(np.sin(2.0 * np.pi * (tgt_wday - 1) / 7.0)),
                        "target_dow_cos": float(np.cos(2.0 * np.pi * (tgt_wday - 1) / 7.0)),
                        "target_is_weekend": 1 if tgt_wday in (1, 2) else 0,
                        "target_month": tgt_month,
                        "target_month_sin": float(np.sin(2.0 * np.pi * (tgt_month - 1) / 12.0)),
                        "target_month_cos": float(np.cos(2.0 * np.pi * (tgt_month - 1) / 12.0)),
                        "target_doy_sin": float(np.sin(2.0 * np.pi * tgt_doy / 365.25)),
                        "target_doy_cos": float(np.cos(2.0 * np.pi * tgt_doy / 365.25)),
                        "target_has_event": 0 if ev_str == "None" else 1,
                        "target_event_type_code": event_to_code.get(ev_str, 0),
                        "target_snap_ca": int(fc["snap_CA"]),
                    }
                )

            X_df = pd.DataFrame(rows)[LGBM_FEATURE_COLS]
            block_preds = np.clip(model.predict(X_df), 0.0, None).tolist()
            preds.extend(block_preds)

            # Append predicted block to recursive buffer only when extended > 7 days
            for step_i, p_val in enumerate(block_preds):
                sales_buf.append(float(p_val))
                price_buf.append(float(future_cal[offset + step_i]["sell_price"]))
            offset += block_h

        return preds

    def _predict_lstm_multiweek(
        self, grp: pd.DataFrame, item_id: str, future_cal: list[dict], horizon: int
    ) -> list[float]:
        meta = self.lstm_prep["meta"]
        scaler = self.lstm_prep["scaler"]
        stat = meta["item_stats"][item_id]

        work_df = grp.tail(LSTM_SEQ_LEN).copy()
        preds = []
        offset = 0

        while offset < horizon:
            block_h = min(FORECAST_HORIZON, horizon - offset)
            day_feats = _extract_day_features(work_df.tail(LSTM_SEQ_LEN), stat)
            n_feats = day_feats.shape[1]
            x_scaled = scaler.transform(day_feats).reshape(1, LSTM_SEQ_LEN, n_feats).astype(np.float32)

            with torch.no_grad():
                out_log = self.lstm_model(torch.from_numpy(x_scaled)).numpy()[0]
            block_preds = np.clip(np.expm1(out_log), 0.0, None)[:block_h].tolist()
            preds.extend(block_preds)

            if offset + block_h < horizon:
                new_rows = []
                for step_i, p_val in enumerate(block_preds):
                    fc = future_cal[offset + step_i]
                    new_rows.append(
                        {
                            "sales": float(p_val),
                            "sell_price": float(fc["sell_price"]),
                            "wday": int(fc["wday"]),
                            "month": int(fc["month"]),
                            "event_type_1": str(fc["event_type_1"]),
                            "snap_CA": int(fc["snap_CA"]),
                        }
                    )
                work_df = pd.concat([work_df, pd.DataFrame(new_rows)], ignore_index=True)
            offset += block_h

        return preds


@lru_cache(maxsize=1)
def get_forecaster_service() -> ForecasterService:
    return ForecasterService()
