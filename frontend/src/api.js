import axios from 'axios'

// In dev: Vite proxy forwards /api → localhost:4000
// In prod: VITE_API_URL is your Render backend URL
const BASE = import.meta.env.VITE_API_URL || ''

const api = axios.create({ baseURL: BASE })

export const getProducts    = ()        => api.get('/api/products').then(r => r.data)
export const addProduct     = (data)    => api.post('/api/products', data).then(r => r.data)
export const deleteProduct  = (id)      => api.delete(`/api/products/${id}`)
export const getHistory     = (id)      => api.get(`/api/products/${id}/history`).then(r => r.data)
export const getProductLogs = (id)      => api.get(`/api/products/${id}/logs`).then(r => r.data)
export const getAllLogs      = ()        => api.get('/api/scrape/logs').then(r => r.data)
export const scrapeNow      = (id)      => api.post(`/api/scrape/${id}`)
