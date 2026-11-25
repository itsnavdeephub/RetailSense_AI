import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  Sparkles,
  AlertTriangle,
  Award,
  ArrowRight,
  PackagePlus,
  FileText,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';
import { KpiCard } from '../components/ui/KpiCard';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { StatusBadge } from '../components/ui/StatusBadge';

const HEALTH_COLORS = [
  { key: 'healthy', label: 'Healthy', color: '#10b981' },
  { key: 'low_stock', label: 'Low Stock', color: '#f59e0b' },
  { key: 'critical', label: 'Critical', color: '#ef4444' },
  { key: 'overstock', label: 'Overstock', color: '#3b82f6' },
];

export function OverviewPage() {
  const { metadata, selectedStore } = useApp();
  const navigate = useNavigate();

  const [days, setDays] = useState(60);
  const [selectedItem, setSelectedItem] = useState('ALL');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDashboardSummary({
        store_id: selectedStore,
        item_id: selectedItem,
        days,
      });
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedStore, selectedItem, days]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading && !data) return <DashboardSkeleton />;
  if (error) return <ErrorBanner message={error} onRetry={loadDashboard} />;
  if (!data) return null;

  const { kpis, forecast_chart, inventory_health, top_products, alerts, upcoming_replenishments } = data;
  const donutData = HEALTH_COLORS.map((c) => ({
    name: c.label,
    value: inventory_health?.[c.key] || 0,
    color: c.color,
  })).filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Total Historical Sales"
          value={kpis.total_historical_sales}
          icon={ShoppingBag}
          accent="blue"
          description={selectedItem === 'ALL' ? 'Units sold across 35 SKUs (M5)' : `Units sold for ${selectedItem}`}
          sparkline={kpis.historical_sparkline}
        />
        <KpiCard
          title="Predicted Demand (7d)"
          value={kpis.predicted_demand_7d}
          decimals={0}
          icon={Sparkles}
          accent="violet"
          description={`Next 7-day forecast (${kpis.best_model.name})`}
          sparkline={kpis.forecast_sparkline}
        />
        <KpiCard
          title="Products Requiring Reorder"
          value={kpis.products_requiring_reorder}
          icon={AlertTriangle}
          accent="amber"
          description={`${kpis.critical_stock_count} critical risk · Demo stock scenario`}
        />
        <KpiCard
          title="Best Forecasting Model"
          displayText={kpis.best_model.name}
          icon={Award}
          accent="emerald"
          description={`Test MAE: ${kpis.best_model.test_mae ?? '—'} · WAPE: ${kpis.best_model.test_wape ?? '—'}%`}
        />
      </div>

      {/* Main Forecast Chart + Inventory Health Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 surface-card rounded-2xl p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
                Sales History &amp; AI 7-Day Forecast
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Solid line: historical M5 actuals &middot; Dashed line: {kpis.best_model.name} predictions
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedItem}
                onChange={(e) => setSelectedItem(e.target.value)}
                aria-label="Filter product"
                className="text-xs px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none"
              >
                <option value="ALL">All 35 Products</option>
                {(metadata?.products || []).map((p) => (
                  <option key={p.item_id} value={p.item_id}>
                    {p.item_id}
                  </option>
                ))}
              </select>

              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
                {[30, 60, 90, 180].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(d)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                      days === d
                        ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="h-72 sm:h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={forecast_chart} margin={{ top: 6, right: 12, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="histAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(v) => v.slice(5)}
                  minTickGap={24}
                />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="historical"
                  name="Historical Units"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#histAreaGrad)"
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  name="AI Forecast Units"
                  stroke="#a855f7"
                  strokeWidth={2.4}
                  strokeDasharray="6 4"
                  dot={{ r: 2.5, fill: '#a855f7' }}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Inventory Health Donut */}
        <div className="surface-card rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
              Inventory Health Distribution
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              35 SKUs evaluated against AI reorder points
            </p>
          </div>

          <div className="h-52 w-full my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={56}
                  outerRadius={82}
                  paddingAngle={3}
                >
                  {donutData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {HEALTH_COLORS.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50"
              >
                <span className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                </span>
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {inventory_health?.[item.key] || 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Selling Products + Alerts + Upcoming Replenishments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="surface-card rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
                Top-Selling Products
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Trailing 30-day unit volume (CA_1)
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/analytics')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              Details <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={top_products}
                layout="vertical"
                margin={{ top: 0, right: 12, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis
                  type="category"
                  dataKey="item_id"
                  width={92}
                  tick={{ fontSize: 10.5, fill: '#94a3b8' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Bar dataKey="units_30d" name="Units (30d)" fill="#3b82f6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Inventory Alerts */}
        <div className="surface-card rounded-2xl p-5 sm:p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
                Recent Inventory Alerts
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                SKUs below reorder point
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              Manage <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2.5 flex-1">
            {alerts.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">No low or critical alerts.</p>
            ) : (
              alerts.map((a) => (
                <button
                  key={a.item_id}
                  type="button"
                  onClick={() => navigate(`/inventory?search=${encodeURIComponent(a.item_id)}`)}
                  className="w-full text-left p-3 rounded-xl bg-slate-50 dark:bg-slate-800/45 border border-slate-200/70 dark:border-slate-700/50 hover:border-blue-500/40 transition-colors flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {a.item_id}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Inv Pos: {a.inventory_position} &middot; ~{a.estimated_days_of_stock}d stock left
                    </div>
                  </div>
                  <StatusBadge status={a.status} />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Upcoming Replenishments & Quick Actions */}
        <div className="surface-card rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
                  Upcoming Replenishments
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Highest recommended order quantities
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {upcoming_replenishments.map((r) => (
                <div
                  key={r.item_id}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/45 border border-slate-200/70 dark:border-slate-700/50"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {r.item_id}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      7d Demand: {r.predicted_7d_demand} &middot; Lead: {r.lead_time_days}d
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-blue-600 dark:text-blue-400">
                      +{r.recommended_order_qty} units
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Quick Actions
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => navigate('/forecasting')}
                className="flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[11px] font-semibold transition-colors"
              >
                <TrendingUp className="w-4 h-4" />
                Forecast
              </button>
              <button
                type="button"
                onClick={() => navigate('/inventory')}
                className="flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 text-violet-600 dark:text-violet-400 text-[11px] font-semibold transition-colors"
              >
                <PackagePlus className="w-4 h-4" />
                Reorder
              </button>
              <button
                type="button"
                onClick={() => navigate('/reports')}
                className="flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold transition-colors"
              >
                <FileText className="w-4 h-4" />
                Reports
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
