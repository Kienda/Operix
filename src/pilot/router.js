import { useEffect, useState } from 'react';

/** Hash routes (#/customers/123?tab=x): bookmarkable, reload-safe, no server rewrites needed. */
export function parse(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return {
    path,
    segments: path.split('/').filter(Boolean),
    query: Object.fromEntries(new URLSearchParams(query)),
  };
}

export function navigate(to, { replace = false } = {}) {
  const target = `#${to}`;
  if (replace) window.history.replaceState(null, '', target);
  else window.location.hash = to;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute() {
  const [route, setRoute] = useState(() => parse());
  useEffect(() => {
    const update = () => setRoute(parse());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
}

/** Converts a legacy `?invite=` link (sent by earlier builds) into the pilot route. */
export function migrateLegacyLinks() {
  const params = new URLSearchParams(window.location.search);
  const invite = params.get('invite');
  if (invite) {
    window.history.replaceState(null, '', `${window.location.pathname}#/accept-invite?token=${encodeURIComponent(invite)}`);
  }
}
