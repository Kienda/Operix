import React, { useState } from 'react';
import { Archive, Pencil, Plus, Search } from 'lucide-react';
import { records } from '../api.js';
import { navigate } from '../router.js';
import { t } from '../i18n.js';
import { date, money } from '../format.js';
import {
  ConfirmDialog,
  DefinitionList,
  Dialog,
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
import { BranchField, PersonSelect, RecordTable, branchName, defaultBranch, useDirectory } from './common.jsx';

const COUNTRIES = ['GN', 'US', 'SN', 'ML', 'CI', 'SL', 'LR', 'FR', 'CA', 'GB'];
const clean = (data) => Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v !== undefined));

export function CustomerList({ session, query }) {
  const [search, setSearch] = useState(query.q ?? '');
  const [applied, setApplied] = useState(query.q ?? '');
  const [status, setStatus] = useState(query.status ?? '');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(query.new === '1');
  const list = useResource(
    () => records.list('customers', { page, limit: 25, search: applied || undefined, status: status || undefined }),
    [page, applied, status],
  );
  return (
    <>
      <PageHeader
        title={t('customers.title')}
        description={t('customers.subtitle')}
        actions={
          can(session, 'customers.create') && (
            <button type="button" className="px-btn px-btn-primary" onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" /> {t('customers.new')}
            </button>
          )
        }
      />
      <form
        className="px-filters"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setApplied(search.trim());
        }}
      >
        <Field label={t('common.search')}>
          {(p) => <input {...p} type="search" maxLength={100} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('customers.searchHint')} />}
        </Field>
        <Field label={t('common.status')}>
          {(p) => (
            <select {...p} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
              <option value="">{t('common.all')}</option>
              <option value="ACTIVE">{t('customer.status.ACTIVE')}</option>
              <option value="PENDING">{t('customer.status.PENDING')}</option>
            </select>
          )}
        </Field>
        <button className="px-btn px-btn-secondary">
          <Search aria-hidden="true" /> {t('common.search')}
        </button>
      </form>
      <section className="px-card">
        <StateView
          resource={list}
          isEmpty={(d) => !d.data.length}
          empty={<span>{applied || status ? t('common.noMatches') : t('customers.empty')}</span>}
        >
          {(data) => (
            <>
              <RecordTable
                caption={t('customers.title')}
                href={(row) => `#/customers/${row.id}`}
                rows={data.data}
                columns={[
                  { key: 'name', label: t('common.name'), render: (r) => <><b>{r.name}</b><small className="px-cell-sub">{r.number}</small></> },
                  { key: 'contact', label: t('customers.contact'), render: (r) => r.data.contactName || r.data.email || '—' },
                  { key: 'city', label: t('customers.location'), render: (r) => [r.data.city, r.data.country].filter(Boolean).join(', ') || '—' },
                  { key: 'branch', label: t('common.branch'), render: (r) => branchName(session, r.branchId) },
                  { key: 'status', label: t('common.status'), render: (r) => <StatusBadge module="customers" status={r.status} /> },
                ]}
              />
              <Pagination meta={data.meta} page={page} onPage={setPage} />
            </>
          )}
        </StateView>
      </section>
      {creating && (
        <CustomerForm
          session={session}
          onClose={() => setCreating(false)}
          onSaved={(saved) => navigate(`/customers/${saved.id}`)}
        />
      )}
    </>
  );
}

export function CustomerForm({ session, customer, onClose, onSaved }) {
  const toast = useToast();
  const people = useDirectory(can(session, 'customers.update'));
  const financial = can(session, 'customers.view_financials');
  const d = customer?.data ?? {};
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    status: customer?.status ?? 'ACTIVE',
    branchId: customer?.branchId ?? defaultBranch(session),
    kind: d.kind ?? 'company',
    contactName: d.contactName ?? '',
    email: d.email ?? '',
    phone: d.phone ?? '',
    country: d.country ?? (session.branches?.find((b) => b.id === (customer?.branchId ?? defaultBranch(session)))?.country ?? ''),
    city: d.city ?? '',
    address: d.address ?? '',
    notes: d.notes ?? '',
    salespersonUserId: d.salespersonUserId ?? null,
    taxId: d.taxId ?? '',
    paymentTerms: d.paymentTerms ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    // Creating omits blanks; editing sends them so a field can be cleared.
    const data = (customer ? (x) => x : clean)({
      kind: form.kind,
      contactName: form.contactName.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      country: form.country,
      city: form.city.trim(),
      address: form.address.trim(),
      notes: form.notes.trim(),
      ...(financial ? { taxId: form.taxId.trim(), paymentTerms: form.paymentTerms.trim() } : {}),
    });
    if (form.salespersonUserId !== (d.salespersonUserId ?? null)) data.salespersonUserId = form.salespersonUserId;
    try {
      const saved = customer
        ? await records.update('customers', customer.id, {
            name: form.name.trim(),
            ...(form.status !== customer.status ? { status: form.status } : {}),
            data,
          })
        : await records.create({
            module: 'customers',
            type: form.kind,
            name: form.name.trim(),
            status: form.status,
            ...(form.branchId ? { branchId: form.branchId } : {}),
            data,
          });
      toast(customer ? t('customers.saved') : t('customers.created', { number: saved.number }));
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Dialog title={customer ? t('customers.edit') : t('customers.new')} onClose={onClose} wide>
      <form className="px-form" onSubmit={submit}>
        <div className="px-grid-2">
          <Field label={t('common.name')} required>
            {(p) => <input {...p} data-autofocus required maxLength={200} value={form.name} onChange={set('name')} />}
          </Field>
          <Field label={t('customers.kind')}>
            {(p) => (
              <select {...p} value={form.kind} onChange={set('kind')}>
                <option value="company">{t('customers.kind.company')}</option>
                <option value="individual">{t('customers.kind.individual')}</option>
              </select>
            )}
          </Field>
          {!customer && <BranchField session={session} value={form.branchId} onChange={set('branchId')} />}
          <Field label={t('common.status')}>
            {(p) => (
              <select {...p} value={form.status} onChange={set('status')}>
                <option value="ACTIVE">{t('customer.status.ACTIVE')}</option>
                <option value="PENDING">{t('customer.status.PENDING')}</option>
              </select>
            )}
          </Field>
          <Field label={t('customers.contactName')}>
            {(p) => <input {...p} maxLength={120} autoComplete="off" value={form.contactName} onChange={set('contactName')} />}
          </Field>
          <Field label={t('common.email')}>
            {(p) => <input {...p} type="email" maxLength={254} value={form.email} onChange={set('email')} />}
          </Field>
          <Field label={t('common.phone')} hint={t('customers.phoneHint')}>
            {(p) => <input {...p} type="tel" maxLength={40} pattern="[+0-9 ()./-]{4,40}" value={form.phone} onChange={set('phone')} />}
          </Field>
          <Field label={t('customers.country')}>
            {(p) => (
              <select {...p} value={form.country} onChange={set('country')}>
                <option value="">{t('common.select')}</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'region' }).of(c)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('customers.city')}>
            {(p) => <input {...p} maxLength={80} value={form.city} onChange={set('city')} />}
          </Field>
          {can(session, 'customers.update') && (
            <PersonSelect label={t('customers.salesperson')} people={people} value={form.salespersonUserId} onChange={set('salespersonUserId')} branchId={form.branchId} />
          )}
        </div>
        <Field label={t('customers.address')}>
          {(p) => <input {...p} maxLength={300} value={form.address} onChange={set('address')} />}
        </Field>
        {financial && (
          <div className="px-grid-2">
            <Field label={t('customers.taxId')} hint={t('customers.financialHint')}>
              {(p) => <input {...p} maxLength={60} value={form.taxId} onChange={set('taxId')} />}
            </Field>
            <Field label={t('customers.paymentTerms')}>
              {(p) => <input {...p} maxLength={120} value={form.paymentTerms} onChange={set('paymentTerms')} />}
            </Field>
          </div>
        )}
        <Field label={t('common.notes')}>
          {(p) => <textarea {...p} rows={3} maxLength={2000} value={form.notes} onChange={set('notes')} />}
        </Field>
        {error && <FormError>{error}</FormError>}
        <div className="px-actions">
          <button type="button" className="px-btn px-btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="px-btn px-btn-primary" disabled={busy}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function CustomerDetail({ id, session }) {
  const toast = useToast();
  const customer = useResource(() => records.get('customers', id), [id]);
  const quotes = useResource(
    () => (can(session, 'quotations.view') ? records.list('quotations', { customerId: id, limit: 50 }) : Promise.resolve(null)),
    [id],
  );
  const projectList = useResource(
    () => (can(session, 'projects.view') ? records.list('projects', { customerId: id, limit: 50 }) : Promise.resolve(null)),
    [id],
  );
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  return (
    <StateView resource={customer}>
      {(c) => (
        <>
          <PageHeader
            eyebrow={<a href="#/customers">{t('customers.title')}</a>}
            title={c.name}
            description={`${c.number ?? ''} · ${branchName(session, c.branchId)}`}
            actions={
              <>
                {can(session, 'quotations.create') && (
                  <a className="px-btn px-btn-secondary" href={`#/quotations/new?customerId=${c.id}`}>
                    <Plus aria-hidden="true" /> {t('dashboard.newQuotation')}
                  </a>
                )}
                {can(session, 'projects.create') && (
                  <a className="px-btn px-btn-secondary" href={`#/projects/new?customerId=${c.id}`}>
                    <Plus aria-hidden="true" /> {t('dashboard.newProject')}
                  </a>
                )}
                {can(session, 'customers.update') && (
                  <button type="button" className="px-btn px-btn-primary" onClick={() => setEditing(true)}>
                    <Pencil aria-hidden="true" /> {t('common.edit')}
                  </button>
                )}
              </>
            }
          />
          <div className="px-detail-grid">
            <section className="px-card">
              <h2>{t('customers.details')}</h2>
              <DefinitionList
                items={[
                  [t('common.status'), <StatusBadge module="customers" status={c.status} />],
                  [t('customers.kind'), t(`customers.kind.${c.data.kind ?? 'company'}`)],
                  [t('customers.contactName'), c.data.contactName],
                  [t('common.email'), c.data.email && <a href={`mailto:${c.data.email}`}>{c.data.email}</a>],
                  [t('common.phone'), c.data.phone && <a href={`tel:${c.data.phone.replace(/[^+0-9]/g, '')}`}>{c.data.phone}</a>],
                  [t('customers.address'), [c.data.address, c.data.city, c.data.country].filter(Boolean).join(', ')],
                  [t('customers.salesperson'), c.related.people[c.data.salespersonUserId]],
                  [t('customers.taxId'), c.data.taxId],
                  [t('customers.paymentTerms'), c.data.paymentTerms],
                  [t('common.createdBy'), `${c.related.people[c.createdBy] ?? '—'} · ${date(c.createdAt)}`],
                ]}
              />
              {c.data.notes && <p className="px-notes">{c.data.notes}</p>}
              {can(session, 'customers.archive') && (
                <button type="button" className="px-btn px-btn-ghost-danger" onClick={() => setArchiving(true)}>
                  <Archive aria-hidden="true" /> {t('customers.archive')}
                </button>
              )}
            </section>
            <div className="px-stack">
              {can(session, 'quotations.view') && (
                <section className="px-card">
                  <h2>{t('nav.quotations')}</h2>
                  <StateView resource={quotes} isEmpty={(d) => !d.data.length} empty={<span>{t('quotes.noneForCustomer')}</span>}>
                    {(data) => (
                      <ul className="px-list">
                        {data.data.map((q) => (
                          <li key={q.id}>
                            <a href={`#/quotations/${q.id}`}>
                              <b>{q.number} · {q.name}</b>
                              <span>{money(q.data.total, q.data.currency)}</span>
                            </a>
                            <StatusBadge module="quotations" status={q.status} data={q.data} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </StateView>
                </section>
              )}
              {can(session, 'projects.view') && (
                <section className="px-card">
                  <h2>{t('nav.projects')}</h2>
                  <StateView resource={projectList} isEmpty={(d) => !d.data.length} empty={<span>{t('projects.noneForCustomer')}</span>}>
                    {(data) => (
                      <ul className="px-list">
                        {data.data.map((p) => (
                          <li key={p.id}>
                            <a href={`#/projects/${p.id}`}>
                              <b>{p.number} · {p.name}</b>
                              <span>{p.data.dueDate ? t('tasks.due', { date: date(p.data.dueDate) }) : ''}</span>
                            </a>
                            <StatusBadge module="projects" status={p.status} data={p.data} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </StateView>
                </section>
              )}
            </div>
          </div>
          {editing && <CustomerForm session={session} customer={c} onClose={() => setEditing(false)} onSaved={() => customer.reload()} />}
          {archiving && (
            <ConfirmDialog
              title={t('customers.archiveTitle', { name: c.name })}
              body={t('customers.archiveBody')}
              confirmLabel={t('customers.archive')}
              danger
              onClose={() => setArchiving(false)}
              onConfirm={async () => {
                await records.archive('customers', c.id);
                toast(t('customers.archived'));
                navigate('/customers');
              }}
            />
          )}
        </>
      )}
    </StateView>
  );
}
