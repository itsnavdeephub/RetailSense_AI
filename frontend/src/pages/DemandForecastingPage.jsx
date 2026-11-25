import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, CalendarDays, TrendingUp, TrendingDown, Info, Loader2 } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { ErrorBanner } from '../components/ui/ErrorBanner';

const MODEL_OPTIONS = [
  { value: 'best', label: 'Best Model (Validation Winner)' },
  { value: 'lightgbm', label: 'LightGBM Regressor' },
  { value: 'lstm', label: 'PyTorch LSTM Neural Network' },
  { value: 'seasonal_naive', label: 'Seasonal Naive (7-Day Baseline)' },
  { value: 'moving_average', label: 'Moving Average (28-Day Baseline)' },
];

export function DemandForecastingPage() {
  const { metadata, selectedStore } = useApp();
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();

  const initialProduct = searchParams.get('product') || '';
  const [itemId, setItemId] = useState(initialProduct || 'FOODS_3_090');
  const [model, setModel] = useState('best');
  const [horizon, setHorizon] = useState(7);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const qp = searchParams.get('product');
    if (qp) setItemId(qp);
  }, [searchParams]);

  useEffect(() => {
    if (!itemId && metadata?.products?.length) {
      setItemId(metadata.products[0].item_id);
    }
  }, [metadata, itemId]);

  const runForecast = useCallback(
    async (targetItem = itemId, targetModel = model, targetHorizon = horizon, notify = false) => {
      if (!targetItem) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.generateForecast({
          store_id: selectedStore,
          item_id: targetItem,
          model: targetModel,
          horizon: Number(targetHorizon),
        });
        setResult(res);
        if (notify) {
          addToast({
            title: 'Forecast Generated',
            description: `${targetHorizon}-day demand forecast for ${targetItem} using ${res.model_used}.`,
            type: 'success',
          });
        }
      } catch (err) {
        setError(err.message);
        if (notify) {
          addToast({
            title: 'Forecast Failed',
            description: err.message,
            type: 'error',
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [selectedStore, itemId, model, horizon, addToast]
  );

  useEffect(() => {
    if (itemId) {
      runForecast(itemId, model, horizon, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    runForecast(itemId, model, horizon, true);
  };

  const chartData = (result?.chart_series || []).map((pt) => ({
    ...pt,
    band: pt.lower_80 != null && pt.upper_80 != null ? [pt.lower_80, pt.upper_80] : null,
  }));

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <form
        onSubmit={handleSubmit}
        className="surface-card rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end"
      >
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Store
          </label>
          <select
            value={selectedStore}
            disabled
            className="w-full text-xs px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          >
            <option value="CA_1">CA_1 (California Store 1)</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Product SKU
          </label>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="w-full text-xs px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
          >
            {(metadata?.products || []).map((p) => (
              <option key={p.item_id} value={p.item_id}>
                {p.item_id} ({p.velocity_tier})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Forecasting Model
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full text-xs px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Forecast Horizon
          </label>
          <select
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="w-full text-xs px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
          >
            <option value={7}>7 Days (Primary Horizon)</option>
            <option value={14}>14 Days (Extended Recursive)</option>
            <option value={21}>21 Days (Extended Recursive)</option>
            <option value={28}>28 Days (Extended Recursive)</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-md shadow-blue-500/20 disabled:opacity-60 transition-all cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Predicting...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Forecast
            </>
          )}
        </button>
      </form>

      {error && <ErrorBanner message={error} onRetry={() => runForecast(itemId, model, horizon, false)} />}

      {result && (
        <>
          {/* Forecast Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="surface-card rounded-2xl p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Predicted Demand</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-display">
                {result.kpis.total_predicted_demand.toLocaleString()} units
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Over next {result.horizon} days ({result.model_used})
              </p>
            </div>

            <div className="surface-card rounded-2xl p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Average Daily Demand</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-display">
                {result.kpis.avg_daily_demand} / day
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Prior 7d actual avg: {result.kpis.recent_7d_avg} / day
              </p>
            </div>

            <div className="surface-card rounded-2xl p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5 text-violet-500" /> Peak Demand Day
              </p>
              <p className="text-xl font-bold text-violet-600 dark:text-violet-400 mt-1 font-display">
                {result.kpis.peak_demand_day}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Projected {result.kpis.peak_demand_units} units
              </p>
            </div>

            <div className="surface-card rounded-2xl p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Predicted Sales Trend</p>
              <div className="flex items-center gap-1.5 mt-1">
                {result.kpis.trend_vs_last_7d_pct >= 0 ? (
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-amber-500" />
                )}
                <span
                  className={`text-2xl font-bold font-display ${
                    result.kpis.trend_vs_last_7d_pct >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {result.kpis.trend_vs_last_7d_pct >= 0 ? '+' : ''}
                  {result.kpis.trend_vs_last_7d_pct}%
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">vs. trailing 7-day average</p>
            </div>
          </div>

          {/* Uncertainty & Horizon Disclosure */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Model &amp; Interval Transparency:</span>{' '}
              Predictions generated by <code className="text-blue-500 font-semibold">{result.model_used}</code>.{' '}
              {result.uncertainty_source
                ? `Shaded 80% uncertainty bands are derived from ${result.uncertainty_source}.`
                : 'No unvalidated uncertainty intervals are shown.'}{' '}
              {result.extended_beyond_base_7d &&
                'Extended horizons (>7 days) use iterative multi-week stepping with known M5 future calendar dates.'}
            </div>
          </div>

          {/* Historical vs Forecast Interactive Chart */}
          <div className="surface-card rounded-2xl p-5 sm:p-6">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
                Historical vs. Forecasted Demand — {result.item_id}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                45-day actual history followed by {result.horizon}-day non-negative AI forecast
              </p>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickFormatter={(v) => v.slice(5)}
                    minTickGap={20}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid rgba(148, 163, 184, 0.25)',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                  />
                  {result.historical?.length > 0 && (
                    <ReferenceLine
                      x={result.historical[result.historical.length - 1].date}
                      stroke="#64748b"
                      strokeDasharray="3 3"
                      label={{ value: 'Forecast Origin', position: 'top', fill: '#94a3b8', fontSize: 10 }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="band"
                    name="80% Residual Interval"
                    stroke="none"
                    fill="#a855f7"
                    fillOpacity={0.16}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="historical"
                    name="Historical Sales"
                    stroke="#3b82f6"
                    strokeWidth={2.2}
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    name="Predicted Demand"
                    stroke="#a855f7"
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    dot={{ r: 3, fill: '#a855f7' }}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Daily Forecast Table */}
          <div className="surface-card rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
                Daily Forecast Schedule
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Product</th>
                    <th className="px-5 py-3 font-semibold">Predicted Demand</th>
                    <th className="px-5 py-3 font-semibold">80% Residual Interval</th>
                    <th className="px-5 py-3 font-semibold">Calendar Event</th>
                    <th className="px-5 py-3 font-semibold">Model Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {result.forecast.map((row) => (
                    <tr key={row.date} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/35">
                      <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {row.date} <span className="text-slate-400">(+{row.day_step}d)</span>
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white">
                        {row.item_id}
                      </td>
                      <td className="px-5 py-3 font-bold text-blue-600 dark:text-blue-400">
                        {row.predicted_demand} units
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                        {row.lower_80 != null ? `${row.lower_80} – ${row.upper_80}` : '—'}
                      </td>
                      <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                        {row.event_name || 'Regular Day'}
                      </td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded-md bg-violet-500/12 text-violet-600 dark:text-violet-300 font-medium">
                          {row.model_used}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
