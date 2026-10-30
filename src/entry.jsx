// Remove referral attribution from shared links without reloading or changing routes.
const entryUrl = new URL(window.location.href);
if (entryUrl.searchParams.get('utm_source') === 'chatgpt.com') {
  entryUrl.searchParams.delete('utm_source');
  window.history.replaceState(
    window.history.state,
    '',
    entryUrl.pathname + entryUrl.search + entryUrl.hash,
  );
}

// The pilot owns the public landing page and real staff authentication. The
// earlier prototype's dashboards remain opt-in for local design work only.
if (import.meta.env.VITE_OPERIX_EXPERIENCE === 'prototype') {
  import('./main.jsx');
} else {
  import('./pilot/main.jsx');
}
