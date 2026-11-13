'use strict';

(() => {
  const base = String(window.COMPLIQ_API_BASE_URL || '').replace(/\/$/, '');
  const TOKEN_KEY = 'compliq_api_token';

  async function request(route, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Requested-With', 'compliq');
    const response = await fetch(`${base}/api${route}`, { ...options, headers, credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) sessionStorage.removeItem(TOKEN_KEY);
      // Temporary password (new organization operator, or reset by an admin): send the user to set a new one.
      if (response.status === 403 && payload.code === 'PASSWORD_CHANGE_REQUIRED' && !/account(\.html)?$/.test(location.pathname)) {
        location.href = 'account.html';
      }
      throw new Error(payload.error || `API request failed (${response.status}).`);
    }
    return payload;
  }

  async function login(credentials) {
    const result = await request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
    sessionStorage.setItem(TOKEN_KEY, result.token);
    return result;
  }

  async function logout() {
    try { await request('/auth/logout', { method: 'POST' }); } catch (_) {}
    sessionStorage.removeItem(TOKEN_KEY);
  }

  window.CompliQApi = {
    request,
    login,
    logout,
    hasSession: () => Boolean(sessionStorage.getItem(TOKEN_KEY)),
    tokenKey: TOKEN_KEY
  };
})();
