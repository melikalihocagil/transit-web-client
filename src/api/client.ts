import axios from 'axios';

// Vite proxy (/api) veya ortam değişkeninden gelen baseURL kullanılır
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-User-Id': 'operator-1',
    'X-User-Role': 'OPERATOR',
  },
  timeout: 10000,
});
