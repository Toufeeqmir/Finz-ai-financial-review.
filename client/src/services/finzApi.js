import axios from 'axios';

export const finzApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || '', timeout: 30000, headers: { Accept: 'application/json' } });
finzApi.interceptors.response.use(r => r, error => Promise.reject(new Error(error.response?.data?.error || (error.code === 'ECONNREFUSED' ? 'Could not reach the FINZ API. Start the backend and MongoDB.' : error.message || 'Request failed.'))));
export const getOverview = () => finzApi.get('/api/finz/overview').then(r => r.data);
export const previewImport = file => { const form = new FormData(); form.append('file', file); return finzApi.post('/api/finz/imports/preview', form).then(r => r.data); };
export const confirmImport = (id, allowExternalAI) => finzApi.post(`/api/finz/imports/${id}/confirm`, { allowExternalAI }).then(r => r.data);
export const correctTransaction = (id, category, reason) => finzApi.patch(`/api/finz/transactions/${id}`, { category, reason }).then(r => r.data);
export const setReviewed = (id, reviewed) => finzApi.patch(`/api/finz/transactions/${id}`, { reviewed }).then(r => r.data);
export const askAnalyst = (question, useExternalAI) => finzApi.post('/api/finz/analyst', { question, useExternalAI }).then(r => r.data);
