import axios from 'axios';
import Cookies from 'js-cookie';

// API URL: uses env var if set, otherwise points to Render production backend
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://thinkflow-6t7n.onrender.com/api';

console.log('API URL configured:', API_URL);

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60 second timeout for Render cold starts
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = Cookies.get('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove('token');
      // Only redirect to login if we're on a protected page (not already on auth pages)
      // This prevents redirect loops on login/signup/verify-otp pages
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        const authPages = ['/login', '/signup', '/verify-otp', '/forgot-password', '/'];
        if (!authPages.some(p => path.startsWith(p) || path === p)) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
