import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { LogOut, ShieldCheck, ShieldOff } from 'lucide-react';
import { auth, session as store } from '../api.js';
import { t } from '../i18n.js';
import { DefinitionList, Field, FormError, Notice, PageHeader, useToast } from '../ui.jsx';
import { LanguageSwitch } from '../auth-screens.jsx';

function MfaSetup({ session, onDone }) {
  const [step, setStep] = useState('password');
  const [password, setPassword] = useState('');
  const [currentCode, setCurrentCode] = useState('');
  const [enrollment, setEnrollment] = useState(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!enrollment) return;
    // Rendered locally; the secret never leaves the browser for a third-party QR service.
    QRCode.toDataURL(enrollment.otpauthUrl, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(''));
  }, [enrollment]);
  const start = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      setEnrollment(await auth.mfaEnroll({ password, ...(session.user.mfaEnabled ? { code: currentCode } : {}) }));
      setStep('scan');
    } catch (err) {
      setError(err.status === 429 ? t('auth.rateLimited') : err.message);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await auth.mfaConfirm(code);
      onDone();
    } catch (err) {
      setError(err.status === 401 ? t('account.mfaWrongCode') : err.message);
      setBusy(false);
    }
  };
  if (step === 'password')
    return (
      <form className="px-form" onSubmit={start}>
        <p className="px-muted">{t('account.mfaIntro')}</p>
        <Field label={t('auth.password')} required>
          {(p) => <input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        {session.user.mfaEnabled && (
          <Field label={t('account.currentCode')} required>
            {(p) => <input {...p} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={currentCode} onChange={(e) => setCurrentCode(e.target.value)} />}
          </Field>
        )}
        {error && <FormError>{error}</FormError>}
        <button className="px-btn px-btn-primary" disabled={busy}>
          {t('account.mfaContinue')}
        </button>
      </form>
    );
  return (
    <form className="px-form" onSubmit={confirm}>
      <ol className="px-steps">
        <li>{t('account.mfaStep1')}</li>
        <li>{t('account.mfaStep2')}</li>
      </ol>
      <div className="px-qr">
        {qr ? <img src={qr} width={220} height={220} alt={t('account.mfaQrAlt')} /> : null}
        <div>
          <span>{t('account.mfaManual')}</span>
          <code aria-label={t('account.mfaManual')}>{enrollment.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
          <small>{t('account.mfaExpires')}</small>
        </div>
      </div>
      <Field label={t('account.mfaCode')} required>
        {(p) => <input {...p} data-autofocus inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />}
      </Field>
      {error && <FormError>{error}</FormError>}
      <button className="px-btn px-btn-primary" disabled={busy}>
        <ShieldCheck aria-hidden="true" /> {t('account.mfaActivate')}
      </button>
    </form>
  );
}

function MfaDisable({ onDone }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await auth.mfaDisable({ password, code });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form className="px-form" onSubmit={submit}>
      <Field label={t('auth.password')} required>
        {(p) => <input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Field label={t('account.currentCode')} required>
        {(p) => <input {...p} inputMode="numeric" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />}
      </Field>
      {error && <FormError>{error}</FormError>}
      <button className="px-btn px-btn-ghost-danger" disabled={busy}>
        <ShieldOff aria-hidden="true" /> {t('account.mfaDisable')}
      </button>
    </form>
  );
}

export default function Account({ session, required, onSignOut }) {
  const toast = useToast();
  const [mode, setMode] = useState(required ? 'setup' : null);
  const refresh = async (message) => {
    const profile = await auth.me();
    store.set({ ...store.get(), ...profile });
    setMode(null);
    toast(message);
  };
  return (
    <>
      <PageHeader title={t('account.title')} description={t('account.subtitle')} actions={
        <button type="button" className="px-btn px-btn-secondary" onClick={onSignOut}>
          <LogOut aria-hidden="true" /> {t('nav.signOut')}
        </button>
      } />
      {required && <Notice tone="warning">{t('account.mfaRequired')}</Notice>}
      <div className="px-detail-grid">
        <section className="px-card">
          <h2>{t('account.profile')}</h2>
          <DefinitionList
            items={[
              [t('common.name'), `${session.user.firstName} ${session.user.lastName}`],
              [t('common.email'), session.user.email],
              [t('team.role'), session.role?.name],
              [t('team.branches'), session.branches?.map((b) => b.name).join(', ')],
              [t('nav.workspace'), session.organization.name],
            ]}
          />
          <div className="px-field">
            <span className="px-label">{t('common.language')}</span>
            <LanguageSwitch />
          </div>
        </section>
        <section className="px-card" aria-labelledby="mfa-heading">
          <h2 id="mfa-heading">{t('account.mfa')}</h2>
          <p>
            {session.user.mfaEnabled ? (
              <span className="px-badge px-badge-green"><ShieldCheck aria-hidden="true" /> {t('team.mfaOn')}</span>
            ) : (
              <span className="px-badge px-badge-amber">{t('team.mfaOff')}</span>
            )}
          </p>
          {mode === 'setup' && <MfaSetup session={session} onDone={() => refresh(t('account.mfaEnabled'))} />}
          {mode === 'disable' && <MfaDisable onDone={() => refresh(t('account.mfaDisabled'))} />}
          {!mode && (
            <div className="px-actions px-actions-start">
              <button type="button" className="px-btn px-btn-primary" onClick={() => setMode('setup')}>
                <ShieldCheck aria-hidden="true" /> {session.user.mfaEnabled ? t('account.mfaReplace') : t('account.mfaSetup')}
              </button>
              {session.user.mfaEnabled && (
                <button type="button" className="px-btn px-btn-ghost-danger" onClick={() => setMode('disable')}>
                  {t('account.mfaDisable')}
                </button>
              )}
            </div>
          )}
          <small className="px-muted">{t('account.mfaSessionsNote')}</small>
        </section>
      </div>
    </>
  );
}
