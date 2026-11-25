import React from 'react';
import { motion } from 'framer-motion';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { AnimatedCounter } from './AnimatedCounter';

export function KpiCard({
  title,
  value,
  displayText,
  decimals = 0,
  prefix = '',
  suffix = '',
  description,
  icon: Icon,
  accent = 'blue',
  sparkline = [],
}) {
  const accentStyles = {
    blue: {
      iconBg: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
      stroke: '#3b82f6',
      fill: 'rgba(59, 130, 246, 0.2)',
    },
    violet: {
      iconBg: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
      stroke: '#8b5cf6',
      fill: 'rgba(139, 92, 246, 0.2)',
    },
    amber: {
      iconBg: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
      stroke: '#f59e0b',
      fill: 'rgba(245, 158, 11, 0.2)',
    },
    emerald: {
      iconBg: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
      stroke: '#10b981',
      fill: 'rgba(16, 185, 129, 0.2)',
    },
  };

  const style = accentStyles[accent] || accentStyles.blue;
  const sparkData = sparkline.map((v, i) => ({ i, v }));

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18 }}
      className="surface-card rounded-2xl p-5 flex flex-col justify-between gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {title}
          </p>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white font-display tracking-tight">
            {displayText !== undefined ? (
              displayText
            ) : (
              <AnimatedCounter
                value={value}
                decimals={decimals}
                prefix={prefix}
                suffix={suffix}
              />
            )}
          </div>
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-xl shrink-0 ${style.iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      <div className="flex items-end justify-between gap-3 pt-1">
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
          {description}
        </p>
        {sparkData.length > 1 && (
          <div className="w-20 h-9 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData}>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={style.stroke}
                  strokeWidth={1.8}
                  fill={style.fill}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </motion.div>
  );
}
