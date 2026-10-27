import React, { useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Settings2,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { auth, session as store } from './api.js';
import { navigate, useRoute, migrateLegacyLinks } from './router.js';
import { onLanguage, t } from './i18n.js';
import { ToastProvider } from './ui.jsx';
import { AcceptInvite, ForgotPassword, LanguageSwitch, ResetPassword, SignIn } from './auth-screens.jsx';
import { Brand } from './brand.jsx';
import Landing from './landing.jsx';
import Dashboard from './screens/dashboard.jsx';
import { CustomerDetail, CustomerList } from './screens/customers.jsx';
import { QuotationDetail, QuotationEditor, QuotationList } from './screens/quotations.jsx';
import { ProjectDetail, ProjectEditor, ProjectList } from './screens/projects.jsx';
import TaskList from './screens/tasks.jsx';
import Team from './screens/team.jsx';
import Account from './screens/account.jsx';

migrateLegacyLinks();

export const can = (s, ...permissions) => permissions.some((p) => s?.permissions?.includes(p));

const NAV = [
  { path: '/', label: 'nav.dashboard', icon: LayoutDashboard },
  { path: '/customers', label: 'nav.customers', icon: Users, permission: 'customers.view' },
  { path: '/quotations', label: 'nav.quotations', icon: FileText, permission: 'quotations.view' },
  { path: '/projects', label: 'nav.projects', icon: BriefcaseBusiness, permission: 'projects.view' },
  { path: '/tasks', label: 'nav.tasks', icon: ListTodo, permission: 'tasks.view' },
  { path: '/team', label: 'nav.team', icon: UserCog, permission: 'users.manage' },
];

function useSession() {
  const [value, setValue] = useState(store.get());
  useEffect(() => store.subscribe(setValue), []);
  return value;
}

export default function PilotApp() {
  const [, setLanguageTick] = useState(0);
  useEffect(() => onLanguage(() => setLanguageTick((n) => n + 1)), []);
  return (
    <ToastProvider>
      <Router />
    </ToastProvider>
  );
}

function Router() {
  const route = useRoute();
  const current = useSession();
  const [verified, setVerified] = useState(false);

  // Re-read the authoritative profile (permissions, branches, MFA policy) on load.
  useEffect(() => {
    if (!current?.accessToken) {
      setVerified(false);
      return;
    }
    let live = true;
    auth
      .me()
      .then((profile) => {
        if (!live) return;
        store.set({ ...store.get(), ...profile });
        setVerified(true);
      })
      .catch(() => live && store.set(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.accessToken ? current.organization?.id + current.user?.id : null]);

  const [first] = route.segments;
  const signedIn = Boolean(current?.accessToken);
  // The sign-in page has nothing to offer a signed-in user.
  useEffect(() => {
    if (signedIn && first === 'login') navigate('/', { replace: true });
  }, [signedIn, first]);

  if (first === 'accept-invite') return <AcceptInvite token={route.query.token} />;
  if (first === 'reset-password') return <ResetPassword token={route.query.token} />;
  if (!signedIn) {
    if (first === 'forgot-password') return <ForgotPassword />;
    // Public landing only at the bare root; every other route (including deep
    // links to app screens and older `/?notice=` redirects) asks to sign in.
    if (!first && !route.query.notice) return <Landing />;
    const notice = { reset: t('auth.resetDone'), invited: t('auth.inviteDone') }[route.query.notice];
    return <SignIn notice={notice} />;
  }
  if (!verified)
    return (
      <div className="px-boot" role="status">
        <Brand light />
        <span>{t('common.verifyingSession')}</span>
      </div>
    );
  return <Shell session={current} route={route} />;
}

function Shell({ session, route }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = useMemo(() => NAV.filter((item) => !item.permission || can(session, item.permission)), [session.permissions]);
  const [first, second] = route.segments;
  const mfaGate = session.mfaEnrollmentRequired;
  useEffect(() => setMenuOpen(false), [route.path]);
  useEffect(() => {
    document.title = `${t(nav.find((n) => `/${first ?? ''}` === n.path)?.label ?? 'nav.account')} · Operix`;
  });

  const signOut = async () => {
    try {
      await auth.logout();
    } catch {
      /* the local session is cleared regardless */
    }
    store.set(null);
    navigate('/login', { replace: true });
  };

  let screen;
  if (mfaGate || first === 'account') screen = <Account session={session} required={mfaGate} onSignOut={signOut} />;
  else if (!first) screen = <Dashboard session={session} />;
  else if (first === 'customers' && can(session, 'customers.view'))
    screen = second ? <CustomerDetail id={second} session={session} /> : <CustomerList session={session} query={route.query} />;
  else if (first === 'quotations' && can(session, 'quotations.view'))
    screen =
      second === 'new' ? (
        <QuotationEditor session={session} query={route.query} />
      ) : route.segments[2] === 'edit' ? (
        <QuotationEditor session={session} id={second} />
      ) : second ? (
        <QuotationDetail id={second} session={session} />
      ) : (
        <QuotationList session={session} query={route.query} />
      );
  else if (first === 'projects' && can(session, 'projects.view'))
    screen =
      second === 'new' ? (
        <ProjectEditor session={session} query={route.query} />
      ) : route.segments[2] === 'edit' ? (
        <ProjectEditor session={session} id={second} />
      ) : second ? (
        <ProjectDetail id={second} session={session} />
      ) : (
        <ProjectList session={session} query={route.query} />
      );
  else if (first === 'tasks' && can(session, 'tasks.view')) screen = <TaskList session={session} query={route.query} />;
  else if (first === 'team' && can(session, 'users.manage')) screen = <Team session={session} />;
  else
    screen = (
      <div className="px-state">
        <b>{t('common.notFound')}</b>
        <a className="px-btn px-btn-secondary" href="#/">
          {t('nav.dashboard')}
        </a>
      </div>
    );

  const initials = `${session.user.firstName?.[0] ?? ''}${session.user.lastName?.[0] ?? ''}`.toUpperCase();
  return (
    <div className="px-shell">
      <a className="px-skip" href="#px-main" onClick={(e) => { e.preventDefault(); document.getElementById('px-main')?.focus(); }}>
        {t('common.skipToContent')}
      </a>
      <aside className={`px-sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="px-sidebar-top">
          <Brand light />
          <button type="button" className="px-icon-btn px-close-menu" onClick={() => setMenuOpen(false)} aria-label={t('common.closeMenu')}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="px-workspace">
          <small>{t('nav.workspace')}</small>
          <b>{session.organization.name}</b>
          <span>{session.branches?.length ? session.branches.map((b) => b.name).join(' · ') : ''}</span>
        </div>
        <nav aria-label={t('nav.primary')}>
          {!mfaGate &&
            nav.map(({ path, label, icon: Icon }) => {
              const active = path === '/' ? !first : `/${first}` === path;
              return (
                <a key={path} href={`#${path}`} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
                  <Icon aria-hidden="true" />
                  <span>{t(label)}</span>
                </a>
              );
            })}
          <a href="#/account" className={first === 'account' || mfaGate ? 'active' : ''} aria-current={first === 'account' ? 'page' : undefined}>
            <Settings2 aria-hidden="true" />
            <span>{t('nav.account')}</span>
          </a>
        </nav>
        <div className="px-profile">
          <span className="px-avatar" aria-hidden="true">
            {initials}
          </span>
          <div>
            <b>
              {session.user.firstName} {session.user.lastName}
            </b>
            <span>{session.role?.name ?? t('common.noRole')}</span>
          </div>
          <button type="button" className="px-icon-btn" onClick={signOut} aria-label={t('nav.signOut')} title={t('nav.signOut')}>
            <LogOut aria-hidden="true" />
          </button>
        </div>
      </aside>
      {menuOpen && <div className="px-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <div className="px-main-wrap">
        <header className="px-topbar">
          <button type="button" className="px-icon-btn px-menu-btn" onClick={() => setMenuOpen(true)} aria-label={t('common.openMenu')}>
            <Menu aria-hidden="true" />
          </button>
          <div className="px-topbar-brand">
            <Brand />
          </div>
          <span className="px-pilot-tag">{t('nav.pilot')}</span>
          <LanguageSwitch />
        </header>
        <main id="px-main" tabIndex={-1} className="px-content">
          {screen}
        </main>
      </div>
    </div>
  );
}
