import json
from pathlib import Path
import numpy as np
import pandas as pd

from ml.config import (
    ACTIVE_DEPARTMENTS,
    ACTIVE_STORES,
    DATASETS_DIR,
    NUM_PRODUCTS,
    TEST_END_D,
    TEST_START_D,
    TRAIN_END_D,
    VAL_END_D,
    VAL_START_D,
)


def run_preprocessing() -> pd.DataFrame:
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)

    sales_path = DATASETS_DIR / "sales_train_evaluation.csv"
    cal_path = DATASETS_DIR / "calendar.csv"
    prices_path = DATASETS_DIR / "sell_prices.csv"

    for p in (sales_path, cal_path, prices_path):
        if not p.exists():
            raise FileNotFoundError(f"Missing required M5 dataset file: {p}")

    sales_wide = pd.read_csv(sales_path)
    calendar = pd.read_csv(cal_path)
    prices = pd.read_csv(prices_path)

    # Duplicate checks on raw datasets
    sales_dups = int(sales_wide.duplicated(subset=["item_id", "store_id"]).sum())
    cal_dups = int(calendar.duplicated(subset=["date"]).sum())
    price_dups = int(prices.duplicated(subset=["store_id", "item_id", "wm_yr_wk"]).sum())

    if sales_dups > 0:
        sales_wide = sales_wide.drop_duplicates(subset=["item_id", "store_id"])
    if cal_dups > 0:
        calendar = calendar.drop_duplicates(subset=["date"])
    if price_dups > 0:
        prices = prices.drop_duplicates(subset=["store_id", "item_id", "wm_yr_wk"])

    # Compute real CA_1 department-level summary before subsetting
    d_cols = [f"d_{i}" for i in range(1, TEST_END_D + 1)]
    ca1_all = sales_wide[sales_wide["store_id"].isin(ACTIVE_STORES)].copy()
    dept_rows = []
    for dept_id, grp in ca1_all.groupby("dept_id"):
        total_units = int(grp[d_cols].sum().sum())
        recent_units = int(grp[d_cols[-365:]].sum().sum())
        dept_rows.append(
            {
                "dept_id": dept_id,
                "cat_id": str(grp["cat_id"].iloc[0]),
                "sku_count": int(len(grp)),
                "total_units": total_units,
                "recent_365d_units": recent_units,
                "is_active_modeled": dept_id in ACTIVE_DEPARTMENTS,
            }
        )
    dept_rows.sort(key=lambda x: x["total_units"], reverse=True)
    with open(DATASETS_DIR / "ca1_dept_summary.json", "w", encoding="utf-8") as f:
        json.dump(dept_rows, f, indent=2)

    # Filter to configured store(s) and department(s)
    subset = sales_wide[
        sales_wide["store_id"].isin(ACTIVE_STORES)
        & sales_wide["dept_id"].isin(ACTIVE_DEPARTMENTS)
    ].copy()

    # Select stratified long-history active products using ONLY training period stats (no leakage!)
    train_d_cols = [f"d_{i}" for i in range(1, TRAIN_END_D + 1)]
    early_cols = [f"d_{i}" for i in range(1, 366)]
    recent_train_cols = [f"d_{i}" for i in range(TRAIN_END_D - 364, TRAIN_END_D + 1)]

    subset["early_active_days"] = (subset[early_cols] > 0).sum(axis=1)
    subset["recent_train_zero_rate"] = (subset[recent_train_cols] == 0).mean(axis=1)
    subset["train_mean_sales"] = subset[recent_train_cols].mean(axis=1)

    eligible = subset[
        (subset["early_active_days"] >= 100) & (subset["recent_train_zero_rate"] < 0.25)
    ].sort_values("train_mean_sales", ascending=False)

    if len(eligible) < NUM_PRODUCTS:
        eligible = subset.sort_values("train_mean_sales", ascending=False)

    # Stratified pick across fast, medium, and steady movers within eligible items
    n_fast = min(15, NUM_PRODUCTS)
    n_mid = min(12, max(0, NUM_PRODUCTS - n_fast))
    n_steady = max(0, NUM_PRODUCTS - n_fast - n_mid)

    fast_items = eligible.iloc[:n_fast]
    remaining = eligible.iloc[n_fast:]
    mid_idx = np.linspace(0, max(0, len(remaining) // 2 - 1), n_mid, dtype=int) if n_mid > 0 else []
    mid_items = remaining.iloc[mid_idx] if len(mid_idx) > 0 else remaining.iloc[0:0]
    tail = remaining.iloc[len(remaining) // 2 :]
    steady_idx = np.linspace(0, max(0, len(tail) - 1), n_steady, dtype=int) if n_steady > 0 else []
    steady_items = tail.iloc[steady_idx] if len(steady_idx) > 0 else tail.iloc[0:0]

    selected = pd.concat([fast_items, mid_items, steady_items]).drop_duplicates(subset=["item_id"]).head(NUM_PRODUCTS)
    selected_items = selected["item_id"].tolist()

    # Map calendar d_1 .. d_1969 (calendar rows are chronological starting d_1)
    calendar = calendar.copy().reset_index(drop=True)
    calendar["d_idx"] = np.arange(1, len(calendar) + 1)
    calendar["d"] = "d_" + calendar["d_idx"].astype(str)
    calendar["date"] = pd.to_datetime(calendar["date"])

    # Fill missing event metadata safely
    calendar_missing_events = int(calendar["event_name_1"].isna().sum())
    for col in ["event_name_1", "event_type_1", "event_name_2", "event_type_2"]:
        calendar[col] = calendar[col].fillna("None").astype(str)

    # Melt selected sales to long format
    id_vars = ["item_id", "dept_id", "cat_id", "store_id", "state_id"]
    selected_sales = subset[subset["item_id"].isin(selected_items)][id_vars + d_cols].copy()

    long_df = selected_sales.melt(
        id_vars=id_vars,
        value_vars=d_cols,
        var_name="d",
        value_name="sales",
    )
    long_df["sales"] = long_df["sales"].clip(lower=0).astype(np.float32)

    # Merge calendar
    long_df = long_df.merge(
        calendar[
            [
                "d",
                "d_idx",
                "date",
                "wm_yr_wk",
                "weekday",
                "wday",
                "month",
                "year",
                "event_name_1",
                "event_type_1",
                "snap_CA",
            ]
        ],
        on="d",
        how="left",
    )

    # Merge sell prices
    prices_sub = prices[
        prices["store_id"].isin(ACTIVE_STORES) & prices["item_id"].isin(selected_items)
    ].copy()
    long_df = long_df.merge(
        prices_sub,
        on=["store_id", "item_id", "wm_yr_wk"],
        how="left",
    )

    long_df = long_df.sort_values(["store_id", "item_id", "d_idx"]).reset_index(drop=True)

    # Handle missing prices causally: forward-fill per item, then backfill ONLY using training window if needed
    missing_prices_before = int(long_df["sell_price"].isna().sum())
    long_df["sell_price"] = long_df.groupby(["store_id", "item_id"])["sell_price"].ffill()
    # If an item had missing price at d_1 before its first price week, fill from first known training price
    first_train_price = (
        long_df[long_df["d_idx"] <= TRAIN_END_D]
        .dropna(subset=["sell_price"])
        .groupby(["store_id", "item_id"])["sell_price"]
        .first()
    )
    long_df["sell_price"] = long_df.apply(
        lambda r: first_train_price.get((r["store_id"], r["item_id"]), 1.0)
        if pd.isna(r["sell_price"])
        else r["sell_price"],
        axis=1,
    )
    missing_prices_after = int(long_df["sell_price"].isna().sum())

    # Assign human-friendly SKU label alongside dataset ID
    item_meta = (
        long_df[long_df["d_idx"] <= TRAIN_END_D]
        .groupby("item_id")
        .agg(train_mean=("sales", "mean"), avg_price=("sell_price", "mean"))
        .reset_index()
        .sort_values("train_mean", ascending=False)
    )
    tier_map = {}
    for rank, row in enumerate(item_meta.itertuples(), start=1):
        if rank <= 12:
            tier_map[row.item_id] = "Fast-Moving Staple"
        elif rank <= 24:
            tier_map[row.item_id] = "Core Everyday Item"
        else:
            tier_map[row.item_id] = "Steady Specialty Item"

    long_df["velocity_tier"] = long_df["item_id"].map(tier_map)

    # Save processed dataset
    output_pkl = DATASETS_DIR / "processed_sales.pkl"
    long_df.to_pickle(output_pkl)

    # Also save future calendar rows (d_1942..d_1969) for live forecasting beyond d_1941
    future_cal = calendar[calendar["d_idx"] > TEST_END_D].copy()
    future_cal.to_pickle(DATASETS_DIR / "future_calendar.pkl")

    report = {
        "store_id": ACTIVE_STORES[0],
        "dept_id": ACTIVE_DEPARTMENTS[0],
        "num_products": int(long_df["item_id"].nunique()),
        "selected_items": selected_items,
        "total_records": int(len(long_df)),
        "date_min": str(long_df["date"].min().date()),
        "date_max": str(long_df["date"].max().date()),
        "splits": {
            "train": {"d_start": 1, "d_end": TRAIN_END_D, "days": TRAIN_END_D},
            "validation": {
                "d_start": VAL_START_D,
                "d_end": VAL_END_D,
                "days": VAL_END_D - VAL_START_D + 1,
            },
            "test": {
                "d_start": TEST_START_D,
                "d_end": TEST_END_D,
                "days": TEST_END_D - TEST_START_D + 1,
            },
        },
        "data_quality": {
            "sales_duplicates_removed": sales_dups,
            "calendar_duplicates_removed": cal_dups,
            "price_duplicates_removed": price_dups,
            "calendar_missing_events_filled": calendar_missing_events,
            "missing_prices_before_imputation": missing_prices_before,
            "missing_prices_after_imputation": missing_prices_after,
            "missing_sales_values": int(long_df["sales"].isna().sum()),
        },
    }
    with open(DATASETS_DIR / "preprocessing_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print("Preprocessing complete:")
    print(json.dumps(report["data_quality"], indent=2))
    print(f"Saved {len(long_df)} rows for {report['num_products']} products to {output_pkl}")
    return long_df


if __name__ == "__main__":
    run_preprocessing()
