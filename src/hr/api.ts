import type { Bootstrap, Lang, AssistantAnswer, DemoAccess, Role } from './types';
import { makeT, readLanguage } from './i18n';
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const lang = readLanguage();
  const t = makeT(lang);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), headers: { 'Accept-Language': lang, ...(options.body && !(options.body instanceof File) ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(t('serverUnavailable'), 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status >= 500 && !data.code ? t('serverUnavailable') : data.error || t('networkError'), response.status);
  return data as T;
}
export const bootstrap = () => api<Bootstrap>('/bootstrap');
export const login = (email: string, password: string) => api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const logout = () => api('/auth/logout', { method: 'POST' });
export const getDemoAccess = () => api<DemoAccess>('/auth/demo');
export const demoLogin = (role: Role) => api('/auth/demo-login', { method: 'POST', body: JSON.stringify({ role }) });
export const askAssistant = (question: string, lang: Lang) => api<AssistantAnswer>('/assistant', { method: 'POST', body: JSON.stringify({ question, lang }) });
