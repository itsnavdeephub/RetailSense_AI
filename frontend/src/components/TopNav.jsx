import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search,
  Bell,
  Sun,
  Moon,
  Store,
  Menu,
  UserCircle2,
  AlertTriangle,
  Settings,
  Leaf,
  RotateCcw,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';
import { NAV_ITEMS } from './Sidebar';

export function TopNav({ onOpenMobileNav }) {
  const { theme, toggleTheme } = useTheme();
  const { metadata, selectedStore, setSelectedStore, alerts } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const currentPageTitle = useMemo(() => {
    const matched = NAV_ITEMS.find((item) =>
      item.path === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(item.path)
    );
    return matched ? matched.label : 'Overview';
  }, [location.pathname]);

  const matchingProducts = useMemo(() => {
    const list = metadata?.products || [];
    const q = query.trim().toLowerCase();
    if (!q) return list.slice(0, 6);
    return list
      .filter(
        (p) =>
          p.item_id.toLowerCase().includes(q) ||
          p.velocity_tier.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [metadata, query]);

  const stores = metadata?.stores || [
    { store_id: 'CA_1', label: 'CA_1 — California Store 1 (Active)', active: true },
  ];

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-slate-800/80 glass-panel px-4 sm:px-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100 truncate font-display">
          {currentPageTitle}
        </h1>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Global Product Search */}
        <div ref={searchRef} className="relative hidden md:block w-64 xl:w-72">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              placeholder="Search SKU (e.g. FOODS_3_090)..."
              className="w-full pl-9 pr-3 py-1.5 text-sm rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          {searchOpen && matchingProducts.length > 0 && (
            <div className="absolute left-0 right-0 mt-2 surface-card rounded-xl shadow-xl overflow-hidden z-40">
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                Quick Jump to Product
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
                {matchingProducts.map((p) => (
                  <div
                    key={p.item_id}
                    className="px-3 py-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOpen(false);
                        setQuery('');
                        navigate(`/forecasting?product=${encodeURIComponent(p.item_id)}`);
                      }}
                      className="text-left flex-1 min-w-0"
                    >
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {p.item_id}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {p.velocity_tier} &middot; ${p.avg_price.toFixed(2)}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOpen(false);
                        setQuery('');
                        navigate(`/inventory?search=${encodeURIComponent(p.item_id)}`);
                      }}
                      className="text-[11px] font-medium px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
                    >
                      Stock
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Store Selector */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70">
          <Store className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            aria-label="Select store"
            className="bg-transparent text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
          >
            {stores.map((s) => (
              <option key={s.store_id} value={s.store_id} className="bg-white dark:bg-slate-900">
                {s.store_id} (FOODS_3)
              </option>
            ))}
          </select>
        </div>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((o) => !o)}
            className="relative p-2 rounded-xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Inventory alerts"
          >
            <Bell className="w-4 h-4" />
            {alerts.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                {alerts.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 surface-card rounded-2xl shadow-xl overflow-hidden z-40">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Replenishment Alerts
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {alerts.length} active
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
                {alerts.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500 text-center">
                    No active stockout alerts.
                  </div>
                ) : (
                  alerts.map((a) => (
                    <button
                      key={a.item_id}
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        navigate(`/inventory?search=${encodeURIComponent(a.item_id)}`);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-start gap-2.5 transition-colors"
                    >
                      <AlertTriangle
                        className={`w-4 h-4 mt-0.5 shrink-0 ${
                          a.status === 'critical' ? 'text-rose-500' : 'text-amber-500'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                            {a.item_id}
                          </span>
                          <span
                            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                              a.status === 'critical'
                                ? 'bg-rose-500/15 text-rose-500'
                                : 'bg-amber-500/15 text-amber-500'
                            }`}
                          >
                            {a.status === 'critical' ? 'Critical' : 'Low Stock'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          ~{a.estimated_days_of_stock}d left &middot; Order {a.recommended_order_qty} units
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Toggle theme"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
        </button>

        {/* Profile / Quick Settings Menu */}
        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Workspace menu"
          >
            <UserCircle2 className="w-5 h-5 text-blue-500" />
            <span className="hidden xl:inline text-xs font-medium text-slate-700 dark:text-slate-200">
              Ops Lead
            </span>
          </button>
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-56 surface-card rounded-2xl shadow-xl py-1.5 z-40">
              <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Retail Operations Lead
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Store CA_1 &middot; FOODS_3
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('/settings');
                }}
                className="w-full px-3.5 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                <Settings className="w-3.5 h-3.5" />
                Platform Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('/inventory');
                }}
                className="w-full px-3.5 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                <Leaf className="w-3.5 h-3.5 text-emerald-500" />
                SDG 12 Sustainability
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('/reports');
                }}
                className="w-full px-3.5 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Export Reports
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
