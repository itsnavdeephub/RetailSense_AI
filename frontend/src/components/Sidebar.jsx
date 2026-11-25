import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  TrendingUp,
  Sparkles,
  PackageCheck,
  Cpu,
  FileBarChart2,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

export const NAV_ITEMS = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/analytics', label: 'Sales Analytics', icon: TrendingUp },
  { path: '/forecasting', label: 'Demand Forecasting', icon: Sparkles },
  { path: '/inventory', label: 'Inventory Management', icon: PackageCheck },
  { path: '/models', label: 'Model Performance', icon: Cpu },
  { path: '/reports', label: 'Reports', icon: FileBarChart2 },
  { path: '/settings', label: 'Settings', icon: Settings },
];

function BrandLogo({ collapsed }) {
  return (
    <div className="flex items-center gap-3 px-2">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 17 L9 12 L13 14 L20 7"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="20" cy="7" r="2" fill="#e0e7ff" />
        </svg>
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="text-base font-bold tracking-tight text-slate-900 dark:text-white font-display leading-none">
            RetailSense <span className="text-blue-500">AI</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            Demand &amp; Inventory OS
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const location = useLocation();

  const navContent = (isMobile = false) => (
    <div className="flex flex-col h-full py-4 px-3">
      <div className="flex items-center justify-between mb-6 h-10">
        <BrandLogo collapsed={!isMobile && collapsed} />
        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700/70 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => isMobile && setMobileOpen(false)}
              title={!isMobile && collapsed ? item.label : undefined}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/50'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId={isMobile ? 'activeNavMobile' : 'activeNavDesktop'}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/20"
                />
              )}
              {isActive && (
                <motion.span
                  layoutId={isMobile ? 'activeBarMobile' : 'activeBarDesktop'}
                  className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-blue-500"
                />
              )}
              <Icon className="w-[18px] h-[18px] relative z-10 shrink-0" />
              {(!collapsed || isMobile) && (
                <span className="relative z-10 truncate">{item.label}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {(!collapsed || isMobile) && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800/80 px-2">
          <div className="rounded-xl bg-slate-100/90 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/50 p-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>M5 Dataset Active</span>
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Live
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Store CA_1 &middot; Dept FOODS_3 &middot; 35 SKUs
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0b1120] transition-[width] duration-200 ${
          collapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        <div className="sticky top-0 h-screen">{navContent(false)}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-64 bg-white dark:bg-[#0b1120] border-r border-slate-200 dark:border-slate-800 h-full">
            {navContent(true)}
          </aside>
        </div>
      )}
    </>
  );
}
