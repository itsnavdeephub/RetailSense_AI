import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export function ErrorBanner({ message, onRetry }) {
  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-300">
            Data Request Error
          </h3>
          <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 leading-relaxed">
            {message}
          </p>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}
