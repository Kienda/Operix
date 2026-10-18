import React, { useState } from 'react';
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { auth, session } from './api.js';
import { navigate } from './router.js';
import { t, LANGUAGES, getLanguage, setLanguage } from './i18n.js';
import { Field, FormError, Notice } from './ui.jsx';

export function Brand({ light = false }) {
  return (
    <div className={`px-brand ${light ? 'px-brand-light' : ''}`}>
      <span className="px-logo" aria-hidden="true">
        <i />
      </span>
      <b>Operix</b>
    </div>
  );
}

export function LanguageSwitch() {
  return (
    <label className="px-lang">
      <span className="px-sr">{t('common.language')}</span>
      <select value={getLanguage()} onChange={(e) => setLanguage(e.target.value)}>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="px-auth">
      <aside className="px-auth-aside">
        <Brand light />
        <div>
          <p className="px-eyebrow">{t('auth.asideEyebrow')}</p>
          <h2>{t('auth.asideTitle')}</h2>
          <p>{t('auth.asideBody')}</p>
        </div>
        <small>© {new Date().getFullYear()} Global High Tech</small>
      </aside>
      <main className="px-auth-main">
        <div className="px-auth-top">
          <div className="px-auth-mobile-brand">
            <Brand />
          </div>
          <LanguageSwitch />
        </div>
        <div className="px-auth-card">
          <h1>{title}</h1>
          {subtitle && <p className="px-muted">{subtitle}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}

const PasswordInput = (props) => <input type="password" autoComplete="current-password" maxLength={256} {...props} />;

export function SignIn({ notice }) {
  const [form, setForm] = useState({ email: '', password: '', mfaCode: '', organizationSlug: '' });
  const [step, setStep] = useState('credentials'); // credentials | mfa | workspace
  const [workspaces, setWorkspaces] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await auth.login({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        ...(form.mfaCode ? { mfaCode: form.mfaCode } : {}),
        ...(form.organizationSlug ? { organizationSlug: form.organizationSlug } : {}),
      });
      session.set(result);
      navigate('/', { replace: true });
    } catch (err) {
      if (err.code === 'MFA_REQUIRED') setStep('mfa');
      else if (err.code === 'WORKSPACE_SELECTION_REQUIRED') {
        setWorkspaces(err.details.workspaces ?? []);
        setForm((f) => ({ ...f, organizationSlug: err.details.workspaces?.[0]?.slug ?? '' }));
        setStep('workspace');
      } else if (err.status === 429) setError(t('auth.rateLimited'));
      else if (err.code === 'MFA_INVALID') setError(t('auth.mfaInvalid'));
      else if (err.status === 401) setError(t('auth.invalidCredentials'));
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout title={t('auth.signInTitle')} subtitle={t('auth.signInSubtitle')}>
      {notice && <Notice tone="success">{notice}</Notice>}
      <form className="px-form" onSubmit={submit} noValidate={false}>
        {step === 'credentials' && (
          <>
            <Field label={t('auth.email')} required>
              {(p) => <input {...p} type="email" autoComplete="username" required value={form.email} onChange={update('email')} />}
            </Field>
            <Field label={t('auth.password')} required>
              {(p) => <PasswordInput {...p} required minLength={8} value={form.password} onChange={update('password')} />}
            </Field>
          </>
        )}
        {step === 'mfa' && (
          <Field label={t('auth.mfaCode')} hint={t('auth.mfaHint')} required>
            {(p) => (
              <input {...p} data-autofocus autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={form.mfaCode} onChange={update('mfaCode')} />
            )}
          </Field>
        )}
        {step === 'workspace' && (
          <Field label={t('auth.workspace')} required>
            {(p) => (
              <select {...p} value={form.organizationSlug} onChange={update('organizationSlug')}>
                {workspaces.map((w) => (
                  <option key={w.slug} value={w.slug}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {error && <FormError>{error}</FormError>}
        <button className="px-btn px-btn-primary px-btn-block" disabled={busy}>
          {busy ? <Loader2 className="px-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          {step === 'mfa' ? t('auth.verify') : t('auth.signIn')}
        </button>
        {step !== 'credentials' && (
          <button type="button" className="px-link" onClick={() => { setStep('credentials'); setForm((f) => ({ ...f, mfaCode: '' })); }}>
            {t('auth.back')}
          </button>
        )}
        <a className="px-link" href="#/forgot-password">
          {t('auth.forgot')}
        </a>
      </form>
    </AuthLayout>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await auth.forgot(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      setError(err.status === 429 ? t('auth.rateLimited') : err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')}>
      {sent ? (
        <Notice tone="success">{t('auth.forgotSent')}</Notice>
      ) : (
        <form className="px-form" onSubmit={submit}>
          <Field label={t('auth.email')} required>
            {(p) => <input {...p} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          {error && <FormError>{error}</FormError>}
          <button className="px-btn px-btn-primary px-btn-block" disabled={busy}>
            {t('auth.sendLink')}
          </button>
        </form>
      )}
      <a className="px-link" href="#/">
        {t('auth.backToSignIn')}
      </a>
    </AuthLayout>
  );
}

function NewPasswordFields({ value, onChange, confirm, onConfirm }) {
  const mismatch = confirm && value !== confirm;
  return (
    <>
      <Field label={t('auth.newPassword')} hint={t('auth.passwordRule')} required>
        {(p) => <input {...p} type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={value} onChange={(e) => onChange(e.target.value)} />}
      </Field>
      <Field label={t('auth.confirmPassword')} error={mismatch ? t('auth.passwordMismatch') : ''} required>
        {(p) => <input {...p} type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={confirm} onChange={(e) => onConfirm(e.target.value)} />}
      </Field>
    </>
  );
}

export function ResetPassword({ token }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirm) return setError(t('auth.passwordMismatch'));
    setBusy(true);
    setError('');
    try {
      await auth.reset(token, password);
      navigate('/?notice=reset', { replace: true });
    } catch (err) {
      setError(err.status === 401 ? t('auth.linkInvalid') : err.message);
      setBusy(false);
    }
  };
  if (!token) return <AuthLayout title={t('auth.resetTitle')}><FormError>{t('auth.linkInvalid')}</FormError></AuthLayout>;
  return (
    <AuthLayout title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')}>
      <form className="px-form" onSubmit={submit}>
        <NewPasswordFields value={password} onChange={setPassword} confirm={confirm} onConfirm={setConfirm} />
        {error && <FormError>{error}</FormError>}
        <button className="px-btn px-btn-primary px-btn-block" disabled={busy}>
          {t('auth.savePassword')}
        </button>
      </form>
    </AuthLayout>
  );
}

export function AcceptInvite({ token }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', password: '', confirm: '' });
  const [existing, setExisting] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (!existing && form.password !== form.confirm) return setError(t('auth.passwordMismatch'));
    setBusy(true);
    setError('');
    try {
      await auth.acceptInvite({
        token,
        firstName: form.firstName.trim() || '-',
        lastName: form.lastName.trim() || '-',
        password: form.password,
      });
      navigate('/?notice=invited', { replace: true });
    } catch (err) {
      if (err.code === 'EXISTING_ACCOUNT_PASSWORD_REQUIRED') {
        setExisting(true);
        setError(t('auth.existingAccount'));
      } else setError(err.status === 401 ? t('auth.inviteInvalid') : err.message);
      setBusy(false);
    }
  };
  if (!token) return <AuthLayout title={t('auth.inviteTitle')}><FormError>{t('auth.inviteInvalid')}</FormError></AuthLayout>;
  return (
    <AuthLayout title={t('auth.inviteTitle')} subtitle={t('auth.inviteSubtitle')}>
      <form className="px-form" onSubmit={submit}>
        {!existing && (
          <div className="px-grid-2">
            <Field label={t('auth.firstName')} required>
              {(p) => <input {...p} autoComplete="given-name" maxLength={80} required value={form.firstName} onChange={(e) => update('firstName')(e.target.value)} />}
            </Field>
            <Field label={t('auth.lastName')} required>
              {(p) => <input {...p} autoComplete="family-name" maxLength={80} required value={form.lastName} onChange={(e) => update('lastName')(e.target.value)} />}
            </Field>
          </div>
        )}
        {existing ? (
          <Field label={t('auth.existingPassword')} required>
            {(p) => <PasswordInput {...p} required value={form.password} onChange={(e) => update('password')(e.target.value)} />}
          </Field>
        ) : (
          <NewPasswordFields value={form.password} onChange={update('password')} confirm={form.confirm} onConfirm={update('confirm')} />
        )}
        {error && <FormError>{error}</FormError>}
        <button className="px-btn px-btn-primary px-btn-block" disabled={busy}>
          {t('auth.activate')} <ArrowRight aria-hidden="true" />
        </button>
      </form>
    </AuthLayout>
  );
}
