import React, { useEffect, useState } from 'react';
import { CheckCircle2, Pause, Pencil, Play, Plus, XCircle } from 'lucide-react';
import { projects, records } from '../api.js';
import { navigate } from '../router.js';
import { t } from '../i18n.js';
import { currencyDigits, date, money } from '../format.js';
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
import { BranchField, PersonSelect, RecordTable, branchName, defaultBranch, useDirectory } from './common.jsx';
import { TaskForm, TaskStatusControl } from './tasks.jsx';

const STATUS_FILTERS = [
  ['', 'common.all'],
  ['DRAFT', 'project.status.DRAFT'],
  ['IN_PROGRESS', 'project.status.IN_PROGRESS'],
  ['PENDING', 'project.status.ON_HOLD'],
  ['COMPLETED', 'project.status.COMPLETED'],
  ['CANCELLED', 'project.status.CANCELLED'],
];

export function ProjectList({ session, query }) {
  const [status, setStatus] = useState(query.status ?? '');
  const [page, setPage] = useState(1);
  const list = useResource(() => records.list('projects', { page, limit: 25, status: status || undefined }), [page, status]);
  return (
    <>
      <PageHeader
        title={t('projects.title')}
        description={t('projects.subtitle')}
        actions={
          can(session, 'projects.create') && (
            <a className="px-btn px-btn-primary" href="/projects/new">
              <Plus aria-hidden="true" /> {t('dashboard.newProject')}
            </a>
          )
        }
      />
      <div className="px-filters">
        <Field label={t('common.status')}>
          {(p) => (
            <select {...p} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
              {STATUS_FILTERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <section className="px-card">
        <StateView resource={list} isEmpty={(d) => !d.data.length} empty={<span>{status ? t('common.noMatches') : t('projects.empty')}</span>}>
          {(data) => (
            <>
              <RecordTable
                caption={t('projects.title')}
                href={(row) => `/projects/${row.id}`}
                rows={data.data}
                columns={[
                  { key: 'name', label: t('common.name'), render: (r) => <><b>{r.name}</b><small className="px-cell-sub">{r.number}</small></> },
                  { key: 'customer', label: t('common.customer'), render: (r) => data.related.records[r.data.customerId]?.name ?? (r.data.customerId ? t('common.restricted') : t('projects.internal')) },
                  { key: 'pm', label: t('projects.manager'), render: (r) => data.related.people[r.data.projectManagerUserId] ?? '—' },
                  { key: 'due', label: t('projects.dueDate'), render: (r) => date(r.data.dueDate) },
                  { key: 'branch', label: t('common.branch'), render: (r) => branchName(session, r.branchId) },
                  { key: 'status', label: t('common.status'), render: (r) => <StatusBadge module="projects" status={r.status} data={r.data} /> },
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

export function ProjectEditor({ session, id, query = {} }) {
  const toast = useToast();
  const existing = useResource(() => (id ? records.get('projects', id) : Promise.resolve(null)), [id]);
  const customers = useResource(() => records.list('customers', { limit: 100 }), []);
  const people = useDirectory(true);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const budgetVisible = can(session, 'projects.view_budget');
  const quotes = useResource(
    () =>
      form?.customerId && can(session, 'quotations.view')
        ? records.list('quotations', { customerId: form.customerId, status: 'APPROVED', limit: 50 })
        : Promise.resolve({ data: [] }),
    [form?.customerId],
  );

  useEffect(() => {
    if (existing.loading || form) return;
    const p = existing.data;
    const d = p?.data ?? {};
    setForm({
      name: p?.name ?? '',
      customerId: d.customerId ?? query.customerId ?? '',
      quotationId: d.quotationId ?? query.quotationId ?? '',
      branchId: p?.branchId ?? defaultBranch(session),
      projectManagerUserId: d.projectManagerUserId ?? (can(session, 'projects.manage_members') ? null : session.user.id),
      memberUserIds: d.memberUserIds ?? [],
      serviceType: d.serviceType ?? '',
      startDate: d.startDate ?? '',
      dueDate: d.dueDate ?? '',
      description: d.description ?? '',
      budgetAmount: d.budget?.amount ?? '',
      budgetCurrency: d.budget?.currency ?? '',
    });
  }, [existing.loading]);

  if (existing.error) return <StateView resource={existing}>{() => null}</StateView>;
  if (!form || customers.loading) return <StateView resource={{ loading: true }}>{() => null}</StateView>;

  const customerList = customers.data?.data ?? [];
  const customer = customerList.find((c) => c.id === form.customerId);
  const branchId = customer?.branchId ?? form.branchId;
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));
  const toggleMember = (userId) =>
    setForm((f) => ({
      ...f,
      memberUserIds: f.memberUserIds.includes(userId) ? f.memberUserIds.filter((x) => x !== userId) : [...f.memberUserIds, userId],
    }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = {
      ...(form.customerId ? { customerId: form.customerId } : id ? { customerId: null } : {}),
      ...(form.quotationId ? { quotationId: form.quotationId } : id ? { quotationId: null } : {}),
      projectManagerUserId: form.projectManagerUserId || null,
      memberUserIds: form.memberUserIds,
      serviceType: form.serviceType.trim(),
      description: form.description.trim(),
      ...(form.startDate ? { startDate: form.startDate } : id ? { startDate: null } : {}),
      ...(form.dueDate ? { dueDate: form.dueDate } : id ? { dueDate: null } : {}),
    };
    if (budgetVisible)
      data.budget = form.budgetAmount ? { amount: form.budgetAmount.trim(), currency: form.budgetCurrency } : null;
    if (!id) Object.keys(data).forEach((key) => (data[key] === null || data[key] === '') && delete data[key]);
    try {
      const saved = id
        ? await records.update('projects', id, { name: form.name.trim(), data })
        : await records.create({
            module: 'projects',
            type: 'project',
            name: form.name.trim(),
            ...(customer ? {} : form.branchId ? { branchId: form.branchId } : {}),
            data,
          });
      toast(id ? t('projects.saved') : t('projects.created', { number: saved.number }));
      navigate(`/projects/${saved.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  const branchCurrency = session.branches?.find((b) => b.id === branchId)?.currency;
  return (
    <>
      <PageHeader
        eyebrow={<a href="/projects">{t('projects.title')}</a>}
        title={id ? t('projects.editTitle', { number: existing.data.number }) : t('dashboard.newProject')}
      />
      <form className="px-card px-form" onSubmit={submit}>
        <div className="px-grid-2">
          <Field label={t('common.name')} required>
            {(p) => <input {...p} data-autofocus required maxLength={200} value={form.name} onChange={set('name')} />}
          </Field>
          <Field label={t('common.customer')} hint={t('projects.customerHint')}>
            {(p) => (
              <select {...p} value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value, quotationId: '' }))}>
                <option value="">{t('projects.internal')}</option>
                {customerList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({branchName(session, c.branchId)})
                  </option>
                ))}
              </select>
            )}
          </Field>
          {!form.customerId && !id && <BranchField session={session} value={form.branchId} onChange={set('branchId')} />}
          {can(session, 'quotations.view') && form.customerId && (
            <Field label={t('projects.quotation')}>
              {(p) => (
                <select {...p} value={form.quotationId} onChange={set('quotationId')}>
                  <option value="">{t('common.none')}</option>
                  {(quotes.data?.data ?? []).map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.number} · {q.name} · {money(q.data.total, q.data.currency)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <Field label={t('projects.serviceType')} hint={t('projects.serviceTypeHint')}>
            {(p) => <input {...p} maxLength={80} value={form.serviceType} onChange={set('serviceType')} />}
          </Field>
          {can(session, 'projects.manage_members') ? (
            <PersonSelect label={t('projects.manager')} people={people} value={form.projectManagerUserId} onChange={set('projectManagerUserId')} branchId={branchId} />
          ) : null}
          <Field label={t('projects.startDate')}>
            {(p) => <input {...p} type="date" value={form.startDate} onChange={set('startDate')} />}
          </Field>
          <Field label={t('projects.dueDate')}>
            {(p) => <input {...p} type="date" min={form.startDate || undefined} value={form.dueDate} onChange={set('dueDate')} />}
          </Field>
          {budgetVisible && (
            <>
              <Field label={t('projects.budget')} hint={t('projects.budgetHint')}>
                {(p) => (
                  <input
                    {...p}
                    inputMode="decimal"
                    pattern={currencyDigits(form.budgetCurrency || branchCurrency) ? '\\d{1,14}(\\.\\d{1,2})?' : '\\d{1,14}'}
                    value={form.budgetAmount}
                    onChange={(e) => setForm((f) => ({ ...f, budgetAmount: e.target.value, budgetCurrency: f.budgetCurrency || branchCurrency || 'USD' }))}
                  />
                )}
              </Field>
              <Field label={t('quotes.currency')}>
                {(p) => (
                  <select {...p} value={form.budgetCurrency || branchCurrency || 'USD'} onChange={set('budgetCurrency')}>
                    {['USD', 'GNF', 'EUR'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                )}
              </Field>
            </>
          )}
        </div>
        {can(session, 'projects.manage_members') && people.length > 0 && (
          <fieldset className="px-checks">
            <legend>{t('projects.members')}</legend>
            {people
              .filter((person) => !branchId || !person.branchIds.length || person.branchIds.includes(branchId))
              .map((person) => (
                <label key={person.userId}>
                  <input type="checkbox" checked={form.memberUserIds.includes(person.userId)} onChange={() => toggleMember(person.userId)} />
                  {person.name}
                  {person.role ? <small> — {person.role}</small> : null}
                </label>
              ))}
          </fieldset>
        )}
        <Field label={t('projects.description')}>
          {(p) => <textarea {...p} rows={4} maxLength={4000} value={form.description} onChange={set('description')} />}
        </Field>
        {error && <FormError>{error}</FormError>}
        <div className="px-actions">
          <a className="px-btn px-btn-secondary" href={id ? `/projects/${id}` : '/projects'}>
            {t('common.cancel')}
          </a>
          <button className="px-btn px-btn-primary" disabled={busy}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </>
  );
}

const COMMANDS = {
  start: { icon: Play, from: (p) => ['DRAFT', 'APPROVED'].includes(p.status) || (p.status === 'PENDING' && !p.data.holdReason), tone: 'primary' },
  hold: { icon: Pause, from: (p) => p.status === 'IN_PROGRESS', reason: true },
  resume: { icon: Play, from: (p) => p.status === 'PENDING' && !!p.data.holdReason, tone: 'primary' },
  complete: { icon: CheckCircle2, from: (p) => p.status === 'IN_PROGRESS', tone: 'primary' },
  cancel: { icon: XCircle, from: (p) => ['DRAFT', 'PENDING', 'IN_PROGRESS'].includes(p.status), reason: true, danger: true },
};

export function ProjectDetail({ id, session }) {
  const toast = useToast();
  const project = useResource(() => records.get('projects', id), [id]);
  const tasks = useResource(
    () => (can(session, 'tasks.view') ? records.list('tasks', { projectId: id, limit: 100 }) : Promise.resolve({ data: [], related: { people: {} } })),
    [id],
  );
  const [command, setCommand] = useState(null);
  const [addingTask, setAddingTask] = useState(false);
  return (
    <StateView resource={project}>
      {(p) => {
        const actions = can(session, 'projects.change_status') ? Object.entries(COMMANDS).filter(([, c]) => c.from(p)) : [];
        const editable = can(session, 'projects.update') && !['COMPLETED', 'CANCELLED'].includes(p.status);
        return (
          <>
            <PageHeader
              eyebrow={<a href="/projects">{t('projects.title')}</a>}
              title={`${p.number} · ${p.name}`}
              description={<StatusBadge module="projects" status={p.status} data={p.data} />}
              actions={
                <>
                  {editable && (
                    <a className="px-btn px-btn-secondary" href={`/projects/${p.id}/edit`}>
                      <Pencil aria-hidden="true" /> {t('common.edit')}
                    </a>
                  )}
                  {actions.map(([name, c]) => (
                    <button key={name} type="button" className={`px-btn ${c.danger ? 'px-btn-ghost-danger' : c.tone === 'primary' ? 'px-btn-primary' : 'px-btn-secondary'}`} onClick={() => setCommand(name)}>
                      <c.icon aria-hidden="true" /> {t(`projects.action.${name}`)}
                    </button>
                  ))}
                </>
              }
            />
            {p.status === 'PENDING' && p.data.holdReason && (
              <div className="px-alert px-alert-warning" role="status">
                {t('projects.onHoldBecause', { reason: p.data.holdReason })}
              </div>
            )}
            <div className="px-detail-grid">
              <section className="px-card">
                <h2>{t('projects.details')}</h2>
                <DefinitionList
                  items={[
                    [t('common.customer'), p.data.customerId ? (p.related.records[p.data.customerId] ? <a href={`/customers/${p.data.customerId}`}>{p.related.records[p.data.customerId].name}</a> : t('common.restricted')) : t('projects.internal')],
                    [t('projects.quotation'), p.data.quotationId && (p.related.records[p.data.quotationId] ? <a href={`/quotations/${p.data.quotationId}`}>{p.related.records[p.data.quotationId].number}</a> : t('common.restricted'))],
                    [t('common.branch'), branchName(session, p.branchId)],
                    [t('projects.manager'), p.related.people[p.data.projectManagerUserId]],
                    [t('projects.members'), (p.data.memberUserIds ?? []).map((u) => p.related.people[u]).filter(Boolean).join(', ')],
                    [t('projects.serviceType'), p.data.serviceType],
                    [t('projects.startDate'), p.data.startDate && date(p.data.startDate)],
                    [t('projects.dueDate'), p.data.dueDate && date(p.data.dueDate)],
                    [t('projects.budget'), p.data.budget && money(p.data.budget.amount, p.data.budget.currency)],
                    [t('projects.cancelReason'), p.data.cancelReason],
                  ]}
                />
                {p.data.description && <p className="px-notes">{p.data.description}</p>}
              </section>
              {can(session, 'tasks.view') && (
                <section className="px-card">
                  <div className="px-card-head">
                    <h2>{t('nav.tasks')}</h2>
                    {can(session, 'tasks.create') && !['COMPLETED', 'CANCELLED'].includes(p.status) && (
                      <button type="button" className="px-btn px-btn-secondary" onClick={() => setAddingTask(true)}>
                        <Plus aria-hidden="true" /> {t('tasks.new')}
                      </button>
                    )}
                  </div>
                  <StateView resource={tasks} isEmpty={(d) => !d.data.length} empty={<span>{t('tasks.noneForProject')}</span>}>
                    {(data) => (
                      <ul className="px-list">
                        {data.data.map((task) => (
                          <li key={task.id}>
                            <div>
                              <b>{task.name}</b>
                              <span>
                                {data.related.people[task.data.assigneeUserId] ?? t('common.unassigned')}
                                {task.data.dueDate ? ` · ${t('tasks.due', { date: date(task.data.dueDate) })}` : ''}
                                {task.data.priority ? ` · ${t(`tasks.priority.${task.data.priority}`)}` : ''}
                              </span>
                            </div>
                            <TaskStatusControl session={session} task={task} onChanged={tasks.reload} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </StateView>
                </section>
              )}
            </div>
            {command && (
              <ConfirmDialog
                title={t(`projects.confirm.${command}`, { number: p.number })}
                body={t(`projects.confirmBody.${command}`)}
                confirmLabel={t(`projects.action.${command}`)}
                danger={!!COMMANDS[command].danger}
                reason={COMMANDS[command].reason ? { label: t('quotes.reason'), required: true } : undefined}
                onClose={() => setCommand(null)}
                onConfirm={async (reason) => {
                  await projects.command(p.id, command, reason ? { reason } : {});
                  toast(t(`projects.done.${command}`));
                  project.reload();
                }}
              />
            )}
            {addingTask && (
              <TaskForm session={session} project={p} onClose={() => setAddingTask(false)} onSaved={() => tasks.reload()} />
            )}
          </>
        );
      }}
    </StateView>
  );
}
