import React, { useCallback, useEffect, useState } from 'react';
import { Download, Calendar, Filter, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Brush,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
} from 'recharts';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { DashboardSkeleton } from '../components/ui/Skeleton';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function SalesAnalyticsPage() {
  const { metadata, selectedStore } = useApp();
  const { addToast } = useToast();

  const [itemId, setItemId] = useState('ALL');
  const [startDate, setStartDate] = useState('2015-05-23');
  const [endDate, setEndDate] = useState('2016-05-22');
  const [aggregation, setAggregation] = useState('weekly');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSalesAnalytics({
        store_id: selectedStore,
        item_id: itemId,
        start_date: startDate,
        end_date: endDate,
        aggregation,
      });
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedStore, itemId, startDate, endDate, aggregation]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleExportCsv = () => {
    const url = api.getSalesCsvUrl({
      item_id: itemId,
      start_date: startDate,
      end_date: endDate,
    });
    window.open(url, '_blank', 'noopener');
    addToast({
      title: 'Sales CSV Export Started',
      description: `Downloading historical sales for ${itemId} (${startDate} to ${endDate}).`,
      type: 'success',
    });
  };

  if (loading && !data) return <DashboardSkeleton />;
  if (error) return <ErrorBanner message={error} onRetry={fetchAnalytics} />;
  if (!data) return null;

  const { summary, trend, product_comparison, price_vs_sales, seasonal_heatmap, department_distribution } = data;

  // Compute max cell in heatmap for color scaling
  let maxHeat = 1;
  seasonal_heatmap.forEach((row) => {
    DAYS_OF_WEEK.forEach((d) => {
      if ((row[d] || 0) > maxHeat) maxHeat = row[d];
    });
  });

  return (
    <div className="space-y-6">
      {/* Filter Controls Bar */}
      <div className="surface-card rounded-2xl p-4 sm:p-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Product
            </label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="text-xs px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
            >
              <option value="ALL">All 35 Products</option>
              {(metadata?.products || []).map((p) => (
                <option key={p.item_id} value={p.item_id}>
                  {p.item_id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              <Calendar className="w-3 h-3 inline mr-1" /> Start Date
            </label>
            <input
              type="date"
              value={startDate}
              min={metadata?.date_min || '2011-01-29'}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={metadata?.date_max || '2016-05-22'}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              <Filter className="w-3 h-3 inline mr-1" /> Aggregation
            </label>
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
              {['daily', 'weekly', 'monthly'].map((agg) => (
                <button
                  key={agg}
                  type="button"
                  onClick={() => setAggregation(agg)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors ${
                    aggregation === agg
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {agg}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download CSV
        </button>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="surface-card rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Filtered Units Sold</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-display">
            {summary.total_units.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Avg {summary.avg_daily_units.toLocaleString()} units / day
          </p>
        </div>

        <div className="surface-card rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Estimated Gross Revenue</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-display">
            ${summary.total_revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Calculated from M5 weekly sell prices</p>
        </div>

        <div className="surface-card rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> Highest Selling SKU
          </p>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-display">
            {summary.highest_selling?.item_id || '—'}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {summary.highest_selling?.total_units?.toLocaleString()} units ({summary.highest_selling?.avg_daily_units}/day)
          </p>
        </div>

        <div className="surface-card rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <ArrowDownRight className="w-3.5 h-3.5 text-amber-500" /> Lowest Selling SKU
          </p>
          <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1 font-display">
            {summary.lowest_selling?.item_id || '—'}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {summary.lowest_selling?.total_units?.toLocaleString()} units ({summary.lowest_selling?.avg_daily_units}/day)
          </p>
        </div>
      </div>

      {/* Interactive Sales Trend with Zoom Brush */}
      <div className="surface-card rounded-2xl p-5 sm:p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
            Historical Sales Trend ({aggregation})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Drag the bottom brush slider to zoom into specific weeks or seasonal peaks
          </p>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} minTickGap={22} />
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
                dataKey="units"
                name="Units Sold"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#trendFill)"
              />
              <Brush dataKey="period" height={24} stroke="#3b82f6" fill="rgba(15,23,42,0.15)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Product-wise Comparison & Price vs Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="surface-card rounded-2xl p-5 sm:p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
            Product-Wise Sales Comparison (Top 15)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Total unit volume over selected date window
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={product_comparison.slice(0, 15)} margin={{ top: 4, right: 12, left: -12, bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis
                  dataKey="item_id"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
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
                <Bar dataKey="total_units" name="Total Units" fill="#3b82f6" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card rounded-2xl p-5 sm:p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
            Price vs. Demand Velocity Analysis
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Average sell price ($) vs. average daily units sold across 35 SKUs
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis
                  type="number"
                  dataKey="avg_price"
                  name="Avg Price"
                  unit="$"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                />
                <YAxis
                  type="number"
                  dataKey="avg_daily_units"
                  name="Avg Daily Units"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                />
                <ZAxis type="number" dataKey="total_revenue" range={[50, 320]} name="Revenue" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                  formatter={(val, name) => (name === 'Avg Price' ? `$${val}` : val)}
                />
                <Scatter name="Products" data={price_vs_sales} fill="#8b5cf6" fillOpacity={0.78} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Seasonal Demand Heatmap + Department Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="surface-card rounded-2xl p-5 sm:p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
            Seasonal Demand Heatmap
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Average daily units per SKU by Month &amp; Day of Week
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="text-left text-slate-400 font-medium py-1 px-2">Month</th>
                  {DAYS_OF_WEEK.map((d) => (
                    <th key={d} className="text-center text-slate-400 font-medium py-1">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {seasonal_heatmap.map((row) => (
                  <tr key={row.month}>
                    <td className="font-medium text-slate-700 dark:text-slate-300 px-2 py-1">
                      {row.month}
                    </td>
                    {DAYS_OF_WEEK.map((d) => {
                      const val = row[d] || 0;
                      const intensity = Math.min(1, val / maxHeat);
                      return (
                        <td
                          key={d}
                          title={`${row.month} ${d}: ${val.toFixed(2)} avg units/day`}
                          style={{
                            backgroundColor: `rgba(59, 130, 246, ${0.1 + intensity * 0.72})`,
                          }}
                          className="text-center py-1.5 rounded-md font-medium text-slate-900 dark:text-white"
                        >
                          {val.toFixed(1)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="surface-card rounded-2xl p-5 sm:p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
            Store CA_1 Sales Distribution by Department
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Real M5 department totals in Store CA_1 (FOODS_3 highlighted as active modeled dept)
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={department_distribution} margin={{ top: 6, right: 12, left: 0, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="dept_id" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Bar dataKey="total_units" name="Total Historical Units" radius={[6, 6, 0, 0]}>
                  {department_distribution.map((entry) => (
                    <Cell
                      key={entry.dept_id}
                      fill={entry.is_active_modeled ? '#3b82f6' : '#64748b'}
                      fillOpacity={entry.is_active_modeled ? 1 : 0.45}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
