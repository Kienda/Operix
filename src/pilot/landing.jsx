import React, { useEffect } from 'react';
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  LockKeyhole,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import { t } from './i18n.js';
import { Brand } from './brand.jsx';
import { LanguageSwitch } from './auth-screens.jsx';
import './landing.css';

// Only modules the pilot actually ships (see PilotApp NAV and dashboard.pilotNote).
const MODULES = [
  { key: 'customers', icon: Users, tone: 'teal' },
  { key: 'quotations', icon: FileText, tone: 'navy' },
  { key: 'projects', icon: BriefcaseBusiness, tone: 'gold' },
  { key: 'tasks', icon: ListTodo, tone: 'teal' },
  { key: 'team', icon: UserCog, tone: 'navy' },
  { key: 'security', icon: ShieldCheck, tone: 'gold' },
];
const ASSURANCES = [
  { key: 'invite', icon: KeyRound },
  { key: 'scope', icon: LockKeyhole },
  { key: 'mfa', icon: ShieldCheck },
];

/** In-page sections use buttons, not `#id` links: the hash is the app router. */
function scrollToSection(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  target.focus({ preventScroll: true });
}

export default function Landing() {
  useEffect(() => {
    document.title = t('landing.documentTitle');
  });
  return (
    <div className="px-lp">
      <a className="px-skip" href="#/" onClick={(e) => { e.preventDefault(); scrollToSection('px-lp-main'); }}>
        {t('common.skipToContent')}
      </a>
      <header className="px-lp-header">
        <div className="px-lp-wrap px-lp-header-row">
          <a href="#/" className="px-lp-home" aria-label={t('landing.homeLabel')}>
            <Brand light subtitle />
          </a>
          <nav className="px-lp-nav" aria-label={t('landing.navLabel')}>
            <button type="button" onClick={() => scrollToSection('px-lp-modules')}>
              {t('landing.modulesLink')}
            </button>
            <button type="button" onClick={() => scrollToSection('px-lp-security')}>
              {t('landing.securityLink')}
            </button>
          </nav>
          <div className="px-lp-header-actions">
            <LanguageSwitch />
            <a className="px-btn px-btn-outline-light" href="#/login">
              {t('landing.login')}
            </a>
          </div>
        </div>
      </header>

      <main id="px-lp-main" tabIndex={-1}>
        <section className="px-lp-hero" aria-labelledby="px-lp-title">
          <div className="px-lp-wrap px-lp-hero-grid">
            <div className="px-lp-hero-copy">
              <p className="px-lp-kicker">{t('landing.kicker')}</p>
              <h1 id="px-lp-title">
                <span>{t('landing.headline1')}</span>
                <span className="px-lp-accent">{t('landing.headline2')}</span>
              </h1>
              <span className="px-lp-rule" aria-hidden="true" />
              <p className="px-lp-lead">{t('landing.lead')}</p>
              <div className="px-lp-ctas">
                <a className="px-btn px-btn-bright px-btn-lg" href="#/login">
                  {t('landing.login')} <ArrowRight aria-hidden="true" />
                </a>
                <button type="button" className="px-btn px-btn-outline-light px-btn-lg" onClick={() => scrollToSection('px-lp-modules')}>
                  {t('landing.explore')}
                </button>
              </div>
              <ul className="px-lp-points">
                {['invite', 'staging', 'support'].map((key) => (
                  <li key={key}>
                    <CheckCircle2 aria-hidden="true" /> {t(`landing.point.${key}`)}
                  </li>
                ))}
              </ul>
            </div>
            <DashboardPreview />
          </div>
        </section>

        <section id="px-lp-modules" className="px-lp-section" tabIndex={-1} aria-labelledby="px-lp-modules-title">
          <div className="px-lp-wrap">
            <div className="px-lp-section-head">
              <p className="px-eyebrow">{t('landing.modules.eyebrow')}</p>
              <h2 id="px-lp-modules-title">{t('landing.modules.title')}</h2>
              <p className="px-muted">{t('landing.modules.lead')}</p>
            </div>
            <ul className="px-lp-modules">
              {MODULES.map(({ key, icon: Icon, tone }) => (
                <li key={key} className="px-lp-module">
                  <span className={`px-lp-icon px-lp-icon-${tone}`} aria-hidden="true">
                    <Icon />
                  </span>
                  <h3>{t(`landing.module.${key}.title`)}</h3>
                  <p>{t(`landing.module.${key}.body`)}</p>
                </li>
              ))}
            </ul>
            <p className="px-lp-note">{t('landing.modules.note')}</p>
          </div>
        </section>

        <section id="px-lp-security" className="px-lp-section px-lp-security" tabIndex={-1} aria-labelledby="px-lp-security-title">
          <div className="px-lp-wrap">
            <div className="px-lp-section-head">
              <p className="px-eyebrow">{t('landing.security.eyebrow')}</p>
              <h2 id="px-lp-security-title">{t('landing.security.title')}</h2>
            </div>
            <ul className="px-lp-assurances">
              {ASSURANCES.map(({ key, icon: Icon }) => (
                <li key={key}>
                  <Icon aria-hidden="true" />
                  <div>
                    <h3>{t(`landing.security.${key}.title`)}</h3>
                    <p>{t(`landing.security.${key}.body`)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-lp-cta">
              <div>
                <h2>{t('landing.cta.title')}</h2>
                <p>{t('landing.cta.body')}</p>
              </div>
              <a className="px-btn px-btn-bright px-btn-lg" href="#/login">
                {t('landing.login')} <ArrowRight aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-lp-footer">
        <div className="px-lp-wrap px-lp-footer-row">
          <Brand light />
          <span>{t('landing.footer.rights', { year: new Date().getFullYear() })}</span>
          <a href="https://globalhightech.com" rel="noopener noreferrer">
            globalhightech.com
          </a>
        </div>
      </footer>
    </div>
  );
}

/**
 * A static rendering of the real pilot dashboard layout (same navigation and
 * metric labels). Every figure and task in it is demo data and labelled as such.
 */
function DashboardPreview() {
  const nav = [
    ['nav.dashboard', LayoutDashboard],
    ['nav.customers', Users],
    ['nav.quotations', FileText],
    ['nav.projects', BriefcaseBusiness],
    ['nav.tasks', ListTodo],
    ['nav.team', UserCog],
  ];
  const metrics = [
    ['dashboard.metric.customers', '48', Users],
    ['dashboard.metric.quotations', '7', FileText],
    ['dashboard.metric.projects', '12', BriefcaseBusiness],
    ['dashboard.metric.tasks', '23', ListTodo],
  ];
  const tasks = [
    ['landing.preview.task1', 'task.status.IN_PROGRESS', 'blue'],
    ['landing.preview.task2', 'task.status.PENDING', 'amber'],
    ['landing.preview.task3', 'task.status.PENDING', 'amber'],
  ];
  return (
    <figure className="px-lp-preview">
      <div className="px-lp-window" aria-hidden="true">
        <div className="px-lp-window-bar">
          <i />
          <i />
          <i />
        </div>
        <div className="px-lp-app">
          <div className="px-lp-app-side">
            <Brand light />
            <ul>
              {nav.map(([label, Icon], index) => (
                <li key={label} className={index === 0 ? 'active' : ''}>
                  <Icon /> {t(label)}
                </li>
              ))}
            </ul>
          </div>
          <div className="px-lp-app-main">
            <div className="px-lp-app-head">
              <div>
                <small>{t('landing.preview.workspace')}</small>
                <b>{t('nav.dashboard')}</b>
              </div>
              <span className="px-lp-demo">{t('landing.preview.demo')}</span>
            </div>
            <div className="px-lp-app-metrics">
              {metrics.map(([label, value, Icon]) => (
                <div key={label}>
                  <span className="px-lp-app-icon">
                    <Icon />
                  </span>
                  <small>{t(label)}</small>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="px-lp-app-card">
              <b>{t('dashboard.myTasks')}</b>
              <ul>
                {tasks.map(([label, status, tone]) => (
                  <li key={label}>
                    <span>{t(label)}</span>
                    <em className={`px-badge px-badge-${tone}`}>{t(status)}</em>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <figcaption>{t('landing.preview.caption')}</figcaption>
    </figure>
  );
}
