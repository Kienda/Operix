import React from 'react';
import { ArrowRight, BriefcaseBusiness, FileText, ListTodo, Plus, Users } from 'lucide-react';
import { records, workspace } from '../api.js';
import { t } from '../i18n.js';
import { date } from '../format.js';
import { PageHeader, StateView, StatusBadge, useResource } from '../ui.jsx';
import { can } from '../PilotApp.jsx';

const ICONS = { customers: Users, quotations: FileText, projects: BriefcaseBusiness, tasks: ListTodo };
/** Translated label when the catalog knows the metric; otherwise the server's own label. */
function metricLabel(metric, own) {
  const key = `dashboard.metric.${metric.key}${metric.key === 'tasks' && own ? '.own' : ''}`;
  const text = t(key);
  return text === key ? metric.label : text;
}
const LINKS ={ customers: '/customers', quotations: '/quotations?status=PENDING', projects: '/projects?status=IN_PROGRESS', tasks: '/tasks' };

export default function Dashboard({ session }) {
  const summary = useResource(() => workspace.dashboard(), [session.organization.id]);
  const myTasks = useResource(
    () =>
      can(session, 'tasks.view')
        ? records.list('tasks', { assignee: 'me', status: 'DRAFT,PENDING,IN_PROGRESS', limit: 8 })
        : Promise.resolve(null),
    [session.user.id],
  );
  const quick = [
    can(session, 'customers.create') && ['/customers?new=1', 'dashboard.newCustomer'],
    can(session, 'quotations.create') && ['/quotations/new', 'dashboard.newQuotation'],
    can(session, 'projects.create') && ['/projects/new', 'dashboard.newProject'],
  ].filter(Boolean);
  return (
    <>
      <PageHeader
        eyebrow={session.organization.name}
        title={t('dashboard.welcome', { name: session.user.firstName })}
        description={t('dashboard.subtitle')}
        actions={quick.map(([href, label]) => (
          <a key={href} className="px-btn px-btn-secondary" href={href}>
            <Plus aria-hidden="true" /> {t(label)}
          </a>
        ))}
      />
      <StateView resource={summary}>
        {(data) => (
          <section aria-label={t('dashboard.metrics')} className="px-metrics">
            {data.metrics.map((metric) => {
              const Icon = ICONS[metric.key] ?? ListTodo;
              return (
                <a key={metric.key} className="px-metric" href={LINKS[metric.key] ?? '/dashboard'}>
                  <span className="px-metric-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span>{metricLabel(metric, session.dataScope === 'self')}</span>
                  <strong>{metric.value}</strong>
                </a>
              );
            })}
            {data.metrics.length === 0 && <p className="px-muted">{t('dashboard.noMetrics')}</p>}
          </section>
        )}
      </StateView>
      {can(session, 'tasks.view') && (
        <section className="px-card">
          <div className="px-card-head">
            <h2>{t('dashboard.myTasks')}</h2>
            <a className="px-link" href="/tasks">
              {t('common.viewAll')} <ArrowRight aria-hidden="true" />
            </a>
          </div>
          <StateView resource={myTasks} isEmpty={(d) => !d?.data.length} empty={<span>{t('dashboard.noTasks')}</span>}>
            {(data) => (
              <ul className="px-list">
                {data.data.map((task) => (
                  <li key={task.id}>
                    <a href={`/tasks?focus=${task.id}`}>
                      <b>{task.name}</b>
                      <span>
                        {data.related.records[task.data.projectId]?.name ?? t('tasks.restrictedProject')}
                        {task.data.dueDate ? ` · ${t('tasks.due', { date: date(task.data.dueDate) })}` : ''}
                      </span>
                    </a>
                    <StatusBadge module="tasks" status={task.status} />
                  </li>
                ))}
              </ul>
            )}
          </StateView>
        </section>
      )}
      <p className="px-footnote">{t('dashboard.pilotNote')}</p>
    </>
  );
}
