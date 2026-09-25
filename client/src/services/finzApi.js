import axios from 'axios';

const apiBaseURL = String(import.meta.env.VITE_API_URL || '').trim();
const missingProductionApiURL = import.meta.env.PROD && !apiBaseURL;

function readErrorMessage(payload) {
  const detail = payload && typeof payload === 'object'
    ? payload.error ?? payload.message
    : payload;

  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (detail && typeof detail === 'object') {
    if (typeof detail.message === 'string' && detail.message.trim()) return detail.message.trim();
    if (typeof detail.error === 'string' && detail.error.trim()) return detail.error.trim();
  }

  return null;
}

function explainApiError(error) {
  if (missingProductionApiURL) {
    return 'VITE_API_URL is not set in Vercel. Set it to the Render backend base URL, then redeploy the frontend.';
  }

  const serverMessage = readErrorMessage(error?.response?.data);
  if (serverMessage) return serverMessage;

  if (error?.code === 'ECONNABORTED') {
    return 'The FINZ API request timed out. Check that the Render backend is running.';
  }

  if (!error?.response) {
    const target = apiBaseURL ? ' at ' + apiBaseURL : '';
    return 'Could not reach the FINZ API' + target + '. Check that the Render backend is live and VITE_API_URL points to it.';
  }

  if (error.response.status === 404) {
    return 'The FINZ API endpoint was not found. Set VITE_API_URL to the Render service base URL without an /api path, then redeploy Vercel.';
  }

  return 'The FINZ API returned HTTP ' + error.response.status + '. Check the Render service logs.';
}

export const finzApi = axios.create({
  baseURL: apiBaseURL,
  timeout: 30000,
  headers: { Accept: 'application/json' }
});

finzApi.interceptors.response.use(
  response => response,
  error => Promise.reject(new Error(explainApiError(error)))
);

export const getOverview = () => finzApi.get('/api/finz/overview').then(response => response.data);
export const previewImport = file => {
  const form = new FormData();
  form.append('file', file);
  return finzApi.post('/api/finz/imports/preview', form).then(response => response.data);
};
export const confirmImport = (id, allowExternalAI) =>
  finzApi.post('/api/finz/imports/' + id + '/confirm', { allowExternalAI }).then(response => response.data);
export const correctTransaction = (id, category, reason) =>
  finzApi.patch('/api/finz/transactions/' + id, { category, reason }).then(response => response.data);
export const setReviewed = (id, reviewed) =>
  finzApi.patch('/api/finz/transactions/' + id, { reviewed }).then(response => response.data);
export const askAnalyst = (question, useExternalAI) =>
  finzApi.post('/api/finz/analyst', { question, useExternalAI }).then(response => response.data);
