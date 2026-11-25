from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class InventoryState(db.Model):
    __tablename__ = "inventory_state"

    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.String(64), unique=True, nullable=False, index=True)
    store_id = db.Column(db.String(32), nullable=False, default="CA_1")
    dept_id = db.Column(db.String(32), nullable=False, default="FOODS_3")
    current_stock = db.Column(db.Float, nullable=False)
    incoming_stock = db.Column(db.Float, nullable=False, default=0.0)
    backorders = db.Column(db.Float, nullable=False, default=0.0)
    lead_time_days = db.Column(db.Integer, nullable=False, default=3)
    review_period_days = db.Column(db.Integer, nullable=False, default=4)
    service_level = db.Column(db.Float, nullable=False, default=0.95)
    scenario_label = db.Column(db.String(64), nullable=False, default="Demo Scenario")
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        return {
            "item_id": self.item_id,
            "store_id": self.store_id,
            "dept_id": self.dept_id,
            "current_stock": round(float(self.current_stock), 2),
            "incoming_stock": round(float(self.incoming_stock), 2),
            "backorders": round(float(self.backorders), 2),
            "lead_time_days": int(self.lead_time_days),
            "review_period_days": int(self.review_period_days),
            "service_level": float(self.service_level),
            "scenario_label": self.scenario_label,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


def seed_demo_inventory(forecaster, force_reset: bool = False) -> None:
    """
    Seed clearly labelled demonstration inventory scenarios into SQLite.
    Because the M5 dataset does not include real inventory on-hand or supplier
    lead times, initial stock scenarios are deterministic demonstration profiles
    calibrated against each product's predicted daily demand.
    """
    existing_count = InventoryState.query.count()
    if existing_count > 0 and not force_reset:
        return

    if force_reset:
        InventoryState.query.delete()
        db.session.commit()

    items = forecaster.available_items()
    for idx, item_id in enumerate(items):
        fc = forecaster.predict(item_id, model_name="best", horizon=7)
        avg_daily = max(0.5, sum(r["predicted_demand"] for r in fc["forecast"]) / 7.0)
        grp = forecaster.item_groups[item_id]
        store_id = str(grp["store_id"].iloc[-1])
        dept_id = str(grp["dept_id"].iloc[-1])

        # Deterministic mix of critical, low_stock, healthy, and overstock demo scenarios
        bucket = idx % 10
        lead_time = 2 + (idx % 4)       # 2 to 5 days
        review_period = 3 + (idx % 4)   # 3 to 6 days
        service_level = 0.95

        if bucket in (0, 5):
            # Critical: stock covers ~1.2 days (< lead time)
            current_stock = round(avg_daily * 1.2)
            incoming_stock = 0.0
            backorders = round(avg_daily * 0.3) if bucket == 0 else 0.0
        elif bucket in (1, 4, 8):
            # Low stock: below reorder point
            current_stock = round(avg_daily * (lead_time + 1.0))
            incoming_stock = round(avg_daily * 0.5) if bucket == 4 else 0.0
            backorders = 0.0
        elif bucket == 9:
            # Potential overstock: ~24 days of stock
            current_stock = round(avg_daily * 24.0)
            incoming_stock = round(avg_daily * 3.0)
            backorders = 0.0
        else:
            # Healthy stock: comfortably covers protection period
            current_stock = round(avg_daily * (lead_time + review_period + 3.0))
            incoming_stock = round(avg_daily * 1.5) if bucket % 2 == 0 else 0.0
            backorders = 0.0

        row = InventoryState(
            item_id=item_id,
            store_id=store_id,
            dept_id=dept_id,
            current_stock=float(max(0, current_stock)),
            incoming_stock=float(incoming_stock),
            backorders=float(backorders),
            lead_time_days=lead_time,
            review_period_days=review_period,
            service_level=service_level,
            scenario_label="Demo Scenario",
        )
        db.session.add(row)

    db.session.commit()
