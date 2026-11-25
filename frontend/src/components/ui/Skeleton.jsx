import React from 'react';

export function Skeleton({ className = '' }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-800/70 ${className}`}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="surface-card rounded-2xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-9 rounded-xl" />
            </div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 surface-card rounded-2xl p-6 space-y-4">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-72 w-full" />
        </div>
        <div className="surface-card rounded-2xl p-6 space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    </div>
  );
}
