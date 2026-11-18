import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

/** The access token lives only in memory; the refresh token is an httpOnly cookie the JS cannot read. */
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.set('Authorization', `Bearer ${accessToken}`);
  return config;
});

let refreshing: Promise<string | null> | null = null;

export async function refreshSession(): Promise<{ accessToken: string; user: any; profile: any } | null> {
  try {
    const res = await axios.post(`${api.defaults.baseURL}/auth/refresh`, null, { withCredentials: true });
    const d = res.data.data;
    setAccessToken(d.accessToken);
    return d;
  } catch {
    setAccessToken(null);
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      refreshing ??= refreshSession().then((d) => d?.accessToken ?? null).finally(() => { refreshing = null; });
      const token = await refreshing;
      if (token) {
        original.headers.set('Authorization', `Bearer ${token}`);
        return api(original);
      }
      window.dispatchEvent(new Event('auth:expired'));
    }
    return Promise.reject(error);
  },
);

/** Human readable message from any API / network error. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as AxiosError<{ error?: { message?: string; details?: { path: string; message: string }[] } }>;
  if (e?.response?.data?.error) {
    const { message, details } = e.response.data.error;
    if (details?.length) return details.map((d) => d.message).join('. ');
    return message ?? fallback;
  }
  if (e?.code === 'ECONNABORTED') return 'The request timed out.';
  if (e?.message === 'Network Error') return 'Cannot reach the server. Check your connection.';
  return fallback;
}

export interface Paged<T> { items: T[]; meta: { page: number; limit: number; total: number; totalPages: number; unread?: number } }

/** GET helper returning { data, meta } from the standard envelope. */
export async function getPaged<T>(url: string, params?: Record<string, unknown>): Promise<Paged<T>> {
  const clean = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));
  const res = await api.get(url, { params: clean });
  return { items: res.data.data, meta: res.data.meta };
}

export const get = async <T = any>(url: string, params?: Record<string, unknown>): Promise<T> => {
  const clean = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));
  return (await api.get(url, { params: clean })).data.data;
};
export const post = async <T = any>(url: string, body?: unknown): Promise<T> => (await api.post(url, body)).data.data;
export const patch = async <T = any>(url: string, body?: unknown): Promise<T> => (await api.patch(url, body)).data.data;
export const put = async <T = any>(url: string, body?: unknown): Promise<T> => (await api.put(url, body)).data.data;
export const del = async <T = any>(url: string): Promise<T> => (await api.delete(url)).data.data;
