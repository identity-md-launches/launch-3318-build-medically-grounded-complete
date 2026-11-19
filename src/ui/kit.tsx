// Shared interface components. Pages compose these; they hold no business logic.
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ORDER_STATUS_LABEL, STATUS_TONE } from '../domain/rules';
import type { OrderStatus } from '../domain/types';
import { ActionError } from '../services/actions';
import { update } from '../data/store';

// ---------- Hash router ----------
function getHash() { return window.location.hash.replace(/^#/, '') || '/'; }
function subscribeHash(cb: () => void) { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); }
export function useRoute() { return useSyncExternalStore(subscribeHash, getHash, () => '/'); }
export function navigate(path: string) { window.location.hash = path; }
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/'); const a = path.split('?')[0].split('/');
  if (p.length !== a.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) out[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return out;
}

export function Link({ to, children, className, current }: { to: string; children: ReactNode; className?: string; current?: boolean }) {
  return <a href={`#${to}`} className={className} aria-current={current ? 'page' : undefined}>{children}</a>;
}

// ---------- Toast (polite live region) ----------
let toastMsg = '';
const toastListeners = new Set<() => void>();
export function toast(msg: string) { toastMsg = msg; toastListeners.forEach((l) => l()); }
export function Toaster() {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    let timer: number | undefined;
    const l = () => { setMsg(toastMsg); window.clearTimeout(timer); timer = window.setTimeout(() => setMsg(''), 4000); };
    toastListeners.add(l);
    return () => { toastListeners.delete(l); window.clearTimeout(timer); };
  }, []);
  return <div role="status" aria-live="polite" className={msg ? 'toast' : 'sr-only'}>{msg}</div>;
}

/** Runs a store mutation and returns an error message instead of throwing for ActionErrors. */
export function act(fn: Parameters<typeof update>[0], success?: string): string {
  try {
    update(fn);
    if (success) toast(success);
    return '';
  } catch (e) {
    if (e instanceof ActionError) return e.message;
    throw e;
  }
}

// ---------- Display ----------
export function StatusBadge({ status }: { status: OrderStatus }) {
  const tone = STATUS_TONE[status];
  return <span className={`badge badge-${tone}`} data-status={status}>{ORDER_STATUS_LABEL[status]}</span>;
}
export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'info' | 'warn' | 'good' | 'bad'; children: ReactNode }) {
  return <span className={tone === 'neutral' ? 'badge' : `badge badge-${tone}`}>{children}</span>;
}
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'good'; children: ReactNode }) {
  return <div className={tone === 'info' ? 'notice' : `notice notice-${tone}`} role={tone === 'bad' ? 'alert' : undefined}>{children}</div>;
}
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return <div aria-busy="true" aria-label="Loading">{Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ width: `${90 - i * 15}%` }} />)}</div>;
}
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div className="card stat"><span className="label">{label}</span><span className="value">{value}</span>{hint && <span className="small muted">{hint}</span>}</div>;
}
export const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not set';
export const fmtDay = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set';

// ---------- Fields ----------
interface FieldProps { id: string; label: string; error?: string; hint?: string }
export function TextField({ id, label, error, hint, value, onChange, type = 'text', autoComplete, placeholder, inputMode, required }: FieldProps & {
  value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; placeholder?: string; inputMode?: 'numeric' | 'tel' | 'email' | 'text'; required?: boolean;
}) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      <input id={id} name={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete}
        placeholder={placeholder} inputMode={inputMode} aria-invalid={error ? true : undefined} aria-describedby={describedBy} required={required} />
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="error" id={`${id}-error`}>{error}</span>}
    </div>
  );
}
export function TextArea({ id, label, error, hint, value, onChange, rows = 4 }: FieldProps & { value: string; onChange: (v: string) => void; rows?: number }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} name={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="error" id={`${id}-error`}>{error}</span>}
    </div>
  );
}
export function SelectField({ id, label, error, hint, value, onChange, options }: FieldProps & { value: string; onChange: (v: string) => void; options: { value: string; label: string; disabled?: boolean }[] }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={describedBy}>
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="error" id={`${id}-error`}>{error}</span>}
    </div>
  );
}

/** Moves focus to the first invalid field after a failed submit. */
export function focusFirstError(errors: Record<string, string>) {
  const first = Object.keys(errors)[0];
  if (!first) return;
  requestAnimationFrame(() => (document.getElementById(first) as HTMLElement | null)?.focus());
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#14305a" />
      <path d="M9 22V10l7 7 7-7v12" fill="none" stroke="#5fd0c4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
