import numpy as np
import pandas as pd

from ml.config import FORECAST_HORIZON


def predict_seasonal_naive(
    df: pd.DataFrame,
    origin_d_indices: list[int],
    horizon: int = FORECAST_HORIZON,
    include_target: bool = True,
) -> pd.DataFrame:
    """
    7-day Seasonal Naive forecast:
    y_hat(t + h) = y(t + h - 7) for h = 1..7 (same day of previous week).
    Strictly uses actual sales at d <= t.
    """
    rows = []
    for item_id, grp in df.groupby("item_id", sort=True):
        grp = grp.sort_values("d_idx").reset_index(drop=True)
        d_to_pos = {int(d): idx for idx, d in enumerate(grp["d_idx"].values)}
        sales_arr = grp["sales"].values.astype(np.float32)
        date_arr = grp["date"].values
        d_idx_arr = grp["d_idx"].values.astype(np.int32)

        for orig_d in origin_d_indices:
            if orig_d not in d_to_pos:
                continue
            t_pos = d_to_pos[orig_d]
            if t_pos < 7:
                continue
            if include_target and (t_pos + horizon >= len(grp)):
                continue

            for h in range(1, horizon + 1):
                src_pos = t_pos + h - 7
                pred = float(max(0.0, sales_arr[src_pos]))
                row = {
                    "item_id": item_id,
                    "origin_d_idx": int(d_idx_arr[t_pos]),
                    "target_d_idx": int(d_idx_arr[t_pos] + h),
                    "target_date": (
                        pd.Timestamp(date_arr[t_pos + h])
                        if t_pos + h < len(grp)
                        else pd.Timestamp(date_arr[t_pos]) + pd.Timedelta(days=h)
                    ),
                    "horizon": h,
                    "y_pred": pred,
                }
                if include_target:
                    row["y_true"] = float(sales_arr[t_pos + h])
                rows.append(row)

    return pd.DataFrame(rows)


def predict_moving_average(
    df: pd.DataFrame,
    origin_d_indices: list[int],
    window: int = 28,
    horizon: int = FORECAST_HORIZON,
    include_target: bool = True,
) -> pd.DataFrame:
    """
    Trailing Moving Average baseline:
    y_hat(t + h) = mean(y[t - window + 1 .. t]) for h = 1..horizon.
    """
    rows = []
    for item_id, grp in df.groupby("item_id", sort=True):
        grp = grp.sort_values("d_idx").reset_index(drop=True)
        d_to_pos = {int(d): idx for idx, d in enumerate(grp["d_idx"].values)}
        sales_arr = grp["sales"].values.astype(np.float32)
        date_arr = grp["date"].values
        d_idx_arr = grp["d_idx"].values.astype(np.int32)

        for orig_d in origin_d_indices:
            if orig_d not in d_to_pos:
                continue
            t_pos = d_to_pos[orig_d]
            if t_pos < window:
                continue
            if include_target and (t_pos + horizon >= len(grp)):
                continue

            ma_val = float(max(0.0, np.mean(sales_arr[t_pos - window + 1 : t_pos + 1])))
            for h in range(1, horizon + 1):
                row = {
                    "item_id": item_id,
                    "origin_d_idx": int(d_idx_arr[t_pos]),
                    "target_d_idx": int(d_idx_arr[t_pos] + h),
                    "target_date": (
                        pd.Timestamp(date_arr[t_pos + h])
                        if t_pos + h < len(grp)
                        else pd.Timestamp(date_arr[t_pos]) + pd.Timedelta(days=h)
                    ),
                    "horizon": h,
                    "y_pred": ma_val,
                }
                if include_target:
                    row["y_true"] = float(sales_arr[t_pos + h])
                rows.append(row)

    return pd.DataFrame(rows)
