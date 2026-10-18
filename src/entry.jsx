// Build-time switch. The production pilot ships only the staff application; the
// earlier prototype (marketing site + mock-data modules) is opt-in for local
// design work with VITE_OPERIX_EXPERIENCE=prototype and is tree-shaken otherwise.
if (import.meta.env.VITE_OPERIX_EXPERIENCE === 'prototype') {
  import('./main.jsx');
} else {
  import('./pilot/main.jsx');
}
