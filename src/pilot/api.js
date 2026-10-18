// Operix pilot API client. Same-origin `/api/v1` in production (served behind
// the web container's reverse proxy); the dev API URL is only a local default.
const API_URL =
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000/api/v1' : '/api/v1');
const KEY = 'operix.pilot.session';

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}
let current = read();
const listeners = new Set();
export const session = {
  get: () => current,
  set(value) {
    current = value;
    try {
      if (value) localStorage.setItem(KEY, JSON.stringify(value));
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: session lives in memory only */
    }
    listeners.forEach((fn) => fn(value));
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
// Keep tabs consistent: signing out in one tab signs out everywhere.
window.addEventListener('storage', (event) => {
  if (event.key === KEY) {
    current = read();
    listeners.forEach((fn) => fn(current));
  }
});

async function send(path, init) {
  try {
    return await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError('Operix cannot be reached. Check your connection and try again.', 0, 'NETWORK');
  }
}

// Single-flight refresh: concurrent 401s share one rotation instead of racing.
let refreshing = null;
function refresh(stale) {
  refreshing ??= (async () => {
    const res = await send('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: stale.refreshToken }),
    });
    if (!res.ok) return false;
    const tokens = await res.json();
    if (session.get()?.refreshToken !== stale.refreshToken) return true; // another tab won
    session.set({ ...session.get(), ...tokens });
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const attempt = () => {
    const s = session.get();
    return send(path, {
      method,
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(s?.accessToken ? { Authorization: `Bearer ${s.accessToken}` } : {}),
        ...(s?.organization?.id ? { 'x-organization-id': s.organization.id } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  };
  let res = await attempt();
  const s = session.get();
  if (res.status === 401 && s?.refreshToken && !path.startsWith('/auth/login')) {
    if (await refresh(s)) res = await attempt();
    else {
      session.set(null);
      throw new ApiError('Your session has ended. Sign in again.', 401, 'SESSION_ENDED');
    }
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = payload.error ?? payload;
    const message = Array.isArray(detail.message) ? detail.message.join('; ') : detail.message;
    if (res.status === 401 && s?.accessToken && !path.startsWith('/auth/')) session.set(null);
    throw new ApiError(message || `Request failed (${res.status})`, res.status, detail.code, detail);
  }
  return payload;
}

const qs = (params = {}) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};
const post = (path, body) => api(path, { method: 'POST', body: body ?? {} });

export const auth = {
  login: (body) => api('/auth/login', { method: 'POST', body }),
  me: () => api('/auth/me'),
  logout: () => post('/auth/logout'),
  forgot: (email) => post('/auth/forgot-password', { email }),
  reset: (token, password) => post('/auth/reset-password', { token, password }),
  acceptInvite: (body) => post('/auth/invitations/accept', body),
  mfaEnroll: (body) => post('/auth/mfa/enroll', body),
  mfaConfirm: (code) => post('/auth/mfa/confirm', { code }),
  mfaDisable: (body) => post('/auth/mfa/disable', body),
};
export const records = {
  list: (module, params) => api(`/records/${module}${qs(params)}`),
  get: (module, id) => api(`/records/${module}/${id}`),
  create: (body) => post('/records', body),
  update: (module, id, body) => api(`/records/${module}/${id}`, { method: 'PATCH', body }),
  archive: (module, id) => api(`/records/${module}/${id}`, { method: 'DELETE' }),
};
export const quotations = {
  create: (body) => post('/quotations', body),
  update: (id, body) => api(`/quotations/${id}`, { method: 'PUT', body }),
  command: (id, name, reason) => post(`/quotations/${id}/${name}`, reason ? { reason } : {}),
};
export const projects = {
  command: (id, name, body) => post(`/projects/${id}/${name}`, body),
};
export const workspace = {
  dashboard: () => api('/workspace/dashboard'),
  search: (q) => api(`/workspace/search${qs({ q })}`),
};
export const organization = {
  get: () => api('/organization'),
  users: () => api('/organization/users'),
  directory: () => api('/organization/directory'),
  assignableRoles: () => api('/organization/assignable-roles'),
  invitations: () => api('/organization/invitations'),
  invite: (body) => post('/organization/invitations', body),
  revokeInvitation: (id) => api(`/organization/invitations/${id}`, { method: 'DELETE' }),
  updateMember: (id, body) => api(`/organization/users/${id}`, { method: 'PATCH', body }),
  suspend: (id) => post(`/organization/users/${id}/suspend`),
  reactivate: (id) => post(`/organization/users/${id}/reactivate`),
  audit: () => api('/organization/audit'),
};
