import json
import numpy as np
import pytest

from backend.app import create_app
from backend.inventory_engine import InventoryInput, compute_inventory_recommendation
from ml.config import TRAIN_END_D, VAL_START_D
from ml.metrics import compute_all_metrics, smape, wape


def test_metrics_zero_denominator_safety():
    y_true = np.array([0.0, 0.0, 0.0])
    y_pred = np.array([0.0, 0.0, 0.0])
    assert wape(y_true, y_pred) == 0.0
    assert smape(y_true, y_pred) == 0.0
    res = compute_all_metrics(y_true, y_pred)
    assert res == {"mae": 0.0, "rmse": 0.0, "wape": 0.0, "smape": 0.0}


def test_inventory_formulas_and_extended_horizon_warning():
    inv = InventoryInput(
        item_id="FOODS_3_090",
        current_stock=20.0,
        incoming_stock=5.0,
        backorders=3.0,
        lead_time_days=4,
        review_period_days=5,
        service_level=0.95,
    )
    daily_fc = [10.0] * 7
    rec = compute_inventory_recommendation(inv, daily_forecast=daily_fc, daily_error_std=2.0, unit_price=2.5)

    # Inventory Position = 20 + 5 - 3 = 22
    assert rec["inventory_position"] == 22.0
    # Protection period = 9 days > 7-day forecast => warning expected
    assert len(rec["warnings"]) == 1
    assert rec["demand_during_lead_time"] == 40.0
    assert rec["demand_during_protection_period"] == 90.0
    assert rec["reorder_point"] > 40.0
    assert rec["target_stock"] > 90.0
    assert rec["recommended_order_qty"] == int(round(rec["target_stock"] - 22.0))
    assert rec["status"] == "critical"


def test_inventory_validation_errors():
    inv = InventoryInput(
        item_id="FOODS_3_090",
        current_stock=-1.0,
        incoming_stock=0.0,
        backorders=0.0,
        lead_time_days=3,
        review_period_days=4,
        service_level=0.95,
    )
    with pytest.raises(ValueError):
        compute_inventory_recommendation(inv, daily_forecast=[5.0] * 7, daily_error_std=1.0)


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    db_file = tmp_path_factory.mktemp("data") / "test_retailsense.db"
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_file}"})
    with app.test_client() as c:
        yield c


def test_api_health_and_metadata(client):
    r_health = client.get("/api/health")
    assert r_health.status_code == 200
    body = r_health.get_json()
    assert body["dataset_ready"] is True
    assert body["models"]["lightgbm"] is True
    assert body["models"]["lstm"] is True

    r_meta = client.get("/api/metadata")
    assert r_meta.status_code == 200
    meta = r_meta.get_json()
    assert len(meta["products"]) == 35
    assert meta["stores"][0]["store_id"] == "CA_1"


def test_api_dashboard_and_analytics(client):
    r_dash = client.get("/api/dashboard/summary?store_id=CA_1&days=60")
    assert r_dash.status_code == 200
    dash = r_dash.get_json()
    assert dash["kpis"]["total_historical_sales"] > 0
    assert dash["kpis"]["predicted_demand_7d"] >= 0
    assert len(dash["forecast_chart"]) >= 60

    r_sales = client.get("/api/sales/analytics?store_id=CA_1&aggregation=weekly")
    assert r_sales.status_code == 200
    sales = r_sales.get_json()
    assert len(sales["trend"]) > 0
    assert len(sales["seasonal_heatmap"]) > 0


def test_api_forecast_all_models_non_negative(client):
    for model_name in ("seasonal_naive", "moving_average", "lightgbm", "lstm", "best"):
        r = client.post(
            "/api/forecast/generate",
            json={"store_id": "CA_1", "item_id": "FOODS_3_090", "model": model_name, "horizon": 7},
        )
        assert r.status_code == 200
        data = r.get_json()
        assert len(data["forecast"]) == 7
        for step in data["forecast"]:
            assert step["predicted_demand"] >= 0.0

    # Invalid product returns 400
    r_bad = client.post(
        "/api/forecast/generate",
        json={"store_id": "CA_1", "item_id": "INVALID_SKU", "model": "best", "horizon": 7},
    )
    assert r_bad.status_code == 400


def test_api_models_evaluation_and_chronological_splits(client):
    assert TRAIN_END_D < VAL_START_D
    r = client.get("/api/models/evaluation?metric=mae")
    assert r.status_code == 200
    ev = r.get_json()
    for m in ("seasonal_naive", "moving_average", "lightgbm", "lstm"):
        assert m in ev["test_metrics"]
        assert ev["test_metrics"][m]["mae"] >= 0


def test_api_inventory_crud_simulation_and_reports(client):
    r_inv = client.get("/api/inventory")
    assert r_inv.status_code == 200
    inv = r_inv.get_json()
    assert len(inv["items"]) == 35

    r_upd = client.put(
        "/api/inventory/FOODS_3_090",
        json={
            "current_stock": 15,
            "incoming_stock": 0,
            "backorders": 2,
            "lead_time_days": 4,
            "review_period_days": 5,
            "service_level": 0.95,
        },
    )
    assert r_upd.status_code == 200
    upd = r_upd.get_json()
    assert upd["inventory_position"] == 13.0
    assert upd["recommended_order_qty"] > 0

    r_sim = client.post(
        "/api/inventory/simulate",
        json={
            "item_id": "FOODS_3_090",
            "current_stock": 500,
            "incoming_stock": 0,
            "backorders": 0,
            "lead_time_days": 3,
            "review_period_days": 4,
            "service_level": 0.95,
        },
    )
    assert r_sim.status_code == 200
    assert r_sim.get_json()["recommended_order_qty"] == 0

    for fmt in ("csv", "pdf"):
        r_rep = client.get(f"/api/reports/export?type=inventory_recommendations&format={fmt}")
        assert r_rep.status_code == 200
        assert len(r_rep.data) > 100
