import React from 'react';

const STATUS_STYLES = {
  healthy: {
    label: 'Healthy',
    classes:
      'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
    dot: 'bg-emerald-500',
  },
  low_stock: {
    label: 'Low Stock',
    classes:
      'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25',
    dot: 'bg-amber-500',
  },
  critical: {
    label: 'Critical',
    classes:
      'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25',
    dot: 'bg-rose-500',
  },
  overstock: {
    label: 'Overstock',
    classes:
      'bg-blue-500/12 text-blue-700 dark:text-blue-300 border-blue-500/25',
    dot: 'bg-blue-500',
  },
};

export function StatusBadge({ status }) {
  const key = String(status || 'healthy').toLowerCase();
  const cfg = STATUS_STYLES[key] || STATUS_STYLES.healthy;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.classes}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
