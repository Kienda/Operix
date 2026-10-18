const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

function loadSession() {
  try { return JSON.parse(localStorage.getItem('operix.session') || 'null'); }
  catch { return null; }
}

export const sessionStore = {
  get: loadSession,
  set(value) { localStorage.setItem('operix.session', JSON.stringify(value)); },
  clear() { localStorage.removeItem('operix.session'); },
};

/** Turns an unreachable API into a message that names the real problem. */
async function send(url, init) {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(`Cannot reach the Operix API at ${API_URL}. Start the backend with "pnpm api:dev".`);
  }
}

export async function api(path, options = {}) {
  const session = loadSession();
  let response = await send(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...(session?.organization?.id ? { 'x-organization-id': session.organization.id } : {}),
      ...options.headers,
    },
  });
  if (response.status === 401 && session?.refreshToken && path !== '/auth/refresh') {
    const refreshed = await send(`${API_URL}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (refreshed.ok) {
      const tokens = await refreshed.json();
      sessionStore.set({ ...session, ...tokens });
      response = await send(`${API_URL}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}`,
          ...(session.organization?.id ? { 'x-organization-id': session.organization.id } : {}),
          ...options.headers,
        },
      });
    } else sessionStore.clear();
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // The API wraps failures as { success:false, error:{ code, message } }; keep the
    // bare `message` fallback for anything that answers before the filter runs.
    const detail = body.error ?? body;
    const message = Array.isArray(detail.message) ? detail.message.join(', ') : detail.message;
    const error = new Error(message || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = detail.code;
    error.details = detail;
    throw error;
  }
  return body;
}

export const authApi = {
  login: (payload) => api('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => api('/auth/me'),
  acceptInvitation: (payload) => api('/auth/invitations/accept', { method: 'POST', body: JSON.stringify(payload) }),
  forgotPassword: (email) => api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, password) => api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  logout: () => api('/auth/logout', { method: 'POST' }),
};

export const recordsApi = {
  list: (module, query = '') => api(`/records/${module}${query ? `?${query}` : ''}`),
  create: (payload) => api('/records', { method: 'POST', body: JSON.stringify(payload) }),
  update: (module, id, payload) => api(`/records/${module}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  archive: (module, id) => api(`/records/${module}/${id}`, { method: 'DELETE' }),
};

export const attendanceApi = {
  list: () => api('/attendance'),
  mine: () => api('/attendance/mine'),
  pending: () => api('/attendance/pending'),
  checkIn: (location) => api('/attendance/check-in', { method: 'POST', body: JSON.stringify(location) }),
  checkOut: (id, location) => api(`/attendance/${id}/check-out`, { method: 'POST', body: JSON.stringify(location) }),
};

export const workspaceApi = {
  dashboard: () => api('/workspace/dashboard'),
  search: (query) => api(`/workspace/search?q=${encodeURIComponent(query)}`),
};

export const organizationApi = {
  users: () => api('/organization/users'),
  roles: () => api('/organization/roles'),
  organization: () => api('/organization'),
  invitations: () => api('/organization/invitations'),
  invite: (payload) => api('/organization/invitations', { method: 'POST', body: JSON.stringify(payload) }),
};
