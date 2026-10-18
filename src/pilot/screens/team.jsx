import React, { useState } from 'react';
import { MailPlus, Pencil, ShieldAlert, ShieldCheck, UserCheck, UserX, XCircle } from 'lucide-react';
import { organization } from '../api.js';
import { t } from '../i18n.js';
import { date } from '../format.js';
import { ConfirmDialog, Dialog, Field, FormError, Notice, PageHeader, StateView, StatusBadge, useResource, useToast } from '../ui.jsx';

function BranchChoices({ session, value, onChange, allowAll }) {
  const branches = session.branches ?? [];
  return (
    <fieldset className="px-checks">
      <legend>{t('team.branches')}</legend>
      {branches.map((b) => (
        <label key={b.id}>
          <input
            type="checkbox"
            checked={value.includes(b.id)}
            onChange={() => onChange(value.includes(b.id) ? value.filter((x) => x !== b.id) : [...value, b.id])}
          />
          {b.name} <small>({b.currency})</small>
        </label>
      ))}
      <small>{allowAll ? t('team.branchesHintAll') : t('team.branchesHintRequired')}</small>
    </fieldset>
  );
}

function RoleSelect({ roles, value, onChange }) {
  const selected = roles.find((r) => r.id === value);
  return (
    <Field label={t('team.role')} hint={selected?.description} required>
      {(p) => (
        <select {...p} required value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('common.select')}</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

const orgWide = (session) => !session.branchIds?.length;

function InviteDialog({ session, roles, onClose, onDone }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [branchIds, setBranchIds] = useState(session.branches?.length === 1 ? [session.branches[0].id] : []);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const role = roles.find((r) => r.id === roleId);
  const allowAll = orgWide(session) && role?.dataScope !== 'branch';
  const submit = async (event) => {
    event.preventDefault();
    if (!allowAll && !branchIds.length) return setError(t('team.branchRequired'));
    setBusy(true);
    setError('');
    try {
      const res = await organization.invite({ email: email.trim().toLowerCase(), roleId, branchIds });
      setResult(res);
      if (res.delivered) toast(t('team.invited', { email: res.email }));
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={t('team.inviteTitle')} description={t('team.inviteBody')} onClose={onClose}>
      {result ? (
        <div className="px-form">
          {result.delivered ? (
            <Notice tone="success">{t('team.inviteDelivered', { email: result.email, date: date(result.expiresAt) })}</Notice>
          ) : (
            <Notice tone="error">{t('team.inviteNotDelivered', { email: result.email })}</Notice>
          )}
          {result.inviteUrl && (
            <Field label={t('team.devLink')} hint={t('team.devLinkHint')}>
              {(p) => <input {...p} readOnly value={result.inviteUrl} onFocus={(e) => e.target.select()} />}
            </Field>
          )}
          <div className="px-actions">
            <button type="button" className="px-btn px-btn-primary" onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
        </div>
      ) : (
        <form className="px-form" onSubmit={submit}>
          <Field label={t('team.workEmail')} required>
            {(p) => <input {...p} data-autofocus type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <RoleSelect roles={roles} value={roleId} onChange={setRoleId} />
          <BranchChoices session={session} value={branchIds} onChange={setBranchIds} allowAll={allowAll} />
          {error && <FormError>{error}</FormError>}
          <div className="px-actions">
            <button type="button" className="px-btn px-btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="px-btn px-btn-primary" disabled={busy}>
              <MailPlus aria-hidden="true" /> {t('team.sendInvite')}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function AccessDialog({ session, member, roles, onClose, onDone }) {
  const toast = useToast();
  const [roleId, setRoleId] = useState(member.role?.id ?? '');
  const [branchIds, setBranchIds] = useState(member.branchIds);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const role = roles.find((r) => r.id === roleId);
  const allowAll = orgWide(session) && role?.dataScope !== 'branch';
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await organization.updateMember(member.id, { roleId, branchIds });
      toast(t('team.accessUpdated', { name: `${member.user.firstName} ${member.user.lastName}` }));
      onDone();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Dialog title={t('team.changeAccess', { name: `${member.user.firstName} ${member.user.lastName}` })} onClose={onClose}>
      <form className="px-form" onSubmit={submit}>
        <RoleSelect roles={roles.some((r) => r.id === member.role?.id) ? roles : [...roles, member.role].filter(Boolean)} value={roleId} onChange={setRoleId} />
        <BranchChoices session={session} value={branchIds} onChange={setBranchIds} allowAll={allowAll} />
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

export default function Team({ session }) {
  const toast = useToast();
  const members = useResource(() => organization.users(), []);
  const invitations = useResource(() => organization.invitations(), []);
  const roles = useResource(() => organization.assignableRoles(), []);
  const [dialog, setDialog] = useState(null);
  const branchLabel = (ids) =>
    ids.length ? ids.map((id) => session.branches?.find((b) => b.id === id)?.name ?? t('common.restricted')).join(', ') : t('team.allBranches');
  const reload = () => {
    members.reload();
    invitations.reload();
  };
  return (
    <>
      <PageHeader
        title={t('team.title')}
        description={t('team.subtitle')}
        actions={
          <button type="button" className="px-btn px-btn-primary" disabled={!roles.data?.length} onClick={() => setDialog({ type: 'invite' })}>
            <MailPlus aria-hidden="true" /> {t('team.invite')}
          </button>
        }
      />
      <section className="px-card">
        <h2>{t('team.members')}</h2>
        <StateView resource={members} isEmpty={(d) => !d.length} empty={<span>{t('team.noMembers')}</span>}>
          {(list) => (
            <div className="px-table-wrap">
              <table className="px-table">
                <caption className="px-sr">{t('team.members')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('common.name')}</th>
                    <th scope="col">{t('team.role')}</th>
                    <th scope="col">{t('team.branches')}</th>
                    <th scope="col">{t('team.mfa')}</th>
                    <th scope="col">{t('team.lastSignIn')}</th>
                    <th scope="col">{t('common.status')}</th>
                    <th scope="col"><span className="px-sr">{t('common.actions')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((m) => {
                    const self = m.user.id === session.user.id;
                    return (
                      <tr key={m.id}>
                        <td data-label={t('common.name')}>
                          <b>{m.user.firstName} {m.user.lastName}</b>
                          <small className="px-cell-sub">{m.user.email}</small>
                        </td>
                        <td data-label={t('team.role')}>{m.role?.name ?? t('common.noRole')}{m.isOwner ? ` · ${t('team.owner')}` : ''}</td>
                        <td data-label={t('team.branches')}>{branchLabel(m.branchIds)}</td>
                        <td data-label={t('team.mfa')}>
                          {m.user.mfaEnabled ? (
                            <span className="px-badge px-badge-green"><ShieldCheck aria-hidden="true" /> {t('team.mfaOn')}</span>
                          ) : (
                            <span className="px-badge px-badge-amber"><ShieldAlert aria-hidden="true" /> {t('team.mfaOff')}</span>
                          )}
                        </td>
                        <td data-label={t('team.lastSignIn')}>{m.user.lastLoginAt ? date(m.user.lastLoginAt) : t('team.never')}</td>
                        <td data-label={t('common.status')}>
                          <StatusBadge module="members" status={m.status} />
                        </td>
                        <td className="px-row-actions">
                          {!self && !m.isOwner && (
                            <>
                              <button type="button" className="px-icon-btn" onClick={() => setDialog({ type: 'access', member: m })} aria-label={t('team.changeAccess', { name: m.user.firstName })}>
                                <Pencil aria-hidden="true" />
                              </button>
                              {m.status === 'ACTIVE' ? (
                                <button type="button" className="px-icon-btn px-danger" onClick={() => setDialog({ type: 'suspend', member: m })} aria-label={t('team.suspend', { name: m.user.firstName })}>
                                  <UserX aria-hidden="true" />
                                </button>
                              ) : (
                                <button type="button" className="px-icon-btn" onClick={() => setDialog({ type: 'reactivate', member: m })} aria-label={t('team.reactivate', { name: m.user.firstName })}>
                                  <UserCheck aria-hidden="true" />
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </StateView>
      </section>
      <section className="px-card">
        <h2>{t('team.pendingInvites')}</h2>
        <StateView resource={invitations} isEmpty={(d) => !d.length} empty={<span>{t('team.noInvites')}</span>}>
          {(list) => (
            <ul className="px-list">
              {list.map((inv) => (
                <li key={inv.id}>
                  <div>
                    <b>{inv.email}</b>
                    <span>
                      {inv.role?.name} · {branchLabel(inv.branchIds)} ·{' '}
                      {inv.expired ? <strong className="px-overdue">{t('team.expired')}</strong> : t('team.expires', { date: date(inv.expiresAt) })}
                    </span>
                  </div>
                  <button type="button" className="px-btn px-btn-ghost-danger" onClick={() => setDialog({ type: 'revoke', invitation: inv })}>
                    <XCircle aria-hidden="true" /> {t('team.revoke')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </StateView>
      </section>
      {dialog?.type === 'invite' && <InviteDialog session={session} roles={roles.data ?? []} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog?.type === 'access' && <AccessDialog session={session} member={dialog.member} roles={roles.data ?? []} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog?.type === 'suspend' && (
        <ConfirmDialog
          title={t('team.suspendTitle', { name: `${dialog.member.user.firstName} ${dialog.member.user.lastName}` })}
          body={t('team.suspendBody')}
          confirmLabel={t('team.suspendAction')}
          danger
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await organization.suspend(dialog.member.id);
            toast(t('team.suspended'));
            reload();
          }}
        />
      )}
      {dialog?.type === 'reactivate' && (
        <ConfirmDialog
          title={t('team.reactivateTitle', { name: `${dialog.member.user.firstName} ${dialog.member.user.lastName}` })}
          body={t('team.reactivateBody')}
          confirmLabel={t('team.reactivateAction')}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await organization.reactivate(dialog.member.id);
            toast(t('team.reactivated'));
            reload();
          }}
        />
      )}
      {dialog?.type === 'revoke' && (
        <ConfirmDialog
          title={t('team.revokeTitle', { email: dialog.invitation.email })}
          body={t('team.revokeBody')}
          confirmLabel={t('team.revoke')}
          danger
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await organization.revokeInvitation(dialog.invitation.id);
            toast(t('team.revoked'));
            invitations.reload();
          }}
        />
      )}
    </>
  );
}
