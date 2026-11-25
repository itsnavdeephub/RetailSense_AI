import React, { useState } from 'react';
import { Sun, Moon, Database, RotateCcw, Sparkles, ShieldCheck, Globe } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { ConfirmModal } from '../components/ui/ConfirmModal';

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { metadata, refreshAppData } = useApp();
  const { addToast } = useToast();
  const [confirmReset, setConfirmReset] = useState(false);

  const prep = metadata?.preprocessing_report;
  const dq = prep?.data_quality;

  const handleReplayIntro = () => {
    try {
      sessionStorage.removeItem('retailsense-intro-seen');
    } catch {
      // ignore
    }
    window.location.href = '/';
  };

  const handleResetDemo = async () => {
    setConfirmReset(false);
    try {
      await api.resetInventoryScenarios();
      await refreshAppData();
      addToast({
        title: 'Inventory Reset Complete',
        description: 'All 35 SKU inventory scenarios restored to calibrated defaults.',
        type: 'success',
      });
    } catch (err) {
      addToast({ title: 'Reset Failed', description: err.message, type: 'error' });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Appearance & Experience */}
      <div className="surface-card rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
            Appearance &amp; Interface
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Theme selection is persisted automatically across sessions.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`p-4 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
              theme === 'dark'
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <Moon className="w-5 h-5 text-blue-400" />
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Deep Navy Dark Mode
              </div>
              <div className="text-xs text-slate-500">Optimized for control-room analytics</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`p-4 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
              theme === 'light'
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <Sun className="w-5 h-5 text-amber-500" />
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Clean Light Surface
              </div>
              <div className="text-xs text-slate-500">Crisp high-contrast daylight workspace</div>
            </div>
          </button>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Introductory Brand Animation
            </div>
            <div className="text-[11px] text-slate-500">
              Plays once per session while respecting reduced-motion preferences.
            </div>
          </div>
          <button
            type="button"
            onClick={handleReplayIntro}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
            Replay Intro
          </button>
        </div>
      </div>

      {/* Dataset & Pipeline Integrity */}
      <div className="surface-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-500" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
            M5 Dataset &amp; Preprocessing Integrity
          </h2>
        </div>

        {prep ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="text-[11px] text-slate-400">Active Scope</div>
              <div className="font-semibold mt-0.5">{prep.store_id} / {prep.dept_id}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="text-[11px] text-slate-400">Products &amp; Records</div>
              <div className="font-semibold mt-0.5">{prep.num_products} SKUs ({prep.total_records?.toLocaleString()} rows)</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="text-[11px] text-slate-400">Timeline</div>
              <div className="font-semibold mt-0.5">{prep.date_min} to {prep.date_max}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="text-[11px] text-slate-400">Duplicates Removed</div>
              <div className="font-semibold mt-0.5">
                {dq?.sales_duplicates_removed + dq?.calendar_duplicates_removed + dq?.price_duplicates_removed}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="text-[11px] text-slate-400">Missing Prices Imputed</div>
              <div className="font-semibold mt-0.5">
                {dq?.missing_prices_before_imputation} &rarr; {dq?.missing_prices_after_imputation} remaining
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="text-[11px] text-slate-400">Leakage Guard</div>
              <div className="font-semibold text-emerald-500 mt-0.5 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Chronological Splits
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Preprocessing metadata unavailable.</p>
        )}

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Reset SQLite Inventory Scenarios
            </div>
            <div className="text-[11px] text-slate-500">
              Restore all stock, incoming, backorder, and lead-time parameters to calibrated demo baselines.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-600/12 text-rose-600 dark:text-rose-400 hover:bg-rose-600/20 text-xs font-semibold transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Demo Data
          </button>
        </div>
      </div>

      {/* SDG Alignment */}
      <div className="surface-card rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-emerald-500" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
            UN Sustainable Development Goals Alignment
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
            <div className="font-bold text-emerald-600 dark:text-emerald-400">SDG 12</div>
            <div className="text-slate-600 dark:text-slate-300 mt-1">
              Responsible Consumption &amp; Production — curbing overstocking and spoilage risk via demand-matched replenishment.
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-blue-500/8 border border-blue-500/20">
            <div className="font-bold text-blue-600 dark:text-blue-400">SDG 9</div>
            <div className="text-slate-600 dark:text-slate-300 mt-1">
              Industry, Innovation &amp; Infrastructure — ML &amp; Deep Learning forecasting pipelines for modern retail operations.
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-violet-500/8 border border-violet-500/20">
            <div className="font-bold text-violet-600 dark:text-violet-400">SDG 8</div>
            <div className="text-slate-600 dark:text-slate-300 mt-1">
              Decent Work &amp; Economic Growth — preventing lost sales from stockouts while freeing working capital.
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmReset}
        title="Reset Inventory Database?"
        description="All custom edits made to inventory stock levels and lead times will be overwritten by the initial calibrated demonstration scenarios."
        confirmLabel="Reset Inventory"
        variant="danger"
        onConfirm={handleResetDemo}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
