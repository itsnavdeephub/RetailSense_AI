import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export function IntroAnimation({ onComplete }) {
  const [visible, setVisible] = useState(() => {
    try {
      if (sessionStorage.getItem('retailsense-intro-seen') === '1') return false;
      if (
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!visible) {
      onComplete?.();
      return;
    }

    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem('retailsense-intro-seen', '1');
      } catch {
        // ignore
      }
      setVisible(false);
      onComplete?.();
    }, 2150);

    return () => clearTimeout(timer);
  }, [visible, onComplete]);

  const handleSkip = () => {
    try {
      sessionStorage.setItem('retailsense-intro-seen', '1');
    } catch {
      // ignore
    }
    setVisible(false);
    onComplete?.();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="intro-overlay"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4, ease: 'easeInOut' } }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#050912] text-slate-100 select-none overflow-hidden"
        >
          {/* Subtle radial glow */}
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.12)_0%,rgba(124,58,237,0.06)_35%,transparent_68%)]" />

          <div className="relative z-10 flex flex-col items-center text-center px-6">
            {/* Logo Mark */}
            <motion.div
              initial={{ opacity: 0, scale: 0.86 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="w-16 h-16 rounded-2xl bg-slate-900/90 border border-blue-500/30 shadow-[0_0_35px_rgba(59,130,246,0.22)] flex items-center justify-center mb-6"
            >
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <rect
                  x="3"
                  y="3"
                  width="30"
                  height="30"
                  rx="8"
                  stroke="rgba(59,130,246,0.35)"
                  strokeWidth="1.5"
                />
                <motion.path
                  d="M8 24 L14 19 L19 21 L28 11"
                  stroke="url(#introLineGrad)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.9, ease: 'easeInOut', delay: 0.15 }}
                />
                <motion.circle
                  cx="28"
                  cy="11"
                  r="2.5"
                  fill="#60a5fa"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.95, duration: 0.25 }}
                />
                <defs>
                  <linearGradient id="introLineGrad" x1="8" y1="24" x2="28" y2="11" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#3b82f6" />
                    <stop offset="1" stopColor="#a78bfa" />
                  </linearGradient>
                </defs>
              </svg>
            </motion.div>

            {/* Glowing animated line transforming into upward trend */}
            <div className="w-64 sm:w-80 h-14 mb-4">
              <svg viewBox="0 0 320 56" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="trendGlow" x1="0" y1="0" x2="320" y2="0" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="55%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                  <filter id="glowFilter" x="-20%" y="-40%" width="140%" height="180%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <motion.path
                  d="M 10 42 C 65 42, 95 40, 130 33 C 165 26, 190 34, 225 22 C 260 10, 285 12, 310 6"
                  fill="none"
                  stroke="url(#trendGlow)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  filter="url(#glowFilter)"
                  initial={{ pathLength: 0, opacity: 0.4 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                />
              </svg>
            </div>

            {/* Brand Name */}
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.65 }}
              className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-display"
            >
              RetailSense <span className="text-blue-400">AI</span>
            </motion.h1>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.95 }}
              className="mt-2 text-sm sm:text-base text-slate-400 tracking-wide font-medium"
            >
              Predict Demand. Optimize Inventory.
            </motion.p>
          </div>

          <button
            type="button"
            onClick={handleSkip}
            className="absolute bottom-6 right-6 text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700"
          >
            Skip Intro
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
