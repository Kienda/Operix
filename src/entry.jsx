// The pilot owns the shared public landing page and real staff authentication.
// The earlier prototype's dashboards remain opt-in for local design work only.
if (import.meta.env.VITE_OPERIX_EXPERIENCE === 'prototype') {
  import('./main.jsx');
} else {
  import('./pilot/main.jsx');
}
