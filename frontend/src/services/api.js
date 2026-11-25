const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  };

  let res;
  try {
    res = await fetch(url, config);
  } catch (err) {
    throw new ApiError(
      'Unable to reach the RetailSense backend server. Make sure the Flask API is running on port 5000.',
      0,
      err.message
    );
  }

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let details = null;
    if (contentType.includes('application/json')) {
      const data = await res.json().catch(() => null);
      if (data?.error) message = data.error;
      if (data?.message) message = data.message;
      details = data;
    }
    throw new ApiError(message, res.status, details);
  }

  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res;
}

function toQuery(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      searchParams.set(k, String(v));
    }
  });
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  getHealth: () => request('/health'),
  getMetadata: () => request('/metadata'),
  getDashboardSummary: (params) => request(`/dashboard/summary${toQuery(params)}`),
  getSalesAnalytics: (params) => request(`/sales/analytics${toQuery(params)}`),
  generateForecast: (payload) =>
    request('/forecast/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getModelEvaluation: (params) => request(`/models/evaluation${toQuery(params)}`),
  getInventory: (params) => request(`/inventory${toQuery(params)}`),
  getInventoryItem: (itemId, params) => request(`/inventory/${encodeURIComponent(itemId)}${toQuery(params)}`),
  updateInventoryItem: (itemId, payload) =>
    request(`/inventory/${encodeURIComponent(itemId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  simulateInventory: (payload) =>
    request('/inventory/simulate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resetInventoryScenarios: () =>
    request('/inventory/reset', {
      method: 'POST',
    }),
  getSustainabilityInsights: (params) => request(`/sustainability${toQuery(params)}`),
  getReportUrl: (type, format, params = {}) => {
    return `${API_BASE}/reports/export${toQuery({ type, format, ...params })}`;
  },
  getSalesCsvUrl: (params = {}) => {
    return `${API_BASE}/sales/export${toQuery(params)}`;
  },
};
