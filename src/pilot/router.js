import { useSyncExternalStore } from 'react';

/** Canonical path routes, with compatibility for previously emailed hash links. */
export function parse(hash = window.location.hash) {
  const raw = hash.startsWith('#/')
    ? hash.slice(1)
    : window.location.pathname + window.location.search;
  const [path, query = ''] = raw.split('?');
  return {
    path,
    segments: path.split('/').filter(Boolean),
    query: Object.fromEntries(new URLSearchParams(query)),
  };
}

export function navigate(to, { replace = false } = {}) {
  if (!to.startsWith('/') || to.startsWith('//')) throw new Error('Internal route required');
  window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function subscribe(update) {
  window.addEventListener('hashchange', update);
  window.addEventListener('popstate', update);
  return () => {
    window.removeEventListener('hashchange', update);
    window.removeEventListener('popstate', update);
  };
}

export function useRoute() {
  // Redirect effects can run before a parent passive subscription is mounted.
  // React rechecks this snapshot at subscription time, avoiding a blank page.
  useSyncExternalStore(subscribe, () => window.location.href);
  return parse();
}

/** Converts a legacy `?invite=` link (sent by earlier builds) into the pilot route. */
export function migrateLegacyLinks() {
  const params = new URLSearchParams(window.location.search);
  const invite = params.get('invite');
  if (invite) {
    window.history.replaceState(null, '', `${window.location.pathname}#/accept-invite?token=${encodeURIComponent(invite)}`);
  }
}
