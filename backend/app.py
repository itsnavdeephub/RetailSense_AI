import json
import os
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

from backend.database import InventoryState, db, seed_demo_inventory
from backend.inventory_engine import InventoryInput, compute_inventory_recommendation
from backend.reports import build_pdf_report, rows_to_csv_bytes
from ml.config import DATASETS_DIR, MODELS_DIR, RESULTS_DIR
from ml.inference import get_forecaster_service


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__)
    db_path = Path(__file__).resolve().parent / "retailsense.db"
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    if test_config:
        app.config.update(test_config)

    CORS(app, resources={r"/api/*": {"origins": "*"}})
    db.init_app(app)

    with app.app_context():
        db.create_all()
        try:
            svc = get_forecaster_service()
            seed_demo_inventory(svc)
        except FileNotFoundError:
            pass

    def _require_service():
        try:
            svc = get_forecaster_service()
            with app.app_context():
                seed_demo_inventory(svc)
            return svc, None
        except FileNotFoundError as exc:
            return None, (
                jsonify(
                    {
                        "error": "Processed dataset or model artifacts are missing. Run `python -m ml.run_pipeline` first.",
                        "details": str(exc),
                    }
                ),
                503,
            )

    def _compute_all_inventory(svc, model_name: str = "best") -> tuple[list[dict], dict]:
        states = {s.item_id: s for s in InventoryState.query.all()}
        resolved_model = (
            svc.resolve_best_model("mae") if model_name == "best" else model_name
        )
        rows = []
        counts = {"healthy": 0, "low_stock": 0, "critical": 0, "overstock": 0}
        total_excess_units = 0.0
        total_excess_value = 0.0
        total_inv_pos = 0.0
        total_target = 0.0

        for item_id in svc.available_items():
            st = states.get(item_id)
            if st is None:
                continue
            grp = svc.item_groups[item_id]
            unit_price = float(grp["sell_price"].iloc[-1])
            velocity_tier = str(grp["velocity_tier"].iloc[-1])
            recent_30d_avg = float(grp["sales"].tail(30).mean())

            horizon_needed = max(7, min(28, int(st.lead_time_days) + int(st.review_period_days)))
            fc = svc.predict(item_id, model_name=resolved_model, horizon=horizon_needed)
            daily_preds = [r["predicted_demand"] for r in fc["forecast"]]
            pred_7d_sum = round(sum(daily_preds[:7]), 2)

            res_std = fc.get("validation_residual_std") or max(0.5, recent_30d_avg * 0.25)
            inv_in = InventoryInput(
                item_id=item_id,
                current_stock=st.current_stock,
                incoming_stock=st.incoming_stock,
                backorders=st.backorders,
                lead_time_days=st.lead_time_days,
                review_period_days=st.review_period_days,
                service_level=st.service_level,
            )
            rec = compute_inventory_recommendation(
                inv_in,
                daily_forecast=daily_preds,
                daily_error_std=float(res_std),
                unit_price=unit_price,
            )
            counts[rec["status"]] = counts.get(rec["status"], 0) + 1
            total_excess_units += rec["excess_units"]
            total_excess_value += rec["excess_value_usd"]
            total_inv_pos += rec["inventory_position"]
            total_target += rec["target_stock"]

            rows.append(
                {
                    **st.to_dict(),
                    "velocity_tier": velocity_tier,
                    "unit_price": round(unit_price, 2),
                    "recent_30d_avg": round(recent_30d_avg, 2),
                    "predicted_7d_demand": pred_7d_sum,
                    "model_used": resolved_model,
                    **rec,
                }
            )

        summary = {
            "counts": counts,
            "total_products": len(rows),
            "reorder_required": counts["low_stock"] + counts["critical"],
            "total_excess_units": round(total_excess_units, 1),
            "total_excess_value_usd": round(total_excess_value, 2),
            "inventory_alignment_pct": round(
                max(0.0, 100.0 - (abs(total_inv_pos - total_target) / max(total_target, 1.0)) * 100.0),
                1,
            ),
            "model_used": resolved_model,
        }
        return rows, summary

    @app.get("/api/health")
    def health():
        dataset_ready = (DATASETS_DIR / "processed_sales.pkl").exists()
        lgbm_ready = (MODELS_DIR / "lightgbm_forecaster.joblib").exists()
        lstm_ready = (MODELS_DIR / "lstm_best.pt").exists()
        eval_ready = (RESULTS_DIR / "evaluation_summary.json").exists()
        return jsonify(
            {
                "status": "ok" if (dataset_ready and eval_ready) else "initializing",
                "dataset_ready": dataset_ready,
                "models": {
                    "seasonal_naive": dataset_ready,
                    "moving_average": dataset_ready,
                    "lightgbm": lgbm_ready,
                    "lstm": lstm_ready,
                },
                "evaluation_ready": eval_ready,
            }
        )

    @app.get("/api/metadata")
    def metadata():
        svc, err = _require_service()
        if err:
            return err

        prep_report = {}
        prep_path = DATASETS_DIR / "preprocessing_report.json"
        if prep_path.exists():
            prep_report = json.loads(prep_path.read_text(encoding="utf-8"))

        dept_path = DATASETS_DIR / "ca1_dept_summary.json"
        dept_summary = (
            json.loads(dept_path.read_text(encoding="utf-8")) if dept_path.exists() else []
        )

        products = []
        for item_id in svc.available_items():
            grp = svc.item_groups[item_id]
            products.append(
                {
                    "item_id": item_id,
                    "store_id": str(grp["store_id"].iloc[-1]),
                    "dept_id": str(grp["dept_id"].iloc[-1]),
                    "cat_id": str(grp["cat_id"].iloc[-1]),
                    "velocity_tier": str(grp["velocity_tier"].iloc[-1]),
                    "avg_price": round(float(grp["sell_price"].iloc[-1]), 2),
                    "recent_30d_avg": round(float(grp["sales"].tail(30).mean()), 2),
                    "total_sales": int(grp["sales"].sum()),
                }
            )

        return jsonify(
            {
                "stores": [
                    {
                        "store_id": "CA_1",
                        "label": "CA_1 — California Store 1 (Active)",
                        "state": "CA",
                        "active": True,
                    }
                ],
                "departments": ["FOODS_3"],
                "products": products,
                "date_min": prep_report.get("date_min", "2011-01-29"),
                "date_max": prep_report.get("date_max", "2016-05-22"),
                "models_available": {
                    "seasonal_naive": svc.is_model_available("seasonal_naive"),
                    "moving_average": svc.is_model_available("moving_average"),
                    "lightgbm": svc.is_model_available("lightgbm"),
                    "lstm": svc.is_model_available("lstm"),
                },
                "best_model": svc.resolve_best_model("mae"),
                "department_summary": dept_summary,
                "preprocessing_report": prep_report,
            }
        )

    @app.get("/api/dashboard/summary")
    def dashboard_summary():
        svc, err = _require_service()
        if err:
            return err

        store_id = request.args.get("store_id", "CA_1")
        item_id = request.args.get("item_id", "ALL")
        days = int(request.args.get("days", 60))
        days = max(14, min(365, days))

        if store_id != "CA_1":
            return jsonify({"error": f"Store '{store_id}' is not enabled in the active dataset configuration."}), 400

        df = svc.df
        if item_id != "ALL":
            if item_id not in svc.item_groups:
                return jsonify({"error": f"Unknown product '{item_id}'."}), 404
            df_scope = svc.item_groups[item_id]
        else:
            df_scope = df

        total_historical_sales = int(df_scope["sales"].sum())
        last_90 = df_scope[df_scope["d_idx"] > int(df_scope["d_idx"].max()) - 90]
        hist_daily = (
            last_90.groupby("date")["sales"]
            .sum()
            .reset_index()
            .sort_values("date")
        )
        hist_tail = hist_daily.tail(days)
        hist_spark = [round(float(v), 1) for v in hist_daily.tail(14)["sales"].values]

        # Best model 7-day aggregate forecast
        best_model = svc.resolve_best_model("mae")
        target_items = [item_id] if item_id != "ALL" else svc.available_items()

        forecast_by_date = {}
        total_predicted_7d = 0.0
        for it in target_items:
            fc = svc.predict(it, model_name=best_model, horizon=7)
            for row in fc["forecast"]:
                dt = row["date"]
                forecast_by_date[dt] = forecast_by_date.get(dt, 0.0) + row["predicted_demand"]
                total_predicted_7d += row["predicted_demand"]

        forecast_dates = sorted(forecast_by_date.keys())
        fc_spark = [round(forecast_by_date[d], 1) for d in forecast_dates]

        chart_series = []
        for _, r in hist_tail.iterrows():
            chart_series.append(
                {
                    "date": pd.Timestamp(r["date"]).strftime("%Y-%m-%d"),
                    "historical": round(float(r["sales"]), 2),
                    "forecast": None,
                }
            )
        # Bridge point for clean visual continuity between last historical day and forecast
        if chart_series and forecast_dates:
            last_hist = chart_series[-1]
            last_hist["forecast"] = last_hist["historical"]

        for d in forecast_dates:
            chart_series.append(
                {
                    "date": d,
                    "historical": None,
                    "forecast": round(forecast_by_date[d], 2),
                }
            )

        inv_rows, inv_summary = _compute_all_inventory(svc, model_name=best_model)

        # Top selling products (last 30 days)
        max_d = int(df["d_idx"].max())
        recent_30 = df[df["d_idx"] > max_d - 30]
        top_selling = (
            recent_30.groupby("item_id")
            .agg(units=("sales", "sum"), avg_price=("sell_price", "mean"))
            .reset_index()
            .sort_values("units", ascending=False)
            .head(8)
        )
        top_products = [
            {
                "item_id": r["item_id"],
                "units_30d": int(round(r["units"])),
                "est_revenue": round(float(r["units"] * r["avg_price"]), 2),
            }
            for _, r in top_selling.iterrows()
        ]

        # Alerts & upcoming replenishment recommendations
        alerts = [
            {
                "item_id": r["item_id"],
                "status": r["status"],
                "inventory_position": r["inventory_position"],
                "reorder_point": r["reorder_point"],
                "estimated_days_of_stock": r["estimated_days_of_stock"],
                "recommended_order_qty": r["recommended_order_qty"],
            }
            for r in sorted(
                [x for x in inv_rows if x["status"] in ("critical", "low_stock")],
                key=lambda x: (0 if x["status"] == "critical" else 1, x["estimated_days_of_stock"]),
            )[:6]
        ]

        upcoming_replenishments = [
            {
                "item_id": r["item_id"],
                "status": r["status"],
                "current_stock": r["current_stock"],
                "predicted_7d_demand": r["predicted_7d_demand"],
                "recommended_order_qty": r["recommended_order_qty"],
                "lead_time_days": r["lead_time_days"],
            }
            for r in sorted(
                [x for x in inv_rows if x["recommended_order_qty"] > 0],
                key=lambda x: x["recommended_order_qty"],
                reverse=True,
            )[:6]
        ]

        best_test_metrics = svc.eval_summary.get("test_metrics", {}).get(best_model, {})
        best_val_metrics = svc.eval_summary.get("validation_metrics", {}).get(best_model, {})

        return jsonify(
            {
                "kpis": {
                    "total_historical_sales": total_historical_sales,
                    "historical_sparkline": hist_spark,
                    "predicted_demand_7d": round(total_predicted_7d, 1),
                    "forecast_sparkline": fc_spark,
                    "products_requiring_reorder": inv_summary["reorder_required"],
                    "critical_stock_count": inv_summary["counts"]["critical"],
                    "best_model": {
                        "id": best_model,
                        "name": svc.eval_summary.get("model_metadata", {}).get(best_model, {}).get("name", best_model),
                        "val_mae": best_val_metrics.get("mae"),
                        "test_mae": best_test_metrics.get("mae"),
                        "test_wape": best_test_metrics.get("wape"),
                    },
                },
                "forecast_chart": chart_series,
                "inventory_health": inv_summary["counts"],
                "top_products": top_products,
                "alerts": alerts,
                "upcoming_replenishments": upcoming_replenishments,
                "scope": {
                    "store_id": store_id,
                    "item_id": item_id,
                    "days": days,
                    "model_used": best_model,
                },
            }
        )

    @app.get("/api/sales/analytics")
    def sales_analytics():
        svc, err = _require_service()
        if err:
            return err

        store_id = request.args.get("store_id", "CA_1")
        item_id = request.args.get("item_id", "ALL")
        start_date = request.args.get("start_date", "2015-05-23")
        end_date = request.args.get("end_date", "2016-05-22")
        aggregation = request.args.get("aggregation", "weekly")

        if store_id != "CA_1":
            return jsonify({"error": f"Store '{store_id}' is not enabled."}), 400
        if aggregation not in ("daily", "weekly", "monthly"):
            return jsonify({"error": "Aggregation must be daily, weekly, or monthly."}), 400

        df = svc.df.copy()
        try:
            sd = pd.to_datetime(start_date)
            ed = pd.to_datetime(end_date)
        except Exception:
            return jsonify({"error": "Invalid start_date or end_date format. Use YYYY-MM-DD."}), 400

        mask = (df["date"] >= sd) & (df["date"] <= ed)
        if item_id != "ALL":
            if item_id not in svc.item_groups:
                return jsonify({"error": f"Unknown product '{item_id}'."}), 404
            mask = mask & (df["item_id"] == item_id)

        filtered = df[mask].copy()
        if filtered.empty:
            return jsonify({"error": "No sales records match the selected date range and filters."}), 404

        filtered["revenue"] = filtered["sales"] * filtered["sell_price"]

        # Time-series trend aggregation
        if aggregation == "daily":
            grp = filtered.groupby("date", as_index=False).agg(units=("sales", "sum"), revenue=("revenue", "sum"))
            grp["period"] = grp["date"].dt.strftime("%Y-%m-%d")
        elif aggregation == "weekly":
            grp = (
                filtered.set_index("date")
                .resample("W-SUN")
                .agg(units=("sales", "sum"), revenue=("revenue", "sum"))
                .reset_index()
            )
            grp["period"] = grp["date"].dt.strftime("%Y-%m-%d")
        else:
            grp = (
                filtered.set_index("date")
                .resample("ME")
                .agg(units=("sales", "sum"), revenue=("revenue", "sum"))
                .reset_index()
            )
            grp["period"] = grp["date"].dt.strftime("%Y-%m")

        trend = [
            {
                "period": r["period"],
                "units": round(float(r["units"]), 1),
                "revenue": round(float(r["revenue"]), 2),
            }
            for _, r in grp.iterrows()
        ]

        # Product-wise comparison (across all 35 products in selected date window)
        all_in_dates = df[(df["date"] >= sd) & (df["date"] <= ed)].copy()
        all_in_dates["revenue"] = all_in_dates["sales"] * all_in_dates["sell_price"]
        prod_stats = (
            all_in_dates.groupby("item_id", as_index=False)
            .agg(
                total_units=("sales", "sum"),
                avg_daily_units=("sales", "mean"),
                avg_price=("sell_price", "mean"),
                total_revenue=("revenue", "sum"),
            )
            .sort_values("total_units", ascending=False)
        )
        product_comparison = [
            {
                "item_id": r["item_id"],
                "total_units": int(round(r["total_units"])),
                "avg_daily_units": round(float(r["avg_daily_units"]), 2),
                "avg_price": round(float(r["avg_price"]), 2),
                "total_revenue": round(float(r["total_revenue"]), 2),
            }
            for _, r in prod_stats.iterrows()
        ]

        # Seasonal demand heatmap: Month (1..12) x Weekday (Mon..Sun)
        filtered["day_name"] = filtered["date"].dt.day_name().str.slice(0, 3)
        day_order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        hm = (
            filtered.groupby(["month", "day_name"])["sales"]
            .mean()
            .unstack(fill_value=0.0)
        )
        heatmap = []
        month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        for m in sorted(hm.index.tolist()):
            row = {"month": month_names[m - 1], "month_num": int(m)}
            for dn in day_order:
                row[dn] = round(float(hm.loc[m, dn]) if dn in hm.columns else 0.0, 2)
            heatmap.append(row)

        # Department distribution from CA_1 real M5 summary
        dept_path = DATASETS_DIR / "ca1_dept_summary.json"
        dept_dist = json.loads(dept_path.read_text(encoding="utf-8")) if dept_path.exists() else []

        return jsonify(
            {
                "summary": {
                    "total_units": int(round(filtered["sales"].sum())),
                    "total_revenue": round(float(filtered["revenue"].sum()), 2),
                    "avg_daily_units": round(float(filtered.groupby("date")["sales"].sum().mean()), 2),
                    "highest_selling": product_comparison[0] if product_comparison else None,
                    "lowest_selling": product_comparison[-1] if product_comparison else None,
                },
                "trend": trend,
                "product_comparison": product_comparison,
                "price_vs_sales": product_comparison,
                "seasonal_heatmap": heatmap,
                "department_distribution": dept_dist,
            }
        )

    @app.get("/api/sales/export")
    def sales_export():
        svc, err = _require_service()
        if err:
            return err

        item_id = request.args.get("item_id", "ALL")
        start_date = request.args.get("start_date", "2015-05-23")
        end_date = request.args.get("end_date", "2016-05-22")

        df = svc.df.copy()
        mask = (df["date"] >= pd.to_datetime(start_date)) & (df["date"] <= pd.to_datetime(end_date))
        if item_id != "ALL":
            mask = mask & (df["item_id"] == item_id)
        sub = df[mask].sort_values(["date", "item_id"])

        headers = ["date", "store_id", "dept_id", "item_id", "sales", "sell_price", "weekday", "event_name_1"]
        rows = [
            [
                pd.Timestamp(r["date"]).strftime("%Y-%m-%d"),
                r["store_id"],
                r["dept_id"],
                r["item_id"],
                int(r["sales"]),
                round(float(r["sell_price"]), 2),
                r["weekday"],
                r["event_name_1"],
            ]
            for _, r in sub.iterrows()
        ]
        csv_bytes = rows_to_csv_bytes(headers, rows)
        return Response(
            csv_bytes,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename=retailsense_sales_{item_id}.csv"},
        )

    @app.post("/api/forecast/generate")
    def forecast_generate():
        svc, err = _require_service()
        if err:
            return err

        payload = request.get_json(silent=True) or {}
        store_id = payload.get("store_id", "CA_1")
        item_id = payload.get("item_id")
        model_name = payload.get("model", "best")
        horizon = int(payload.get("horizon", 7))

        if store_id != "CA_1":
            return jsonify({"error": f"Store '{store_id}' is not currently enabled."}), 400
        if not item_id or item_id not in svc.item_groups:
            return jsonify({"error": "Please select a valid product item_id."}), 400
        if model_name not in ("best", "seasonal_naive", "moving_average", "lightgbm", "lstm"):
            return jsonify({"error": f"Unsupported model '{model_name}'."}), 400
        if horizon < 1 or horizon > 28:
            return jsonify({"error": "Forecast horizon must be between 1 and 28 days."}), 400

        try:
            result = svc.predict(item_id=item_id, model_name=model_name, horizon=horizon)
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 503
        except Exception as exc:
            return jsonify({"error": f"Forecast generation failed: {exc}"}), 500

        grp = svc.item_groups[item_id]
        hist_tail = grp.tail(45)
        historical = [
            {
                "date": pd.Timestamp(r["date"]).strftime("%Y-%m-%d"),
                "actual_sales": float(r["sales"]),
                "sell_price": round(float(r["sell_price"]), 2),
            }
            for _, r in hist_tail.iterrows()
        ]

        fc_rows = result["forecast"]
        total_pred = sum(r["predicted_demand"] for r in fc_rows)
        avg_daily = total_pred / len(fc_rows)
        peak_row = max(fc_rows, key=lambda r: r["predicted_demand"])
        recent_7d_avg = float(grp["sales"].tail(7).mean())
        trend_pct = ((avg_daily - recent_7d_avg) / max(recent_7d_avg, 0.1)) * 100.0

        # Combined chart series
        chart_series = [
            {
                "date": h["date"],
                "historical": h["actual_sales"],
                "forecast": None,
                "lower_80": None,
                "upper_80": None,
            }
            for h in historical
        ]
        if chart_series and fc_rows:
            chart_series[-1]["forecast"] = chart_series[-1]["historical"]
        for f in fc_rows:
            chart_series.append(
                {
                    "date": f["date"],
                    "historical": None,
                    "forecast": f["predicted_demand"],
                    "lower_80": f.get("lower_80"),
                    "upper_80": f.get("upper_80"),
                }
            )

        return jsonify(
            {
                **result,
                "kpis": {
                    "total_predicted_demand": round(total_pred, 2),
                    "avg_daily_demand": round(avg_daily, 2),
                    "peak_demand_day": peak_row["date"],
                    "peak_demand_units": peak_row["predicted_demand"],
                    "trend_vs_last_7d_pct": round(trend_pct, 1),
                    "recent_7d_avg": round(recent_7d_avg, 2),
                },
                "historical": historical,
                "chart_series": chart_series,
            }
        )

    @app.get("/api/models/evaluation")
    def models_evaluation():
        svc, err = _require_service()
        if err:
            return err

        metric = request.args.get("metric", "mae")
        if metric not in ("mae", "rmse", "wape", "smape"):
            metric = "mae"

        item_id = request.args.get("item_id", "ALL")

        eval_sum = dict(svc.eval_summary)
        feat_path = RESULTS_DIR / "lightgbm_feature_importance.json"
        lstm_hist_path = RESULTS_DIR / "lstm_training_history.json"
        prod_eval_path = RESULTS_DIR / "product_evaluation.json"
        test_preds_path = RESULTS_DIR / "test_predictions.csv"

        feat_imp = json.loads(feat_path.read_text(encoding="utf-8")) if feat_path.exists() else []
        lstm_hist = json.loads(lstm_hist_path.read_text(encoding="utf-8")) if lstm_hist_path.exists() else {}
        prod_eval = json.loads(prod_eval_path.read_text(encoding="utf-8")) if prod_eval_path.exists() else []

        daily_comparison = eval_sum.get("daily_comparison", [])
        if item_id != "ALL" and test_preds_path.exists():
            tdf = pd.read_csv(test_preds_path)
            sub = tdf[tdf["item_id"] == item_id].sort_values("target_date")
            if not sub.empty:
                daily_comparison = [
                    {
                        "date": str(r["target_date"]),
                        "actual": round(float(r["y_true"]), 2),
                        "seasonal_naive": round(float(r["seasonal_naive"]), 2),
                        "moving_average": round(float(r["moving_average"]), 2),
                        "lightgbm": round(float(r["lightgbm"]), 2),
                        "lstm": round(float(r["lstm"]), 2),
                    }
                    for _, r in sub.iterrows()
                ]

        val_metrics = eval_sum.get("validation_metrics", {})
        best_for_metric = (
            min(val_metrics.keys(), key=lambda m: val_metrics[m][metric])
            if val_metrics
            else svc.resolve_best_model(metric)
        )

        return jsonify(
            {
                "selected_metric": metric,
                "best_model": best_for_metric,
                "evaluation_protocol": eval_sum.get("evaluation_protocol"),
                "validation_metrics": val_metrics,
                "test_metrics": eval_sum.get("test_metrics", {}),
                "model_metadata": eval_sum.get("model_metadata", {}),
                "daily_comparison": daily_comparison,
                "error_distribution": eval_sum.get("error_distribution", []),
                "lstm_training_history": lstm_hist,
                "feature_importance": feat_imp,
                "product_evaluation": prod_eval,
            }
        )

    @app.get("/api/inventory")
    def inventory_list():
        svc, err = _require_service()
        if err:
            return err

        search = request.args.get("search", "").strip().lower()
        status_filter = request.args.get("status", "all").lower()
        model_name = request.args.get("model", "best")

        rows, summary = _compute_all_inventory(svc, model_name=model_name)
        if search:
            rows = [
                r for r in rows
                if search in r["item_id"].lower() or search in r["velocity_tier"].lower()
            ]
        if status_filter != "all":
            rows = [r for r in rows if r["status"] == status_filter]

        return jsonify(
            {
                "summary": summary,
                "items": rows,
                "demo_notice": "M5 Walmart dataset does not include real warehouse stock or supplier lead times. Initial stock levels are clearly labelled demonstration scenarios calibrated to product demand.",
            }
        )

    @app.get("/api/inventory/<item_id>")
    def inventory_item_detail(item_id: str):
        svc, err = _require_service()
        if err:
            return err
        if item_id not in svc.item_groups:
            return jsonify({"error": f"Unknown product '{item_id}'."}), 404

        st = InventoryState.query.filter_by(item_id=item_id).first()
        if st is None:
            return jsonify({"error": f"Inventory record missing for '{item_id}'."}), 404

        model_name = request.args.get("model", "best")
        horizon_needed = max(7, min(28, int(st.lead_time_days) + int(st.review_period_days)))
        fc = svc.predict(item_id, model_name=model_name, horizon=horizon_needed)
        daily_preds = [r["predicted_demand"] for r in fc["forecast"]]
        grp = svc.item_groups[item_id]
        unit_price = float(grp["sell_price"].iloc[-1])
        recent_30d_avg = float(grp["sales"].tail(30).mean())
        res_std = fc.get("validation_residual_std") or max(0.5, recent_30d_avg * 0.25)

        rec = compute_inventory_recommendation(
            InventoryInput(
                item_id=item_id,
                current_stock=st.current_stock,
                incoming_stock=st.incoming_stock,
                backorders=st.backorders,
                lead_time_days=st.lead_time_days,
                review_period_days=st.review_period_days,
                service_level=st.service_level,
            ),
            daily_forecast=daily_preds,
            daily_error_std=float(res_std),
            unit_price=unit_price,
        )

        hist_30 = [
            {
                "date": pd.Timestamp(r["date"]).strftime("%Y-%m-%d"),
                "sales": float(r["sales"]),
            }
            for _, r in grp.tail(30).iterrows()
        ]

        return jsonify(
            {
                **st.to_dict(),
                "velocity_tier": str(grp["velocity_tier"].iloc[-1]),
                "unit_price": round(unit_price, 2),
                "model_used": fc["model_used"],
                "historical_30d": hist_30,
                "forecast": fc["forecast"],
                **rec,
            }
        )

    @app.put("/api/inventory/<item_id>")
    def inventory_item_update(item_id: str):
        svc, err = _require_service()
        if err:
            return err
        if item_id not in svc.item_groups:
            return jsonify({"error": f"Unknown product '{item_id}'."}), 404

        st = InventoryState.query.filter_by(item_id=item_id).first()
        if st is None:
            return jsonify({"error": f"Inventory record missing for '{item_id}'."}), 404

        payload = request.get_json(silent=True) or {}
        try:
            current_stock = float(payload.get("current_stock", st.current_stock))
            incoming_stock = float(payload.get("incoming_stock", st.incoming_stock))
            backorders = float(payload.get("backorders", st.backorders))
            lead_time_days = int(payload.get("lead_time_days", st.lead_time_days))
            review_period_days = int(payload.get("review_period_days", st.review_period_days))
            service_level = float(payload.get("service_level", st.service_level))
        except (TypeError, ValueError):
            return jsonify({"error": "Invalid numeric inventory parameters."}), 400

        if current_stock < 0 or incoming_stock < 0 or backorders < 0:
            return jsonify({"error": "Stock values and backorders cannot be negative."}), 400
        if not (1 <= lead_time_days <= 60) or not (1 <= review_period_days <= 60):
            return jsonify({"error": "Lead time and review period must be between 1 and 60 days."}), 400
        if not (0.5 <= service_level <= 0.999):
            return jsonify({"error": "Service level must be between 0.50 and 0.999."}), 400

        st.current_stock = current_stock
        st.incoming_stock = incoming_stock
        st.backorders = backorders
        st.lead_time_days = lead_time_days
        st.review_period_days = review_period_days
        st.service_level = service_level
        st.scenario_label = "User Configured"
        db.session.commit()

        return inventory_item_detail(item_id)

    @app.post("/api/inventory/simulate")
    def inventory_simulate():
        svc, err = _require_service()
        if err:
            return err

        payload = request.get_json(silent=True) or {}
        item_id = payload.get("item_id")
        if not item_id or item_id not in svc.item_groups:
            return jsonify({"error": "Valid item_id is required."}), 400

        try:
            inv_in = InventoryInput(
                item_id=item_id,
                current_stock=float(payload.get("current_stock", 0)),
                incoming_stock=float(payload.get("incoming_stock", 0)),
                backorders=float(payload.get("backorders", 0)),
                lead_time_days=int(payload.get("lead_time_days", 3)),
                review_period_days=int(payload.get("review_period_days", 4)),
                service_level=float(payload.get("service_level", 0.95)),
            )
            model_name = payload.get("model", "best")
            horizon_needed = max(7, min(28, inv_in.lead_time_days + inv_in.review_period_days))
            fc = svc.predict(item_id, model_name=model_name, horizon=horizon_needed)
            daily_preds = [r["predicted_demand"] for r in fc["forecast"]]
            grp = svc.item_groups[item_id]
            unit_price = float(grp["sell_price"].iloc[-1])
            recent_30d_avg = float(grp["sales"].tail(30).mean())
            res_std = fc.get("validation_residual_std") or max(0.5, recent_30d_avg * 0.25)

            rec = compute_inventory_recommendation(
                inv_in,
                daily_forecast=daily_preds,
                daily_error_std=float(res_std),
                unit_price=unit_price,
            )
            return jsonify({"model_used": fc["model_used"], "unit_price": round(unit_price, 2), **rec})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @app.post("/api/inventory/reset")
    def inventory_reset():
        svc, err = _require_service()
        if err:
            return err
        seed_demo_inventory(svc, force_reset=True)
        return jsonify({"message": "Inventory scenarios reset to calibrated demonstration defaults."})

    @app.get("/api/sustainability")
    def sustainability_insights():
        svc, err = _require_service()
        if err:
            return err

        rows, summary = _compute_all_inventory(svc, model_name="best")
        overstocked = [r for r in rows if r["status"] == "overstock"]
        overstocked.sort(key=lambda r: r["excess_units"], reverse=True)

        # Compare excess inventory under ML-guided target vs naive fixed 21-day stocking benchmark
        total_excess_units = summary["total_excess_units"]
        total_excess_value = summary["total_excess_value_usd"]

        # Avoidable overstock if orders follow AI target stock vs static 21-day buffer
        avoidable_units = 0.0
        for r in rows:
            static_buffer = r["avg_daily_predicted_demand"] * 21.0
            if static_buffer > r["target_stock"]:
                avoidable_units += max(0.0, static_buffer - r["target_stock"])

        return jsonify(
            {
                "sdg_alignment": [
                    "SDG 12: Responsible Consumption and Production",
                    "SDG 9: Industry, Innovation and Infrastructure",
                    "SDG 8: Decent Work and Economic Growth",
                ],
                "measurement_disclaimer": (
                    "All sustainability metrics below are simulated estimates derived from your configured/demo "
                    "inventory scenarios and ML demand forecasts. They do not represent measured physical waste or carbon audits."
                ),
                "indicators": {
                    "potential_excess_units": round(total_excess_units, 1),
                    "potential_excess_value_usd": round(total_excess_value, 2),
                    "estimated_avoidable_overstock_units": round(avoidable_units, 1),
                    "inventory_alignment_pct": summary["inventory_alignment_pct"],
                    "overstocked_sku_count": len(overstocked),
                },
                "wastage_risk_products": [
                    {
                        "item_id": r["item_id"],
                        "inventory_position": r["inventory_position"],
                        "target_stock": r["target_stock"],
                        "excess_units": r["excess_units"],
                        "excess_value_usd": r["excess_value_usd"],
                        "estimated_days_of_stock": r["estimated_days_of_stock"],
                        "scenario_label": r["scenario_label"],
                    }
                    for r in overstocked[:8]
                ],
            }
        )

    @app.get("/api/reports/export")
    def reports_export():
        svc, err = _require_service()
        if err:
            return err

        report_type = request.args.get("type", "sales_forecasting")
        fmt = request.args.get("format", "csv").lower()
        store_id = request.args.get("store_id", "CA_1")
        item_id = request.args.get("item_id", "ALL")
        model_name = request.args.get("model", "best")

        if fmt not in ("csv", "pdf"):
            return jsonify({"error": "Format must be csv or pdf."}), 400

        meta_pairs = [
            ("Store", store_id),
            ("Product Filter", item_id),
            ("Model", model_name),
            ("Generated", datetime.now().strftime("%Y-%m-%d %H:%M")),
        ]

        if report_type == "sales_forecasting":
            target_items = svc.available_items() if item_id == "ALL" else [item_id]
            headers = ["Item ID", "Date", "Horizon Day", "Predicted Demand", "Lower 80%", "Upper 80%", "Model Used"]
            rows = []
            for it in target_items:
                if it not in svc.item_groups:
                    continue
                fc = svc.predict(it, model_name=model_name, horizon=7)
                for r in fc["forecast"]:
                    rows.append([
                        it,
                        r["date"],
                        r["day_step"],
                        r["predicted_demand"],
                        r.get("lower_80", "-"),
                        r.get("upper_80", "-"),
                        r["model_used"],
                    ])
            title = "7-Day AI Sales Forecasting Report"
            subtitle = "Multi-SKU demand projections generated from trained forecasting models on M5 retail data."

        elif report_type == "inventory_recommendations":
            inv_rows, _ = _compute_all_inventory(svc, model_name=model_name)
            if item_id != "ALL":
                inv_rows = [r for r in inv_rows if r["item_id"] == item_id]
            headers = [
                "Item ID", "Current", "Inv Pos", "7d Forecast",
                "Safety Stock", "Reorder Pt", "Order Qty", "Days Left", "Status",
            ]
            rows = [
                [
                    r["item_id"], r["current_stock"], r["inventory_position"],
                    r["predicted_7d_demand"], r["safety_stock"], r["reorder_point"],
                    r["recommended_order_qty"], r["estimated_days_of_stock"], r["status"],
                ]
                for r in inv_rows
            ]
            title = "Inventory Replenishment Optimization Report"
            subtitle = "Safety stock, reorder points, and recommended replenishment quantities (demo/user stock inputs)."

        elif report_type == "model_evaluation":
            val_m = svc.eval_summary.get("validation_metrics", {})
            test_m = svc.eval_summary.get("test_metrics", {})
            headers = ["Model", "Split", "MAE", "RMSE", "WAPE (%)", "sMAPE (%)"]
            rows = []
            for m_key in ("seasonal_naive", "moving_average", "lightgbm", "lstm"):
                if m_key in val_m:
                    vm = val_m[m_key]
                    rows.append([m_key, "Validation (28d)", vm["mae"], vm["rmse"], vm["wape"], vm["smape"]])
                if m_key in test_m:
                    tm = test_m[m_key]
                    rows.append([m_key, "Test (28d)", tm["mae"], tm["rmse"], tm["wape"], tm["smape"]])
            title = "Forecasting Model Evaluation Report"
            subtitle = "Chronological rolling-origin benchmark across Seasonal Naive, Moving Average, LightGBM, and PyTorch LSTM."

        elif report_type == "product_performance":
            max_d = int(svc.df["d_idx"].max())
            recent = svc.df[svc.df["d_idx"] > max_d - 30].copy()
            if item_id != "ALL":
                recent = recent[recent["item_id"] == item_id]
            recent["revenue"] = recent["sales"] * recent["sell_price"]
            agg = recent.groupby("item_id", as_index=False).agg(
                units_30d=("sales", "sum"),
                avg_daily=("sales", "mean"),
                avg_price=("sell_price", "mean"),
                est_revenue=("revenue", "sum"),
                tier=("velocity_tier", "first"),
            ).sort_values("units_30d", ascending=False)
            headers = ["Item ID", "Velocity Tier", "30d Units", "Avg Daily", "Sell Price ($)", "30d Revenue ($)"]
            rows = [
                [
                    r["item_id"], r["tier"], int(round(r["units_30d"])),
                    round(float(r["avg_daily"]), 2), round(float(r["avg_price"]), 2),
                    round(float(r["est_revenue"]), 2),
                ]
                for _, r in agg.iterrows()
            ]
            title = "Product Sales Performance Report (Last 30 Days)"
            subtitle = "Historical SKU velocity, pricing, and revenue contribution for Store CA_1 (FOODS_3)."

        else:
            return jsonify({"error": f"Unknown report type '{report_type}'."}), 400

        if fmt == "csv":
            data = rows_to_csv_bytes(headers, rows)
            return Response(
                data,
                mimetype="text/csv",
                headers={"Content-Disposition": f"attachment; filename=retailsense_{report_type}.csv"},
            )

        pdf_bytes = build_pdf_report(title=title, subtitle=subtitle, metadata_pairs=meta_pairs, headers=headers, rows=rows)
        return Response(
            pdf_bytes,
            mimetype="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=retailsense_{report_type}.pdf"},
        )

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="127.0.0.1", port=port, debug=False)
