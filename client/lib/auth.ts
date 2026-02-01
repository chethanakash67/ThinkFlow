import Cookies from 'js-cookie';
import api from './api';

export const setToken = (token: string) => {
  Cookies.set('token', token, { expires: 7 });
};

export const getToken = (): string | undefined => {
  return Cookies.get('token');
};

export const removeToken = () => {
  Cookies.remove('token');
};

export const isAuthenticated = (): boolean => {
  return !!getToken();
};

export const login = async (email: string, password: string) => {
  const response = await api.post('/auth/signin', { email, password });
  if (response.data.token) {
    setToken(response.data.token);
  }
  return response.data;
};

export const register = async (name: string, email: string, password: string) => {
  const response = await api.post('/auth/signup', { name, email, password });
  if (response.data.token) {
    setToken(response.data.token);
  }
  return response.data;
};

export const logout = () => {
  removeToken();
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
};

export const getCurrentUser = async () => {
  const response = await api.get('/auth/me');
  return response.data.user;
};
