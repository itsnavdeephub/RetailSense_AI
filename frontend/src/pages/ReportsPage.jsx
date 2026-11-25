import React, { useState } from 'react';
import { FileSpreadsheet, FileText, Download, Sparkles, PackageCheck, Cpu, BarChart3 } from 'lucide-react';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';

const REPORT_CARDS = [
  {
    type: 'sales_forecasting',
    title: 'Sales Forecasting Report',
    description:
      '7-day product demand forecasts with empirically calibrated 80% validation residual bounds and model metadata.',
    icon: Sparkles,
    accent: 'text-blue-500 bg-blue-500/12',
  },
  {
    type: 'inventory_recommendations',
    title: 'Inventory Recommendation Report',
    description:
      'Complete safety stock, reorder point, inventory position, days of stock remaining, and recommended order quantities.',
    icon: PackageCheck,
    accent: 'text-emerald-500 bg-emerald-500/12',
  },
  {
    type: 'model_evaluation',
    title: 'Model Evaluation Report',
    description:
      'Chronological validation and test comparison across Seasonal Naive, Moving Average, LightGBM, and PyTorch LSTM.',
    icon: Cpu,
    accent: 'text-violet-500 bg-violet-500/12',
  },
  {
    type: 'product_performance',
    title: 'Product Performance Report',
    description:
      '30-day SKU sales velocity, sell price benchmarks, and estimated revenue contribution in Store CA_1.',
    icon: BarChart3,
    accent: 'text-amber-500 bg-amber-500/12',
  },
];

export function ReportsPage() {
  const { metadata, selectedStore } = useApp();
  const { addToast } = useToast();

  const [itemId, setItemId] = useState('ALL');
  const [model, setModel] = useState('best');
  const [startDate, setStartDate] = useState('2016-04-25');
  const [endDate, setEndDate] = useState('2016-05-22');

  const handleDownload = (reportType, format, title) => {
    const url = api.getReportUrl(reportType, format, {
      store_id: selectedStore,
      item_id: itemId,
      model,
      start_date: startDate,
      end_date: endDate,
    });
    window.open(url, '_blank', 'noopener');
    addToast({
      title: `Generating ${format.toUpperCase()} Report`,
      description: `${title} export started for ${itemId}.`,
      type: 'success',
    });
  };

  return (
    <div className="space-y-6">
      {/* Report Filters */}
      <div className="surface-card rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Store
          </label>
          <select
            value={selectedStore}
            disabled
            className="w-full text-xs px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <option value="CA_1">CA_1 (California Store 1)</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Product Scope
          </label>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="w-full text-xs px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
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
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Forecasting Model
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full text-xs px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <option value="best">Best Model (Validation)</option>
            <option value="lightgbm">LightGBM Regressor</option>
            <option value="lstm">PyTorch LSTM</option>
            <option value="seasonal_naive">Seasonal Naive</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              From
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              To
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>
        </div>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {REPORT_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.type}
              className="surface-card rounded-2xl p-6 flex flex-col justify-between gap-5"
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl shrink-0 ${card.accent}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                    {card.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => handleDownload(card.type, 'csv', card.title)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(card.type, 'pdf', card.title)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Download PDF
                  <Download className="w-3 h-3 opacity-80" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
