import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  SlidersHorizontal,
  RotateCcw,
  X,
  Leaf,
  AlertTriangle,
  CheckCircle2,
  Package,
  Save,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useApp } from '../context/AppContext';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { DashboardSkeleton } from '../components/ui/Skeleton';

export function InventoryManagementPage() {
  const { addToast } = useToast();
  const { refreshAppData } = useApp();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState('all');
  const [data, setData] = useState(null);
  const [sustainability, setSustainability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Drawer state
  const [selectedItem, setSelectedItem] = useState(null);
  const [drawerData, setDrawerData] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);

  // Simulator state
  const [simForm, setSimForm] = useState({
    item_id: 'FOODS_3_090',
    current_stock: 40,
    incoming_stock: 10,
    backorders: 0,
    lead_time_days: 4,
    review_period_days: 5,
    service_level: 0.95,
  });
  const [simResult, setSimResult] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    const q = searchParams.get('search');
    if (q !== null) setSearch(q);
  }, [searchParams]);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invRes, sustRes] = await Promise.all([
        api.getInventory({ search, status: statusFilter }),
        api.getSustainabilityInsights(),
      ]);
      setData(invRes);
      setSustainability(sustRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const openDrawer = async (itemId) => {
    setSelectedItem(itemId);
    try {
      const detail = await api.getInventoryItem(itemId);
      setDrawerData(detail);
      setEditForm({
        current_stock: detail.current_stock,
        incoming_stock: detail.incoming_stock,
        backorders: detail.backorders,
        lead_time_days: detail.lead_time_days,
        review_period_days: detail.review_period_days,
        service_level: detail.service_level,
      });
    } catch (err) {
      addToast({ title: 'Failed to load item', description: err.message, type: 'error' });
    }
  };

  useEffect(() => {
    if (!selectedItem) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setSelectedItem(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedItem]);

  const handleSaveInventory = async (e) => {
    e.preventDefault();
    if (!selectedItem || !editForm) return;
    setSaving(true);
    try {
      const updated = await api.updateInventoryItem(selectedItem, editForm);
      setDrawerData(updated);
      addToast({
        title: 'Inventory Parameters Updated',
        description: `Recalculated order quantity for ${selectedItem}: ${updated.recommended_order_qty} units.`,
        type: 'success',
      });
      await loadInventory();
      refreshAppData();
    } catch (err) {
      addToast({ title: 'Update Failed', description: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Run scenario simulator whenever inputs change
  useEffect(() => {
    let active = true;
    const runSim = async () => {
      try {
        const res = await api.simulateInventory(simForm);
        if (active) setSimResult(res);
      } catch {
        // Ignore transient invalid intermediate keystrokes
      }
    };
    runSim();
    return () => {
      active = false;
    };
  }, [simForm]);

  const handleConfirmReset = async () => {
    setResetOpen(false);
    try {
      await api.resetInventoryScenarios();
      addToast({
        title: 'Demo Scenarios Restored',
        description: 'Inventory profiles reset to calibrated M5 baseline scenarios.',
        type: 'info',
      });
      await loadInventory();
      refreshAppData();
    } catch (err) {
      addToast({ title: 'Reset Failed', description: err.message, type: 'error' });
    }
  };

  if (loading && !data) return <DashboardSkeleton />;
  if (error) return <ErrorBanner message={error} onRetry={loadInventory} />;
  if (!data) return null;

  const { summary, items, demo_notice } = data;
  const counts = summary.counts;

  const summaryCards = [
    { key: 'healthy', label: 'Healthy Stock', count: counts.healthy, color: 'text-emerald-500 border-emerald-500/25 bg-emerald-500/8' },
    { key: 'low_stock', label: 'Low Stock', count: counts.low_stock, color: 'text-amber-500 border-amber-500/25 bg-amber-500/8' },
    { key: 'critical', label: 'Critical Stock', count: counts.critical, color: 'text-rose-500 border-rose-500/25 bg-rose-500/8' },
    { key: 'overstock', label: 'Overstocked Products', count: counts.overstock, color: 'text-blue-500 border-blue-500/25 bg-blue-500/8' },
  ];

  return (
    <div className="space-y-6">
      {/* Demo Scenario Disclosure */}
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <span>
            <strong>Demonstration Inventory Scenarios:</strong> {demo_notice} Click any SKU to enter your own stock and lead time parameters.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setResetOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Scenarios
        </button>
      </div>

      {/* 4 Summary Filter Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === c.key ? 'all' : c.key))}
            className={`text-left surface-card rounded-2xl p-4 transition-all cursor-pointer border ${
              statusFilter === c.key ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{c.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${c.color}`}>
                {statusFilter === c.key ? 'Filtered' : 'Filter'}
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2 font-display">
              {c.count} <span className="text-xs font-normal text-slate-400">SKUs</span>
            </div>
          </button>
        ))}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="surface-card rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by product ID or velocity tier..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Stock Statuses</option>
            <option value="critical">Critical Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="healthy">Healthy Stock</option>
            <option value="overstock">Potential Overstock</option>
          </select>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="surface-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-semibold">Product ID</th>
                <th className="px-4 py-3 font-semibold">Tier / Source</th>
                <th className="px-4 py-3 font-semibold">Current Stock</th>
                <th className="px-4 py-3 font-semibold">7d Forecast</th>
                <th className="px-4 py-3 font-semibold">Safety Stock</th>
                <th className="px-4 py-3 font-semibold">Reorder Point</th>
                <th className="px-4 py-3 font-semibold">Order Qty</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    No inventory records match your current search or filter.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr
                    key={row.item_id}
                    onClick={() => openDrawer(row.item_id)}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      {row.item_id}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700 dark:text-slate-300">{row.velocity_tier}</div>
                      <div className="text-[10px] text-slate-400">{row.scenario_label}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                      {row.current_stock}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {row.predicted_7d_demand}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {row.safety_stock}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {row.reorder_point}
                    </td>
                    <td className="px-4 py-3 font-bold text-blue-600 dark:text-blue-400">
                      {row.recommended_order_qty > 0 ? `+${row.recommended_order_qty}` : '0'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDrawer(row.item_id);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-blue-500/12 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 font-semibold"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inventory Scenario Simulator + SDG 12 Sustainability Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scenario Simulator */}
        <div className="surface-card rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-violet-500" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
              What-If Inventory Scenario Simulator
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Test how supplier lead time, current stock, and target service level affect safety stock and reorder quantities.
          </p>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="col-span-2">
              <label className="block text-[11px] text-slate-500 mb-1">Product SKU</label>
              <select
                value={simForm.item_id}
                onChange={(e) => setSimForm((s) => ({ ...s, item_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                {items.map((it) => (
                  <option key={it.item_id} value={it.item_id}>
                    {it.item_id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">
                Current Stock ({simForm.current_stock})
              </label>
              <input
                type="range"
                min={0}
                max={400}
                value={simForm.current_stock}
                onChange={(e) => setSimForm((s) => ({ ...s, current_stock: Number(e.target.value) }))}
                className="w-full accent-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">
                Supplier Lead Time ({simForm.lead_time_days} days)
              </label>
              <input
                type="range"
                min={1}
                max={21}
                value={simForm.lead_time_days}
                onChange={(e) => setSimForm((s) => ({ ...s, lead_time_days: Number(e.target.value) }))}
                className="w-full accent-violet-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">
                Review Period ({simForm.review_period_days} days)
              </label>
              <input
                type="range"
                min={1}
                max={14}
                value={simForm.review_period_days}
                onChange={(e) => setSimForm((s) => ({ ...s, review_period_days: Number(e.target.value) }))}
                className="w-full accent-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">
                Service Level ({Math.round(simForm.service_level * 100)}%)
              </label>
              <select
                value={simForm.service_level}
                onChange={(e) => setSimForm((s) => ({ ...s, service_level: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <option value={0.90}>90% (z = 1.28)</option>
                <option value={0.95}>95% (z = 1.64)</option>
                <option value={0.98}>98% (z = 2.05)</option>
                <option value={0.99}>99% (z = 2.33)</option>
              </select>
            </div>
          </div>

          {simResult && (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Simulated Outcome
                </span>
                <StatusBadge status={simResult.status} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900/60">
                  <div className="text-[10px] text-slate-400">Safety Stock</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{simResult.safety_stock}</div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900/60">
                  <div className="text-[10px] text-slate-400">Reorder Point</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{simResult.reorder_point}</div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900/60">
                  <div className="text-[10px] text-slate-400">Order Qty</div>
                  <div className="text-sm font-bold text-blue-500">+{simResult.recommended_order_qty}</div>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {simResult.explanation}
              </p>
              {simResult.warnings?.length > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Note: {simResult.warnings[0]}
                </p>
              )}
            </div>
          )}
        </div>

        {/* SDG 12 Sustainability Insights */}
        {sustainability && (
          <div className="surface-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Leaf className="w-4 h-4 text-emerald-500" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
                  SDG 12 Sustainability &amp; Waste Risk Insights
                </h2>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                Simulated Estimate
              </span>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {sustainability.measurement_disclaimer}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50">
                <div className="text-[11px] text-slate-500">Potential Excess Inventory</div>
                <div className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5 font-display">
                  {sustainability.indicators.potential_excess_units} units
                </div>
                <div className="text-[11px] text-slate-400">
                  Est. ${sustainability.indicators.potential_excess_value_usd.toLocaleString()} capital tied up
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50">
                <div className="text-[11px] text-slate-500">Est. Avoidable Overstock</div>
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 font-display">
                  {sustainability.indicators.estimated_avoidable_overstock_units} units
                </div>
                <div className="text-[11px] text-slate-400">
                  AI Target vs. static 21-day buffer
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  Inventory Alignment Indicator
                </span>
                <span className="font-bold text-emerald-500">
                  {sustainability.indicators.inventory_alignment_pct}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full"
                  style={{ width: `${Math.min(100, sustainability.indicators.inventory_alignment_pct)}%` }}
                />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                SKUs with Potential Wastage / Overstock Risk
              </p>
              {sustainability.wastage_risk_products.length === 0 ? (
                <div className="text-xs text-emerald-500 flex items-center gap-1.5 py-2">
                  <CheckCircle2 className="w-4 h-4" /> No SKUs currently flagged for excess wastage risk.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {sustainability.wastage_risk_products.map((w) => (
                    <div
                      key={w.item_id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200">{w.item_id}</span>
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">
                        +{w.excess_units} excess ({w.estimated_days_of_stock}d cover)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Product Side Drawer */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedItem(null)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="relative z-10 w-full max-w-lg h-full glass-panel border-l border-slate-200 dark:border-slate-700/70 shadow-2xl overflow-y-auto p-6 space-y-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-500" />
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                      {selectedItem}
                    </h3>
                  </div>
                  {drawerData && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {drawerData.velocity_tier} &middot; Unit Price ${drawerData.unit_price} &middot; {drawerData.scenario_label}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label="Close drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {drawerData && editForm && (
                <>
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div>
                      <div className="text-[11px] text-slate-500">Recommended Order Quantity</div>
                      <div className="text-xl font-bold text-blue-600 dark:text-blue-400 font-display">
                        +{drawerData.recommended_order_qty} units
                      </div>
                    </div>
                    <StatusBadge status={drawerData.status} />
                  </div>

                  {/* Mini Demand Chart */}
                  <div className="surface-card rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                      30-Day Historical Demand
                    </p>
                    <div className="h-32 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={drawerData.historical_30d}>
                          <XAxis dataKey="date" hide />
                          <YAxis hide />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'rgba(15, 23, 42, 0.94)',
                              borderRadius: '10px',
                              fontSize: '11px',
                              color: '#f8fafc',
                            }}
                          />
                          <Area type="monotone" dataKey="sales" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Metrics Breakdown */}
                  <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50">
                      <div className="text-[10px] text-slate-400">Inv Position</div>
                      <div className="font-bold mt-0.5">{drawerData.inventory_position}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50">
                      <div className="text-[10px] text-slate-400">Safety Stock</div>
                      <div className="font-bold mt-0.5">{drawerData.safety_stock}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50">
                      <div className="text-[10px] text-slate-400">Reorder Point</div>
                      <div className="font-bold mt-0.5">{drawerData.reorder_point}</div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-blue-500/8 border border-blue-500/20 rounded-xl p-3">
                    {drawerData.explanation}
                  </p>

                  {drawerData.warnings?.length > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
                      {drawerData.warnings[0]}
                    </p>
                  )}

                  {/* Update Form */}
                  <form onSubmit={handleSaveInventory} className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Update Inventory Parameters
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Current Stock</label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={editForm.current_stock}
                          onChange={(e) => setEditForm((f) => ({ ...f, current_stock: Number(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Incoming Stock</label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={editForm.incoming_stock}
                          onChange={(e) => setEditForm((f) => ({ ...f, incoming_stock: Number(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Backorders</label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={editForm.backorders}
                          onChange={(e) => setEditForm((f) => ({ ...f, backorders: Number(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Lead Time (days)</label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={editForm.lead_time_days}
                          onChange={(e) => setEditForm((f) => ({ ...f, lead_time_days: Number(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Review Period (days)</label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={editForm.review_period_days}
                          onChange={(e) => setEditForm((f) => ({ ...f, review_period_days: Number(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Service Level</label>
                        <select
                          value={editForm.service_level}
                          onChange={(e) => setEditForm((f) => ({ ...f, service_level: Number(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        >
                          <option value={0.90}>90%</option>
                          <option value={0.95}>95%</option>
                          <option value={0.98}>98%</option>
                          <option value={0.99}>99%</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-60"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Recalculating...' : 'Save & Recalculate'}
                    </button>
                  </form>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        open={resetOpen}
        title="Reset Demonstration Inventory Scenarios?"
        description="This will overwrite any custom stock or lead time edits you made and restore the calibrated M5 demonstration scenarios."
        confirmLabel="Restore Defaults"
        variant="danger"
        onConfirm={handleConfirmReset}
        onCancel={() => setResetOpen(false)}
      />
    </div>
  );
}
