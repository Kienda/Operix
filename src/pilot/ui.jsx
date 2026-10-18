import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, X } from 'lucide-react';
import { t } from './i18n.js';

// ---------------------------------------------------------------- data loading
/** Loads on mount / when `deps` change; never shows stale data from a previous key. */
export function useResource(load, deps) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ loading: true, error: null, data: null });
    load()
      .then((data) => live && setState({ loading: false, error: null, data }))
      .catch((error) => live && setState({ loading: false, error, data: null }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/** Loading → error (with retry) → empty → content. Business data is never invented. */
export function StateView({ resource, empty, isEmpty, children }) {
  if (resource.loading)
    return (
      <div className="px-state" role="status">
        <Loader2 className="px-spin" aria-hidden="true" />
        <span>{t('common.loading')}</span>
      </div>
    );
  if (resource.error)
    return (
      <div className="px-state px-state-error" role="alert">
        <AlertTriangle aria-hidden="true" />
        <b>{resource.error.status === 403 ? t('common.forbidden') : t('common.loadFailed')}</b>
        <span>{resource.error.message}</span>
        {resource.error.status !== 403 && (
          <button type="button" className="px-btn px-btn-secondary" onClick={resource.reload}>
            <RotateCcw aria-hidden="true" /> {t('common.retry')}
          </button>
        )}
      </div>
    );
  if (isEmpty?.(resource.data))
    return <div className="px-state">{empty}</div>;
  return children(resource.data);
}

// ---------------------------------------------------------------- toasts
const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message) => {
    const id = Math.random().toString(36).slice(2);
    setItems((list) => [...list, { id, message }]);
    window.setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="px-toasts" role="status" aria-live="polite">
        {items.map((item) => (
          <div className="px-toast" key={item.id}>
            <CheckCircle2 aria-hidden="true" />
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

// ---------------------------------------------------------------- dialogs
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Dialog({ title, description, onClose, children, wide = false }) {
  const ref = useRef(null);
  const titleId = useId();
  const descId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const node = ref.current;
    (node.querySelector('[data-autofocus]') ?? node.querySelector(FOCUSABLE))?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close.current();
      }
      if (event.key === 'Tab') {
        const focusable = [...node.querySelectorAll(FOCUSABLE)];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    node.addEventListener('keydown', onKey);
    document.body.classList.add('px-modal-open');
    return () => {
      node.removeEventListener('keydown', onKey);
      document.body.classList.remove('px-modal-open');
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="px-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`px-dialog ${wide ? 'px-dialog-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
      >
        <header>
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descId}>{description}</p>}
          </div>
          <button type="button" className="px-icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <X aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

/**
 * Confirmation for consequential actions. Success is only reported after the
 * action promise resolves; failures stay visible in the dialog.
 */
export function ConfirmDialog({ title, body, confirmLabel, danger, reason, onConfirm, onClose }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onConfirm(text.trim());
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Dialog title={title} description={body} onClose={onClose}>
      <form onSubmit={submit} className="px-form">
        {reason && (
          <Field label={reason.label} required={reason.required}>
            {(props) => (
              <textarea {...props} data-autofocus rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} required={reason.required} />
            )}
          </Field>
        )}
        {error && <FormError>{error}</FormError>}
        <div className="px-actions">
          <button type="button" className="px-btn px-btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className={`px-btn ${danger ? 'px-btn-danger' : 'px-btn-primary'}`} disabled={busy || (reason?.required && !text.trim())}>
            {busy && <Loader2 className="px-spin" aria-hidden="true" />} {confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- forms
export function Field({ label, hint, error, required, children }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`px-field ${error ? 'px-field-invalid' : ''}`}>
      {/* The asterisk is drawn by CSS; assistive tech gets "required" from the input itself. */}
      <label htmlFor={id} className={required ? 'px-label-required' : undefined}>
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && <small id={hintId}>{hint}</small>}
      {error && (
        <small id={errorId} className="px-field-error">
          {error}
        </small>
      )}
    </div>
  );
}
export const FormError = ({ children }) => (
  <div className="px-alert px-alert-error" role="alert">
    <AlertTriangle aria-hidden="true" />
    <span>{children}</span>
  </div>
);
export const Notice = ({ tone = 'info', children }) => (
  <div className={`px-alert px-alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    {children}
  </div>
);

// ---------------------------------------------------------------- display
const STATUS_TONE = {
  ACTIVE: 'green', APPROVED: 'green', COMPLETED: 'green',
  IN_PROGRESS: 'blue', PENDING: 'amber', DRAFT: 'gray',
  CANCELLED: 'red', ARCHIVED: 'gray', SUSPENDED: 'red',
};
/** Always a visible text label; color is supplementary. */
export function StatusBadge({ module, status, data }) {
  const key = statusKey(module, status, data);
  return <span className={`px-badge px-badge-${STATUS_TONE[status] ?? 'gray'}`}>{t(key)}</span>;
}
export function statusKey(module, status, data = {}) {
  if (module === 'quotations') {
    if (status === 'CANCELLED') return data.outcome === 'declined' ? 'quote.status.declined' : 'quote.status.cancelled';
    if (status === 'PENDING' && data.validUntil && data.validUntil < new Date().toISOString().slice(0, 10)) return 'quote.status.expired';
    return `quote.status.${status}`;
  }
  if (module === 'projects' && status === 'PENDING') return data.holdReason ? 'project.status.ON_HOLD' : 'project.status.PENDING';
  return `${module === 'tasks' ? 'task' : module === 'projects' ? 'project' : module === 'customers' ? 'customer' : 'common'}.status.${status}`;
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="px-page-head">
      <div>
        {eyebrow && <p className="px-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="px-muted">{description}</p>}
      </div>
      {actions && <div className="px-page-actions">{actions}</div>}
    </div>
  );
}

export function Pagination({ meta, page, onPage }) {
  if (!meta || meta.pages <= 1) return null;
  return (
    <nav className="px-pagination" aria-label={t('common.pagination')}>
      <button type="button" className="px-btn px-btn-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('common.previous')}
      </button>
      <span>{t('common.pageOf', { page, pages: meta.pages, total: meta.total })}</span>
      <button type="button" className="px-btn px-btn-secondary" disabled={page >= meta.pages} onClick={() => onPage(page + 1)}>
        {t('common.next')}
      </button>
    </nav>
  );
}

export const DefinitionList = ({ items }) => (
  <dl className="px-dl">
    {items
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
  </dl>
);
