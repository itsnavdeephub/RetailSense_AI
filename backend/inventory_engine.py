import math
from dataclasses import dataclass
from scipy.stats import norm


@dataclass
class InventoryInput:
    item_id: str
    current_stock: float
    incoming_stock: float
    backorders: float
    lead_time_days: int
    review_period_days: int
    service_level: float  # e.g. 0.95 for 95%


def compute_inventory_recommendation(
    inv: InventoryInput,
    daily_forecast: list[float],
    daily_error_std: float,
    unit_price: float = 1.0,
) -> dict:
    """
    Inventory Replenishment Optimization Engine.

    Formulas:
    - Inventory Position = Current Stock + Incoming Stock - Backorders
    - Safety Stock (Lead Time) = z * sigma_d * sqrt(L)
    - Reorder Point = Forecast Demand During Lead Time + Lead-Time Safety Stock
    - Safety Stock (Protection Period L+R) = z * sigma_d * sqrt(L + R)
    - Target Stock = Forecast Demand During (L + R) + Protection-Period Safety Stock
    - Recommended Order Quantity = max(0, Target Stock - Inventory Position)

    Statistical assumption:
    Daily forecast errors are modeled as zero-mean, independent residuals with
    standard deviation sigma_d estimated empirically from chronological validation residuals.
    """
    if inv.lead_time_days < 1 or inv.lead_time_days > 60:
        raise ValueError("Lead time must be between 1 and 60 days.")
    if inv.review_period_days < 1 or inv.review_period_days > 60:
        raise ValueError("Review period must be between 1 and 60 days.")
    if not (0.50 <= inv.service_level <= 0.999):
        raise ValueError("Service level must be between 0.50 and 0.999.")
    if inv.current_stock < 0 or inv.incoming_stock < 0 or inv.backorders < 0:
        raise ValueError("Stock quantities and backorders cannot be negative.")
    if not daily_forecast:
        raise ValueError("Daily forecast values are required.")

    L = int(inv.lead_time_days)
    R = int(inv.review_period_days)
    protection_days = L + R

    warnings = []
    horizon_available = len(daily_forecast)
    if protection_days > horizon_available:
        avg_rate = sum(daily_forecast) / len(daily_forecast)
        extended = list(daily_forecast) + [avg_rate] * (protection_days - horizon_available)
        warnings.append(
            f"Protection period ({protection_days} days = {L}d lead + {R}d review) exceeds "
            f"the {horizon_available}-day forecast horizon; remaining days use the {horizon_available}-day average rate ({avg_rate:.2f} units/day)."
        )
    else:
        extended = list(daily_forecast)

    demand_lead_time = float(sum(extended[:L]))
    demand_protection_period = float(sum(extended[:protection_days]))
    avg_daily_demand = float(sum(daily_forecast) / len(daily_forecast))

    z_score = float(norm.ppf(inv.service_level))
    sigma_d = max(0.0, float(daily_error_std))

    lead_time_safety_stock = z_score * sigma_d * math.sqrt(L)
    protection_safety_stock = z_score * sigma_d * math.sqrt(protection_days)

    inventory_position = float(inv.current_stock + inv.incoming_stock - inv.backorders)
    reorder_point = demand_lead_time + lead_time_safety_stock
    target_stock = demand_protection_period + protection_safety_stock

    raw_order_qty = max(0.0, target_stock - inventory_position)
    recommended_order_qty = int(round(raw_order_qty))

    if avg_daily_demand > 1e-6:
        days_of_stock = max(0.0, inventory_position / avg_daily_demand)
    else:
        days_of_stock = 999.0 if inventory_position > 0 else 0.0

    # Status classification
    # - critical: inventory_position <= demand_lead_time (likely stockout before replenishment arrives) or <= 0
    # - low_stock: inventory_position <= reorder_point
    # - overstock: inventory_position > target_stock * 1.45 and days_of_stock > protection_days * 1.6
    # - healthy: otherwise
    if inventory_position <= max(0.0, demand_lead_time * 0.85) or days_of_stock < max(1.0, L * 0.8):
        status = "critical"
        stockout_risk = "High"
        overstock_risk = "None"
    elif inventory_position <= reorder_point:
        status = "low_stock"
        stockout_risk = "Moderate"
        overstock_risk = "None"
    elif inventory_position > target_stock * 1.40 and days_of_stock > protection_days * 1.5:
        status = "overstock"
        stockout_risk = "Low"
        overstock_risk = "High"
    else:
        status = "healthy"
        stockout_risk = "Low"
        overstock_risk = "Low"

    excess_units = max(0.0, inventory_position - target_stock) if status == "overstock" else 0.0
    excess_value = excess_units * float(unit_price)

    explanation = (
        f"Inventory Position ({inventory_position:.1f} units) vs Reorder Point ({reorder_point:.1f} units) "
        f"and Target Stock ({target_stock:.1f} units) over a {protection_days}-day protection period "
        f"({L}d lead time + {R}d review) at {inv.service_level * 100:.1f}% service level (z={z_score:.2f}). "
    )
    if recommended_order_qty > 0:
        explanation += f"Recommend ordering {recommended_order_qty} units to restore target coverage."
    elif status == "overstock":
        explanation += f"No order needed; stock exceeds target by {excess_units:.1f} units."
    else:
        explanation += "Stock coverage is healthy; no immediate replenishment required."

    return {
        "item_id": inv.item_id,
        "inventory_position": round(inventory_position, 2),
        "demand_during_lead_time": round(demand_lead_time, 2),
        "demand_during_protection_period": round(demand_protection_period, 2),
        "avg_daily_predicted_demand": round(avg_daily_demand, 2),
        "lead_time_safety_stock": round(lead_time_safety_stock, 2),
        "protection_safety_stock": round(protection_safety_stock, 2),
        "safety_stock": round(protection_safety_stock, 2),
        "reorder_point": round(reorder_point, 2),
        "target_stock": round(target_stock, 2),
        "recommended_order_qty": recommended_order_qty,
        "estimated_days_of_stock": round(min(days_of_stock, 365.0), 1),
        "status": status,
        "stockout_risk": stockout_risk,
        "overstock_risk": overstock_risk,
        "excess_units": round(excess_units, 1),
        "excess_value_usd": round(excess_value, 2),
        "z_score": round(z_score, 3),
        "daily_error_std": round(sigma_d, 3),
        "warnings": warnings,
        "explanation": explanation,
    }
