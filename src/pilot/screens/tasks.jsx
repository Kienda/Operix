import React, { useState } from 'react';
import { records } from '../api.js';
import { t } from '../i18n.js';
import { date, today } from '../format.js';
import { Dialog, Field, FormError, PageHeader, Pagination, StateView, StatusBadge, useResource, useToast } from '../ui.jsx';
import { can } from '../PilotApp.jsx';
import { PersonSelect, RecordTable, branchName, useDirectory } from './common.jsx';

const OPEN = 'DRAFT,PENDING,IN_PROGRESS';
const SELF_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];
const ALL_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

/** Status change for one task; employees may only report progress on their own work. */
export function TaskStatusControl({ session, task, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editable = can(session, 'tasks.update') && !['CANCELLED'].includes(task.status);
  if (!editable) return <StatusBadge module="tasks" status={task.status} />;
  const options = session.dataScope === 'self' ? SELF_STATUSES : ALL_STATUSES;
  const current = task.status === 'DRAFT' ? 'PENDING' : task.status;
  return (
    <span className="px-inline-status">
      <label className="px-sr" htmlFor={`status-${task.id}`}>
        {t('tasks.statusFor', { name: task.name })}
      </label>
      <select
        id={`status-${task.id}`}
        value={current}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          setError('');
          try {
            await records.update('tasks', task.id, { status: e.target.value });
            toast(t('tasks.updated', { name: task.name }));
            onChanged();
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {t(`task.status.${s}`)}
          </option>
        ))}
      </select>
      {error && (
        <small className="px-field-error" role="alert">
          {error}
        </small>
      )}
    </span>
  );
}

export function TaskForm({ session, project, onClose, onSaved }) {
  const toast = useToast();
  const people = useDirectory(can(session, 'tasks.assign'));
  const [form, setForm] = useState({ name: '', assigneeUserId: null, dueDate: '', priority: 'normal', description: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const saved = await records.create({
        module: 'tasks',
        type: 'task',
        name: form.name.trim(),
        status: 'PENDING',
        data: {
          projectId: project.id,
          priority: form.priority,
          ...(form.assigneeUserId ? { assigneeUserId: form.assigneeUserId } : {}),
          ...(form.dueDate ? { dueDate: form.dueDate } : {}),
          ...(form.description.trim() ? { description: form.description.trim() } : {}),
        },
      });
      toast(t('tasks.created', { number: saved.number }));
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Dialog title={t('tasks.new')} description={t('tasks.newFor', { project: `${project.number} · ${project.name}` })} onClose={onClose}>
      <form className="px-form" onSubmit={submit}>
        <Field label={t('common.name')} required>
          {(p) => <input {...p} data-autofocus required maxLength={200} value={form.name} onChange={set('name')} />}
        </Field>
        {can(session, 'tasks.assign') && (
          <PersonSelect label={t('tasks.assignee')} hint={t('tasks.assigneeHint')} people={people} value={form.assigneeUserId} onChange={set('assigneeUserId')} branchId={project.branchId} />
        )}
        <div className="px-grid-2">
          <Field label={t('tasks.dueDate')}>
            {(p) => <input {...p} type="date" min={today()} value={form.dueDate} onChange={set('dueDate')} />}
          </Field>
          <Field label={t('tasks.priority')}>
            {(p) => (
              <select {...p} value={form.priority} onChange={set('priority')}>
                {['low', 'normal', 'high', 'urgent'].map((x) => (
                  <option key={x} value={x}>
                    {t(`tasks.priority.${x}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label={t('projects.description')}>
          {(p) => <textarea {...p} rows={3} maxLength={4000} value={form.description} onChange={set('description')} />}
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

export default function TaskList({ session, query }) {
  const broad = session.dataScope !== 'self';
  const [view, setView] = useState(query.view === 'all' && broad ? 'all' : 'mine');
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const list = useResource(
    () =>
      records.list('tasks', {
        page,
        limit: 25,
        ...(view === 'mine' ? { assignee: 'me' } : {}),
        status: status === 'open' ? OPEN : status || undefined,
      }),
    [page, view, status],
  );
  return (
    <>
      <PageHeader title={t('tasks.title')} description={broad ? t('tasks.subtitle') : t('tasks.subtitleOwn')} />
      <div className="px-filters">
        {broad && (
          <div className="px-segmented" role="group" aria-label={t('tasks.view')}>
            {['mine', 'all'].map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => { setPage(1); setView(v); }}>
                {t(`tasks.view.${v}`)}
              </button>
            ))}
          </div>
        )}
        <Field label={t('common.status')}>
          {(p) => (
            <select {...p} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
              <option value="open">{t('tasks.filter.open')}</option>
              <option value="COMPLETED">{t('task.status.COMPLETED')}</option>
              <option value="CANCELLED">{t('task.status.CANCELLED')}</option>
              <option value="">{t('common.all')}</option>
            </select>
          )}
        </Field>
      </div>
      <section className="px-card">
        <StateView resource={list} isEmpty={(d) => !d.data.length} empty={<span>{view === 'mine' ? t('tasks.emptyMine') : t('tasks.empty')}</span>}>
          {(data) => (
            <>
              <RecordTable
                caption={t('tasks.title')}
                rows={data.data}
                columns={[
                  {
                    key: 'name',
                    label: t('common.name'),
                    render: (r) => (
                      <span className={query.focus === r.id ? 'px-focus-row' : undefined}>
                        <b>{r.name}</b>
                        <small className="px-cell-sub">{r.number}{r.data.description ? ` · ${r.data.description.slice(0, 80)}` : ''}</small>
                      </span>
                    ),
                  },
                  {
                    key: 'project',
                    label: t('tasks.project'),
                    render: (r) =>
                      data.related.records[r.data.projectId] && can(session, 'projects.view') ? (
                        <a href={`/projects/${r.data.projectId}`}>{data.related.records[r.data.projectId].name}</a>
                      ) : (
                        data.related.records[r.data.projectId]?.name ?? t('tasks.restrictedProject')
                      ),
                  },
                  { key: 'assignee', label: t('tasks.assignee'), render: (r) => data.related.people[r.data.assigneeUserId] ?? t('common.unassigned') },
                  { key: 'due', label: t('tasks.dueDate'), render: (r) => <span className={r.data.dueDate && r.data.dueDate < today() && !['COMPLETED', 'CANCELLED'].includes(r.status) ? 'px-overdue' : undefined}>{date(r.data.dueDate)}{r.data.dueDate && r.data.dueDate < today() && !['COMPLETED', 'CANCELLED'].includes(r.status) ? ` (${t('tasks.overdue')})` : ''}</span> },
                  { key: 'priority', label: t('tasks.priority'), render: (r) => (r.data.priority ? t(`tasks.priority.${r.data.priority}`) : '—') },
                  { key: 'branch', label: t('common.branch'), render: (r) => branchName(session, r.branchId) },
                  { key: 'status', label: t('common.status'), render: (r) => <TaskStatusControl session={session} task={r} onChanged={list.reload} /> },
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
