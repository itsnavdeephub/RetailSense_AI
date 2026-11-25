import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';

const AppContext = createContext({
  metadata: null,
  selectedStore: 'CA_1',
  setSelectedStore: () => {},
  alerts: [],
  loadingMeta: true,
  metaError: null,
  refreshAppData: () => {},
});

export function AppProvider({ children }) {
  const [metadata, setMetadata] = useState(null);
  const [selectedStore, setSelectedStore] = useState('CA_1');
  const [alerts, setAlerts] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState(null);

  const refreshAppData = useCallback(async () => {
    setLoadingMeta(true);
    setMetaError(null);
    try {
      const [metaRes, dashRes] = await Promise.all([
        api.getMetadata(),
        api.getDashboardSummary({ store_id: selectedStore, days: 60 }),
      ]);
      setMetadata(metaRes);
      setAlerts(dashRes.alerts || []);
    } catch (err) {
      setMetaError(err.message || 'Failed to load RetailSense AI metadata.');
    } finally {
      setLoadingMeta(false);
    }
  }, [selectedStore]);

  useEffect(() => {
    refreshAppData();
  }, [refreshAppData]);

  return (
    <AppContext.Provider
      value={{
        metadata,
        selectedStore,
        setSelectedStore,
        alerts,
        loadingMeta,
        metaError,
        refreshAppData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
