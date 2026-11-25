import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { AppProvider } from './context/AppContext';
import { IntroAnimation } from './components/IntroAnimation';
import { Layout } from './components/Layout';
import { OverviewPage } from './pages/OverviewPage';
import { SalesAnalyticsPage } from './pages/SalesAnalyticsPage';
import { DemandForecastingPage } from './pages/DemandForecastingPage';
import { InventoryManagementPage } from './pages/InventoryManagementPage';
import { ModelPerformancePage } from './pages/ModelPerformancePage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  const [, setIntroDone] = useState(false);

  return (
    <ThemeProvider>
      <ToastProvider>
        <AppProvider>
          <IntroAnimation onComplete={() => setIntroDone(true)} />
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<OverviewPage />} />
                <Route path="/analytics" element={<SalesAnalyticsPage />} />
                <Route path="/forecasting" element={<DemandForecastingPage />} />
                <Route path="/inventory" element={<InventoryManagementPage />} />
                <Route path="/models" element={<ModelPerformancePage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
