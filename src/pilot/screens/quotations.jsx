import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Check, Pencil, Plus, Printer, Send, Trash2, X } from 'lucide-react';
import { quotations, records } from '../api.js';
import { navigate } from '../router.js';
import { t } from '../i18n.js';
import { date, money, previewTotals, today } from '../format.js';
import {
  ConfirmDialog,
  DefinitionList,
  Field,
  FormError,
  PageHeader,
  Pagination,
  StateView,
  StatusBadge,
  useResource,
  useToast,
} from '../ui.jsx';
import { can } from '../PilotApp.jsx';
import { RecordTable, branchName } from './common.jsx';

const CURRENCIES = ['USD', 'GNF', 'EUR'];
const STATUSES = [
  ['', 'common.all'],
  ['DRAFT', 'quote.status.DRAFT'],
  ['PENDING', 'quote.status.PENDING'],
  ['APPROVED', 'quote.status.APPROVED'],
  ['CANCELLED', 'quote.status.closed'],
];

export function QuotationList({ session, query }) {
  const [status, setStatus] = useState(query.status ?? '');
  const [page, setPage] = useState(1);
  const list = useResource(() => records.list('quotations', { page, limit: 25, status: status || undefined }), [page, status]);
  return (
    <>
      <PageHeader
        title={t('quotes.title')}
        description={t('quotes.subtitle')}
        actions={
          can(session, 'quotations.create') && (
            <a className="px-btn px-btn-primary" href="#/quotations/new">
              <Plus aria-hidden="true" /> {t('dashboard.newQuotation')}
            </a>
          )
        }
      />
      <div className="px-filters">
        <Field label={t('common.status')}>
          {(p) => (
            <select {...p} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
              {STATUSES.map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <section className="px-card">
        <StateView resource={list} isEmpty={(d) => !d.data.length} empty={<span>{status ? t('common.noMatches') : t('quotes.empty')}</span>}>
          {(data) => (
            <>
              <RecordTable
                caption={t('quotes.title')}
                href={(row) => `#/quotations/${row.id}`}
                rows={data.data}
                columns={[
                  { key: 'number', label: t('quotes.number'), render: (r) => <><b>{r.number}</b><small className="px-cell-sub">{r.name}</small></> },
                  { key: 'customer', label: t('common.customer'), render: (r) => data.related.records[r.data.customerId]?.name ?? '—' },
                  { key: 'total', label: t('quotes.total'), className: 'px-num', render: (r) => money(r.data.total, r.data.currency) },
                  { key: 'valid', label: t('quotes.validUntil'), render: (r) => date(r.data.validUntil) },
                  { key: 'status', label: t('common.status'), render: (r) => <StatusBadge module="quotations" status={r.status} data={r.data} /> },
                ]}
              />
              <Pagination meta={data.meta} page={page} onPage={setPage} />
            </>
          )}
        </StateView>
      </section>
    </>
  );
}

const emptyLine = () => ({ description: '', quantity: '1', unitPrice: '' });

export function QuotationEditor({ session, id, query = {} }) {
  const toast = useToast();
  const existing = useResource(() => (id ? records.get('quotations', id) : Promise.resolve(null)), [id]);
  const customers = useResource(() => records.list('customers', { limit: 100, status: 'ACTIVE,PENDING' }), []);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existing.loading || form) return;
    const q = existing.data;
    setForm(
      q
        ? {
            customerId: q.data.customerId,
            title: q.name,
            currency: q.data.currency,
            taxRate: q.data.taxRate,
            validUntil: q.data.validUntil ?? '',
            notes: q.data.notes ?? '',
            items: q.data.items.map(({ description, quantity, unitPrice }) => ({ description, quantity, unitPrice })),
          }
        : { customerId: query.customerId ?? '', title: '', currency: '', taxRate: '0', validUntil: '', notes: '', items: [emptyLine()] },
    );
  }, [existing.loading]);

  const customerList = customers.data?.data ?? [];
  const customer = customerList.find((c) => c.id === form?.customerId);
  // Default the currency to the customer's branch currency.
  useEffect(() => {
    if (form && customer && !form.currency) {
      const branch = session.branches?.find((b) => b.id === customer.branchId);
      setForm((f) => ({ ...f, currency: branch?.currency ?? session.organization.defaultCurrency }));
    }
  }, [customer?.id, !!form]);

  const preview = useMemo(
    () => (form?.currency ? previewTotals(form.items, form.taxRate, form.currency) : { valid: false, lines: [] }),
    [form],
  );
  if (existing.error || customers.error) return <StateView resource={existing.error ? existing : customers}>{() => null}</StateView>;
  if (!form || customers.loading) return <StateView resource={{ loading: true }}>{() => null}</StateView>;
  if (existing.data && existing.data.status !== 'DRAFT')
    return <FormError>{t('quotes.onlyDraftEditable')}</FormError>;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setLine = (index, key) => (e) =>
    setForm((f) => ({ ...f, items: f.items.map((line, i) => (i === index ? { ...line, [key]: e.target.value } : line)) }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      customerId: form.customerId,
      title: form.title.trim(),
      currency: form.currency,
      taxRate: form.taxRate.trim() || '0',
      ...(form.validUntil ? { validUntil: form.validUntil } : {}),
      notes: form.notes.trim(),
      items: form.items.map((line) => ({
        description: line.description.trim(),
        quantity: line.quantity.trim(),
        unitPrice: line.unitPrice.trim(),
      })),
    };
    try {
      const saved = id ? await quotations.update(id, body) : await quotations.create(body);
      toast(id ? t('quotes.saved') : t('quotes.created', { number: saved.number }));
      navigate(`/quotations/${saved.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  const decimals = form.currency === 'GNF' ? 0 : 2;
  const pricePattern = decimals ? '\\d{1,14}(\\.\\d{1,2})?' : '\\d{1,14}';
  return (
    <>
      <PageHeader
        eyebrow={<a href="#/quotations">{t('quotes.title')}</a>}
        title={id ? t('quotes.editTitle', { number: existing.data.number }) : t('dashboard.newQuotation')}
        description={t('quotes.editorHint')}
      />
      <form className="px-card px-form" onSubmit={submit}>
        <div className="px-grid-2">
          <Field label={t('common.customer')} required hint={customerList.length === 100 ? t('quotes.customerLimitHint') : undefined}>
            {(p) => (
              <select {...p} required value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value, currency: '' }))}>
                <option value="">{t('common.select')}</option>
                {customerList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({branchName(session, c.branchId)})
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('quotes.titleField')} required>
            {(p) => <input {...p} required maxLength={200} value={form.title} onChange={set('title')} />}
          </Field>
          <Field label={t('quotes.currency')} required>
            {(p) => (
              <select {...p} required value={form.currency} onChange={set('currency')}>
                <option value="">{t('common.select')}</option>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('quotes.taxRate')} hint={t('quotes.taxRateHint')}>
            {(p) => <input {...p} inputMode="decimal" pattern="\d{1,3}(\.\d{1,2})?" value={form.taxRate} onChange={set('taxRate')} />}
          </Field>
          <Field label={t('quotes.validUntil')}>
            {(p) => <input {...p} type="date" min={today()} value={form.validUntil} onChange={set('validUntil')} />}
          </Field>
        </div>
        <fieldset className="px-lines">
          <legend>{t('quotes.lines')}</legend>
          {form.items.map((line, index) => (
            <div className="px-line" key={index}>
              <Field label={t('quotes.description')} required>
                {(p) => <input {...p} required maxLength={300} value={line.description} onChange={setLine(index, 'description')} />}
              </Field>
              <Field label={t('quotes.quantity')} required>
                {(p) => <input {...p} required inputMode="decimal" pattern="\d{1,10}(\.\d{1,4})?" value={line.quantity} onChange={setLine(index, 'quantity')} />}
              </Field>
              <Field label={t('quotes.unitPrice', { currency: form.currency || '' })} required>
                {(p) => <input {...p} required inputMode="decimal" pattern={pricePattern} value={line.unitPrice} onChange={setLine(index, 'unitPrice')} />}
              </Field>
              <div className="px-line-total">
                <span>{t('quotes.lineTotal')}</span>
                <b>{preview.lines[index] ? money(preview.lines[index], form.currency) : '—'}</b>
              </div>
              <button
                type="button"
                className="px-icon-btn"
                disabled={form.items.length === 1}
                onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }))}
                aria-label={t('quotes.removeLine', { n: index + 1 })}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          ))}
          <button type="button" className="px-btn px-btn-secondary" disabled={form.items.length >= 100} onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyLine()] }))}>
            <Plus aria-hidden="true" /> {t('quotes.addLine')}
          </button>
        </fieldset>
        <div className="px-totals" aria-live="polite">
          <span>{t('quotes.subtotal')}</span>
          <b>{preview.valid ? money(preview.subtotal, form.currency) : '—'}</b>
          <span>{t('quotes.tax', { rate: form.taxRate || '0' })}</span>
          <b>{preview.valid ? money(preview.tax, form.currency) : '—'}</b>
          <span>{t('quotes.total')}</span>
          <b className="px-total">{preview.valid ? money(preview.total, form.currency) : '—'}</b>
          <small>{t('quotes.previewNote')}</small>
        </div>
        <Field label={t('common.notes')} hint={t('quotes.notesHint')}>
          {(p) => <textarea {...p} rows={3} maxLength={4000} value={form.notes} onChange={set('notes')} />}
        </Field>
        {error && <FormError>{error}</FormError>}
        <div className="px-actions">
          <a className="px-btn px-btn-secondary" href={id ? `#/quotations/${id}` : '#/quotations'}>
            {t('common.cancel')}
          </a>
          <button className="px-btn px-btn-primary" disabled={busy}>
            {t('quotes.saveDraft')}
          </button>
        </div>
      </form>
    </>
  );
}

export function QuotationDetail({ id, session }) {
  const toast = useToast();
  const quote = useResource(() => records.get('quotations', id), [id]);
  const [action, setAction] = useState(null);
  const run = async (name, reason) => {
    await quotations.command(id, name, reason);
    toast(t(`quotes.done.${name}`));
    quote.reload();
  };
  const ACTIONS = {
    send: { icon: Send, permission: 'quotations.send', from: ['DRAFT'], tone: 'primary' },
    accept: { icon: Check, permission: 'quotations.approve', from: ['PENDING'], tone: 'primary', reason: false },
    decline: { icon: X, permission: 'quotations.approve', from: ['PENDING'], reason: true },
    cancel: { icon: Ban, permission: 'quotations.cancel', from: ['DRAFT', 'PENDING'], danger: true, reason: false },
  };
  return (
    <StateView resource={quote}>
      {(q) => {
        const customer = q.related.records[q.data.customerId];
        const available = Object.entries(ACTIONS).filter(([, a]) => a.from.includes(q.status) && can(session, a.permission));
        return (
          <article className="px-quote">
            <PageHeader
              eyebrow={<a href="#/quotations">{t('quotes.title')}</a>}
              title={`${q.number} · ${q.name}`}
              description={<StatusBadge module="quotations" status={q.status} data={q.data} />}
              actions={
                <>
                  <button type="button" className="px-btn px-btn-secondary" onClick={() => window.print()}>
                    <Printer aria-hidden="true" /> {t('quotes.print')}
                  </button>
                  {q.status === 'DRAFT' && can(session, 'quotations.create') && (
                    <a className="px-btn px-btn-secondary" href={`#/quotations/${q.id}/edit`}>
                      <Pencil aria-hidden="true" /> {t('common.edit')}
                    </a>
                  )}
                  {q.status === 'APPROVED' && can(session, 'projects.create') && (
                    <a className="px-btn px-btn-primary" href={`#/projects/new?customerId=${q.data.customerId}&quotationId=${q.id}`}>
                      <Plus aria-hidden="true" /> {t('quotes.createProject')}
                    </a>
                  )}
                  {available.map(([name, a]) => (
                    <button key={name} type="button" className={`px-btn ${a.danger ? 'px-btn-ghost-danger' : a.tone === 'primary' ? 'px-btn-primary' : 'px-btn-secondary'}`} onClick={() => setAction(name)}>
                      <a.icon aria-hidden="true" /> {t(`quotes.action.${name}`)}
                    </button>
                  ))}
                </>
              }
            />
            <div className="px-print-only px-print-head">
              <b>{session.organization.name}</b>
              <span>{branchName(session, q.branchId)}</span>
            </div>
            <div className="px-detail-grid">
              <section className="px-card">
                <h2>{t('quotes.summary')}</h2>
                <DefinitionList
                  items={[
                    [t('common.customer'), customer ? <a href={`#/customers/${q.data.customerId}`}>{customer.name}</a> : t('common.restricted')],
                    [t('common.branch'), branchName(session, q.branchId)],
                    [t('quotes.issued'), date(q.createdAt)],
                    [t('quotes.validUntil'), date(q.data.validUntil)],
                    [t('quotes.sentAt'), q.data.sentAt && date(q.data.sentAt)],
                    [t('quotes.decision'), q.data.outcome && `${t(`quotes.outcome.${q.data.outcome}`)} · ${q.related.people[q.data.decidedBy] ?? ''} · ${date(q.data.decidedAt)}`],
                    [t('quotes.reason'), q.data.outcomeReason],
                    [t('common.createdBy'), q.related.people[q.createdBy]],
                  ]}
                />
                {q.data.notes && <p className="px-notes">{q.data.notes}</p>}
              </section>
              <section className="px-card">
                <h2>{t('quotes.lines')}</h2>
                <div className="px-table-wrap">
                  <table className="px-table">
                    <caption className="px-sr">{t('quotes.lines')}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t('quotes.description')}</th>
                        <th scope="col" className="px-num">{t('quotes.quantity')}</th>
                        <th scope="col" className="px-num">{t('quotes.unitPriceShort')}</th>
                        <th scope="col" className="px-num">{t('quotes.lineTotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.data.items.map((line, index) => (
                        <tr key={index}>
                          <td data-label={t('quotes.description')}>{line.description}</td>
                          <td data-label={t('quotes.quantity')} className="px-num">{line.quantity}</td>
                          <td data-label={t('quotes.unitPriceShort')} className="px-num">{money(line.unitPrice, q.data.currency)}</td>
                          <td data-label={t('quotes.lineTotal')} className="px-num">{money(line.lineTotal, q.data.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-totals">
                  <span>{t('quotes.subtotal')}</span>
                  <b>{money(q.data.subtotal, q.data.currency)}</b>
                  <span>{t('quotes.tax', { rate: q.data.taxRate })}</span>
                  <b>{money(q.data.tax, q.data.currency)}</b>
                  <span>{t('quotes.total')}</span>
                  <b className="px-total">{money(q.data.total, q.data.currency)}</b>
                </div>
              </section>
            </div>
            {action && (
              <ConfirmDialog
                title={t(`quotes.confirm.${action}.title`, { number: q.number })}
                body={t(`quotes.confirm.${action}.body`)}
                confirmLabel={t(`quotes.action.${action}`)}
                danger={!!ACTIONS[action].danger}
                reason={ACTIONS[action].reason === undefined ? undefined : { label: t('quotes.reason'), required: ACTIONS[action].reason }}
                onClose={() => setAction(null)}
                onConfirm={(reason) => run(action, reason)}
              />
            )}
          </article>
        );
      }}
    </StateView>
  );
}
