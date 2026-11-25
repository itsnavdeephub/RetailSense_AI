import React, { useCallback, useEffect, useState } from 'react';
import { Award, CheckCircle2, Cpu, Search } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { DashboardSkeleton } from '../components/ui/Skeleton';

const MODEL_ORDER = ['seasonal_naive', 'moving_average', 'lightgbm', 'lstm'];

export function ModelPerformancePage() {
  const { metadata } = useApp();
  const [metric, setMetric] = useState('mae');
  const [itemId, setItemId] = useState('ALL');
  const [prodSearch, setProdSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadEval = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getModelEvaluation({ metric, item_id: itemId });
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [metric, itemId]);

  useEffect(() => {
    loadEval();
  }, [loadEval]);

  if (loading && !data) return <DashboardSkeleton />;
  if (error) return <ErrorBanner message={error} onRetry={loadEval} />;
  if (!data) return null;

  const {
    best_model,
    evaluation_protocol,
    validation_metrics,
    test_metrics,
    model_metadata,
    daily_comparison,
    error_distribution,
    lstm_training_history,
    feature_importance,
    product_evaluation,
  } = data;

  const barCompareData = MODEL_ORDER.filter((m) => test_metrics[m]).map((m) => ({
    model: model_metadata[m]?.name || m,
    MAE: test_metrics[m].mae,
    RMSE: test_metrics[m].rmse,
    WAPE: test_metrics[m].wape,
    sMAPE: test_metrics[m].smape,
  }));

  const filteredProducts = (product_evaluation || []).filter((p) =>
    p.item_id.toLowerCase().includes(prodSearch.trim().toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header & Validation Metric Selector */}
      <div className="surface-card rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-500" /> Chronological Rolling-Origin Benchmark
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {evaluation_protocol?.test_period} &middot; {evaluation_protocol?.test_observations_per_model} observations per model
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Rank Best Model By:</span>
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
            {['mae', 'rmse', 'wape', 'smape'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={`px-3 py-1.5 text-xs font-semibold uppercase rounded-lg transition-colors ${
                  metric === m
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Model Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {MODEL_ORDER.map((mKey) => {
          const meta = model_metadata[mKey] || {};
          const tm = test_metrics[mKey] || {};
          const vm = validation_metrics[mKey] || {};
          const isBest = best_model === mKey;

          return (
            <div
              key={mKey}
              className={`surface-card rounded-2xl p-5 flex flex-col justify-between gap-4 relative ${
                isBest ? 'ring-2 ring-emerald-500/70' : ''
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                    {meta.name || mKey}
                  </h3>
                  {isBest ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      <Award className="w-3 h-3" /> Best ({metric.toUpperCase()})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                      <CheckCircle2 className="w-3 h-3 text-blue-500" /> {meta.status || 'Ready'}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  {meta.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <div className="text-[10px] text-slate-400">Test MAE</div>
                  <div className="font-bold text-slate-900 dark:text-white">{tm.mae}</div>
                  <div className="text-[10px] text-slate-400">Val: {vm.mae}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <div className="text-[10px] text-slate-400">Test RMSE</div>
                  <div className="font-bold text-slate-900 dark:text-white">{tm.rmse}</div>
                  <div className="text-[10px] text-slate-400">Val: {vm.rmse}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <div className="text-[10px] text-slate-400">Test WAPE</div>
                  <div className="font-bold text-slate-900 dark:text-white">{tm.wape}%</div>
                  <div className="text-[10px] text-slate-400">Val: {vm.wape}%</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <div className="text-[10px] text-slate-400">Test sMAPE</div>
                  <div className="font-bold text-slate-900 dark:text-white">{tm.smape}%</div>
                  <div className="text-[10px] text-slate-400">Val: {vm.smape}%</div>
                </div>
              </div>

              {mKey === 'lightgbm' && (
                <div className="text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
                  Best iteration: {meta.best_iteration} &middot; Train rows: {meta.train_rows?.toLocaleString()}
                </div>
              )}
              {mKey === 'lstm' && (
                <div className="text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
                  Best epoch: {meta.best_epoch}/{meta.total_epochs_run} &middot; Early stopped: {meta.early_stopped ? 'Yes' : 'No'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Model Comparison Bar Charts & Error Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="surface-card rounded-2xl p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white font-display">
            Test MAE &amp; RMSE Comparison
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Lower values indicate higher forecast accuracy on held-out test origins
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barCompareData} margin={{ top: 6, right: 12, left: -10, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="model" tick={{ fontSize: 10.5, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="MAE" fill="#3b82f6" radius={[5, 5, 0, 0]} />
                <Bar dataKey="RMSE" fill="#8b5cf6" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card rounded-2xl p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white font-display">
            Forecast Error Distribution (Actual − Predicted)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Residual frequency buckets across 980 test predictions per model
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={error_distribution} margin={{ top: 6, right: 12, left: -10, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="lightgbm" name="LightGBM" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="lstm" name="PyTorch LSTM" fill="#a855f7" radius={[3, 3, 0, 0]} />
                <Bar dataKey="seasonal_naive" name="Seasonal Naive" fill="#64748b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Actual vs Predicted Sales Graph */}
      <div className="surface-card rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white font-display">
              Actual vs. Predicted Test Sales (28-Day Evaluation Window)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Compare how each model tracked real M5 sales across 4 consecutive 7-day rolling origins
            </p>
          </div>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
          >
            <option value="ALL">Aggregate (All 35 Products)</option>
            {(metadata?.products || []).map((p) => (
              <option key={p.item_id} value={p.item_id}>
                {p.item_id}
              </option>
            ))}
          </select>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily_comparison} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  borderRadius: '12px',
                  fontSize: '12px',
                  color: '#f8fafc',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line type="monotone" dataKey="actual" name="Actual Sales" stroke="#10b981" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="lightgbm" name="LightGBM" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 3" dot={false} />
              <Line type="monotone" dataKey="lstm" name="PyTorch LSTM" stroke="#a855f7" strokeWidth={2} strokeDasharray="3 3" dot={false} />
              <Line type="monotone" dataKey="seasonal_naive" name="Seasonal Naive" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* LSTM Loss Curve + LightGBM Feature Importance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="surface-card rounded-2xl p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white font-display">
            PyTorch LSTM Training &amp; Validation Loss
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Best checkpoint saved at epoch {lstm_training_history?.best_epoch} (SmoothL1Loss on log1p demand)
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lstm_training_history?.history || []} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="epoch" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="train_loss" name="Train Loss" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="val_loss" name="Validation Loss" stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card rounded-2xl p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white font-display">
            LightGBM Top Feature Importances
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Split importance share (%) across engineered lag, rolling, price &amp; calendar features
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={(feature_importance || []).slice(0, 12)}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 24, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" />
                <YAxis type="category" dataKey="feature" width={135} tick={{ fontSize: 10.5, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Bar dataKey="importance_pct" name="Importance (%)" fill="#6366f1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Product-Wise Forecasting Performance Table */}
      <div className="surface-card rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white font-display">
              Product-Wise Forecasting Performance (Test MAE)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Per-SKU error comparison across all evaluated models
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={prodSearch}
              onChange={(e) => setProdSearch(e.target.value)}
              placeholder="Filter SKU..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase tracking-wider sticky top-0">
              <tr>
                <th className="px-4 py-3 font-semibold">Item ID</th>
                <th className="px-4 py-3 font-semibold">Seasonal Naive</th>
                <th className="px-4 py-3 font-semibold">Moving Avg</th>
                <th className="px-4 py-3 font-semibold">LightGBM</th>
                <th className="px-4 py-3 font-semibold">PyTorch LSTM</th>
                <th className="px-4 py-3 font-semibold">Best SKU Model</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {filteredProducts.map((p) => (
                <tr key={p.item_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/35">
                  <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">{p.item_id}</td>
                  <td className="px-4 py-2.5">{p.models.seasonal_naive?.mae}</td>
                  <td className="px-4 py-2.5">{p.models.moving_average?.mae}</td>
                  <td className="px-4 py-2.5 font-semibold text-blue-600 dark:text-blue-400">{p.models.lightgbm?.mae}</td>
                  <td className="px-4 py-2.5 font-semibold text-violet-600 dark:text-violet-400">{p.models.lstm?.mae}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 font-medium">
                      {p.best_model_mae}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
