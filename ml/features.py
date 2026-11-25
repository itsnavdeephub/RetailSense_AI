import numpy as np
import pandas as pd

from ml.config import FORECAST_HORIZON, TRAIN_END_D

LGBM_FEATURE_COLS = [
    "horizon",
    "item_code",
    "item_train_mean",
    "item_train_std",
    "lag_1",
    "lag_7",
    "lag_14",
    "lag_28",
    "same_weekday_lag_7",
    "same_weekday_lag_14",
    "roll_mean_7",
    "roll_mean_14",
    "roll_mean_28",
    "roll_std_7",
    "roll_std_14",
    "roll_std_28",
    "sell_price",
    "price_rel_train",
    "price_change_7d",
    "target_wday",
    "target_dow_sin",
    "target_dow_cos",
    "target_is_weekend",
    "target_month",
    "target_month_sin",
    "target_month_cos",
    "target_doy_sin",
    "target_doy_cos",
    "target_has_event",
    "target_event_type_code",
    "target_snap_ca",
]


def fit_feature_metadata(df: pd.DataFrame) -> dict:
    """Fit encoders and item statistics ONLY on training data (d_idx <= TRAIN_END_D)."""
    train_df = df[df["d_idx"] <= TRAIN_END_D]
    items = sorted(train_df["item_id"].unique().tolist())
    item_to_code = {item: idx for idx, item in enumerate(items)}

    event_types = sorted(train_df["event_type_1"].unique().tolist())
    if "None" not in event_types:
        event_types.insert(0, "None")
    event_to_code = {ev: idx for idx, ev in enumerate(event_types)}

    item_stats = {}
    for item_id, grp in train_df.groupby("item_id"):
        recent = grp.tail(365)
        item_stats[item_id] = {
            "train_mean": float(recent["sales"].mean()),
            "train_std": float(recent["sales"].std(ddof=0) + 1e-6),
            "price_mean": float(recent["sell_price"].mean() + 1e-6),
        }

    return {
        "item_to_code": item_to_code,
        "event_to_code": event_to_code,
        "item_stats": item_stats,
    }


def compute_origin_history_features(series: np.ndarray, prices: np.ndarray, t_pos: int, item_stat: dict) -> dict:
    """
    Compute purely causal origin features using ONLY data at indices <= t_pos.
    No future actual sales (> t_pos) are ever accessed.
    """
    # Ensure we have safe slices even near the start
    lag_1 = float(series[t_pos])
    lag_7 = float(series[max(0, t_pos - 6)])
    lag_14 = float(series[max(0, t_pos - 13)])
    lag_28 = float(series[max(0, t_pos - 27)])

    w7 = series[max(0, t_pos - 6) : t_pos + 1]
    w14 = series[max(0, t_pos - 13) : t_pos + 1]
    w28 = series[max(0, t_pos - 27) : t_pos + 1]

    cur_price = float(prices[t_pos])
    prev_price_7 = float(prices[max(0, t_pos - 7)])
    price_change_7d = (cur_price - prev_price_7) / max(prev_price_7, 1e-6)

    return {
        "lag_1": lag_1,
        "lag_7": lag_7,
        "lag_14": lag_14,
        "lag_28": lag_28,
        "roll_mean_7": float(np.mean(w7)),
        "roll_mean_14": float(np.mean(w14)),
        "roll_mean_28": float(np.mean(w28)),
        "roll_std_7": float(np.std(w7, ddof=0)),
        "roll_std_14": float(np.std(w14, ddof=0)),
        "roll_std_28": float(np.std(w28, ddof=0)),
        "sell_price": cur_price,
        "price_rel_train": cur_price / item_stat["price_mean"],
        "price_change_7d": float(price_change_7d),
    }


def build_direct_multistep_table(
    df: pd.DataFrame,
    meta: dict,
    origin_d_indices: list[int],
    horizon: int = FORECAST_HORIZON,
    include_target: bool = True,
) -> pd.DataFrame:
    """
    Build a direct multi-step tabular dataset where each row corresponds to
    (item_id, origin_d_idx, horizon h in 1..horizon).
    All lag and rolling features use ONLY sales <= origin_d_idx.
    Target calendar features are known in advance for origin_d_idx + h.
    """
    rows = []
    item_to_code = meta["item_to_code"]
    event_to_code = meta["event_to_code"]
    item_stats = meta["item_stats"]

    for item_id, grp in df.groupby("item_id", sort=True):
        grp = grp.sort_values("d_idx").reset_index(drop=True)
        d_to_pos = {int(d): idx for idx, d in enumerate(grp["d_idx"].values)}
        sales_arr = grp["sales"].values.astype(np.float32)
        price_arr = grp["sell_price"].values.astype(np.float32)
        wday_arr = grp["wday"].values.astype(np.int32)
        month_arr = grp["month"].values.astype(np.int32)
        doy_arr = grp["date"].dt.dayofyear.values.astype(np.int32)
        event_arr = grp["event_type_1"].values
        snap_arr = grp["snap_CA"].values.astype(np.int32)
        date_arr = grp["date"].values
        d_idx_arr = grp["d_idx"].values.astype(np.int32)

        stat = item_stats[item_id]
        item_code = item_to_code[item_id]

        for orig_d in origin_d_indices:
            if orig_d not in d_to_pos:
                continue
            t_pos = d_to_pos[orig_d]
            if t_pos < 28:
                continue
            if include_target and (t_pos + horizon >= len(grp)):
                continue

            hist_feats = compute_origin_history_features(sales_arr, price_arr, t_pos, stat)

            for h in range(1, horizon + 1):
                tgt_pos = t_pos + h
                tgt_wday = int(wday_arr[tgt_pos])
                tgt_month = int(month_arr[tgt_pos])
                tgt_doy = int(doy_arr[tgt_pos])
                ev_str = str(event_arr[tgt_pos])

                # Same weekday from previous weeks relative to origin t_pos (strictly <= t_pos!)
                # M5 wday is 1..7; t_pos+h mod 7 matches t_pos + h - 7 (which is <= t_pos since h <= 7)
                same_wk_7_pos = t_pos + h - 7
                same_wk_14_pos = t_pos + h - 14

                row = {
                    "item_id": item_id,
                    "origin_d_idx": int(d_idx_arr[t_pos]),
                    "target_d_idx": int(d_idx_arr[tgt_pos]),
                    "target_date": pd.Timestamp(date_arr[tgt_pos]),
                    "horizon": h,
                    "item_code": item_code,
                    "item_train_mean": stat["train_mean"],
                    "item_train_std": stat["train_std"],
                    **hist_feats,
                    "same_weekday_lag_7": float(sales_arr[same_wk_7_pos]),
                    "same_weekday_lag_14": float(sales_arr[same_wk_14_pos]),
                    "target_wday": tgt_wday,
                    "target_dow_sin": float(np.sin(2.0 * np.pi * (tgt_wday - 1) / 7.0)),
                    "target_dow_cos": float(np.cos(2.0 * np.pi * (tgt_wday - 1) / 7.0)),
                    "target_is_weekend": 1 if tgt_wday in (1, 2) else 0,  # M5 wday 1=Sat, 2=Sun
                    "target_month": tgt_month,
                    "target_month_sin": float(np.sin(2.0 * np.pi * (tgt_month - 1) / 12.0)),
                    "target_month_cos": float(np.cos(2.0 * np.pi * (tgt_month - 1) / 12.0)),
                    "target_doy_sin": float(np.sin(2.0 * np.pi * tgt_doy / 365.25)),
                    "target_doy_cos": float(np.cos(2.0 * np.pi * tgt_doy / 365.25)),
                    "target_has_event": 0 if ev_str == "None" else 1,
                    "target_event_type_code": event_to_code.get(ev_str, 0),
                    "target_snap_ca": int(snap_arr[tgt_pos]),
                }
                if include_target:
                    row["y_true"] = float(sales_arr[tgt_pos])
                rows.append(row)

    return pd.DataFrame(rows)
