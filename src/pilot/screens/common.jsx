import React, { useEffect, useState } from 'react';
import { organization } from '../api.js';
import { t } from '../i18n.js';
import { Field } from '../ui.jsx';

/** Active colleagues the caller may assign; empty (not an error) when the caller cannot assign. */
export function useDirectory(enabled = true) {
  const [people, setPeople] = useState([]);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    organization
      .directory()
      .then((list) => live && setPeople(list))
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [enabled]);
  return people;
}

export function BranchField({ session, value, onChange, disabled }) {
  const branches = session.branches ?? [];
  if (branches.length <= 1) return null;
  return (
    <Field label={t('common.branch')} required>
      {(p) => (
        <select {...p} required value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          <option value="">{t('common.select')}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function PersonSelect({ label, people, value, onChange, branchId, hint }) {
  const eligible = people.filter((p) => !branchId || !p.branchIds.length || p.branchIds.includes(branchId));
  return (
    <Field label={label} hint={hint}>
      {(p) => (
        <select {...p} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{t('common.unassigned')}</option>
          {eligible.map((person) => (
            <option key={person.userId} value={person.userId}>
              {person.name}
              {person.role ? ` — ${person.role}` : ''}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export const branchName = (session, id) => session.branches?.find((b) => b.id === id)?.name ?? '—';
export const defaultBranch = (session) => (session.branches?.length === 1 ? session.branches[0].id : '');

/** Semantic table; each row's first cell is a real link so keyboard users can open it. */
export function RecordTable({ caption, columns, rows, href }) {
  return (
    <div className="px-table-wrap">
      <table className="px-table">
        <caption className="px-sr">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.className}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((c, index) => (
                <td key={c.key} className={c.className} data-label={c.label}>
                  {index === 0 && href ? <a href={href(row)}>{c.render(row)}</a> : c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
