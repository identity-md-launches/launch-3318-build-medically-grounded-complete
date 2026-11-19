// Platform administration. Only platform_admin users can render any of this; supplier notes,
// variable costs and margins live only here.
import { useState } from 'react';
import {
  ADMIN_TRANSITIONS, AVAILABILITY_LABEL, CATEGORY_LABEL, ORDER_STATUS_LABEL, ROLE_LABEL, TICKET_LABEL, TYPE_LABEL, VERIFICATION_LABEL,
  financials, money, orderCosts, US_STATES,
} from '../domain/rules';
import type { Availability, Db, FinancialAssumptions, Lead, OrderStatus, Pharmacy, User, VerificationStatus } from '../domain/types';
import { update, useSession } from '../data/store';
import * as A from '../services/actions';
import { ADAPTER_REGISTRY, PHARMACY_STATUS_MAP, mockCredentials } from '../integrations/adapters';
import { Badge, Empty, Link, Notice, SelectField, Stat, StatusBadge, TextArea, TextField, act, fmtDate, fmtDay, match, navigate, toast } from '../ui/kit';
import { NoAccess, PageHeader, PortalShell, type NavItem } from '../ui/shell';
import { CostTable, History, Notifications, OrdersTable, TicketThread } from './clinic';

export function AdminApp({ route }: { route: string }) {
  const { db, user } = useSession();
  const path = route.split('?')[0];
  if (user.role !== 'platform_admin') {
    return <PortalShell nav={[]} route={path} title="Platform administration"><NoAccess message={`${ROLE_LABEL[user.role]} accounts cannot open platform administration. Supplier costs, margins and other clinics’ records are restricted to platform administrators.`} /></PortalShell>;
  }
  const pendingApps = db.clinics.filter((c) => ['submitted', 'pending_review', 'information_requested'].includes(c.verification)).length;
  const exceptions = db.orders.filter((o) => o.integrationError || o.cancellationRequested || o.status === 'clarification_required').length;
  const openTickets = db.tickets.filter((t) => t.status === 'open' || t.status === 'awaiting_support').length;
  const nav: NavItem[] = [
    { to: '/admin', label: 'Overview', group: 'Operations' },
    { to: '/admin/orders', label: 'Orders', count: exceptions, group: 'Operations' },
    { to: '/admin/tickets', label: 'Support tickets', count: openTickets, group: 'Operations' },
    { to: '/admin/tasks', label: 'Tasks', group: 'Operations' },
    { to: '/admin/leads', label: 'Leads', group: 'Growth' },
    { to: '/admin/clinics', label: 'Clinics and applications', count: pendingApps, group: 'Growth' },
    { to: '/admin/insights', label: 'Activity insights', group: 'Growth' },
    { to: '/admin/catalog', label: 'Catalog and pricing', group: 'Supply' },
    { to: '/admin/pharmacies', label: 'Pharmacy partners', group: 'Supply' },
    { to: '/admin/integrations', label: 'Integrations', group: 'Supply' },
    { to: '/admin/financials', label: 'Financials', group: 'Records' },
    { to: '/admin/audit', label: 'Audit log', group: 'Records' },
    { to: '/admin/notifications', label: 'Notifications', group: 'Records' },
  ];
  let m: Record<string, string> | null;
  let page: JSX.Element;
  if (path === '/admin') page = <Overview db={db} />;
  else if (path === '/admin/orders') page = <AdminOrders db={db} />;
  else if ((m = match('/admin/orders/:id', path))) page = <AdminOrder db={db} user={user} id={m.id} />;
  else if (path === '/admin/tickets') page = <AdminTickets db={db} />;
  else if ((m = match('/admin/tickets/:id', path))) { const t = db.tickets.find((x) => x.id === m!.id); page = t ? <TicketThread db={db} user={user} t={t} back="/admin/tickets" /> : <Empty title="Ticket not found" />; }
  else if (path === '/admin/tasks') page = <Tasks db={db} user={user} />;
  else if (path === '/admin/leads') page = <Leads db={db} />;
  else if (path === '/admin/clinics') page = <Clinics db={db} />;
  else if ((m = match('/admin/clinics/:id', path))) page = <ClinicDetail db={db} user={user} id={m.id} />;
  else if (path === '/admin/insights') page = <Insights db={db} />;
  else if (path === '/admin/catalog') page = <CatalogAdmin db={db} user={user} />;
  else if (path === '/admin/pharmacies') page = <Pharmacies db={db} user={user} />;
  else if (path === '/admin/integrations') page = <Integrations db={db} />;
  else if (path === '/admin/financials') page = <FinancialsPage db={db} />;
  else if (path === '/admin/audit') page = <Audit db={db} />;
  else if (path === '/admin/notifications') page = <Notifications db={db} clinicId={null} />;
  else page = <Empty title="Page not found" action={<Link to="/admin" className="btn">Go to overview</Link>} />;
  return <PortalShell nav={nav} route={path} title="Platform administration">{page}</PortalShell>;
}

function Overview({ db }: { db: Db }) {
  const f = financials(db, db.assumptions);
  const apps = db.clinics.filter((c) => c.verification !== 'approved' && c.verification !== 'rejected');
  const exceptions = db.orders.filter((o) => o.integrationError || o.cancellationRequested || o.status === 'clarification_required');
  return (
    <>
      <PageHeader title="Overview">Everything here is simulated. Status changes stand in for pharmacy updates.</PageHeader>
      <div className="grid grid-4">
        <Stat label="Clinics approved (demo)" value={db.clinics.filter((c) => c.verification === 'approved').length} />
        <Stat label="Applications to review" value={apps.length} />
        <Stat label="Requests in progress" value={db.orders.filter((o) => !['draft', 'delivered', 'cancelled'].includes(o.status)).length} />
        <Stat label="Platform service revenue" value={money(f.platformRevenue)} hint="Not total order value" />
      </div>
      <div className="grid grid-2">
        <section className="card"><div className="card-head"><h2>Applications</h2><Link to="/admin/clinics">All clinics</Link></div>
          {apps.length === 0 ? <Empty title="No applications waiting" /> : <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{apps.map((c) => <li key={c.id} className="spread"><Link to={`/admin/clinics/${c.id}`}>{c.name}</Link><Badge tone="warn">{VERIFICATION_LABEL[c.verification]}</Badge></li>)}</ul>}
        </section>
        <section className="card"><div className="card-head"><h2>Exceptions and clarifications</h2><Link to="/admin/orders">All orders</Link></div>
          {exceptions.length === 0 ? <Empty title="No exceptions" /> : <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{exceptions.map((o) => <li key={o.id} className="spread"><Link to={`/admin/orders/${o.id}`}><span className="mono">{o.id}</span></Link><span className="small">{o.integrationError ? 'Hand-off failed' : o.cancellationRequested ? 'Cancellation requested' : ORDER_STATUS_LABEL[o.status]}</span></li>)}</ul>}
        </section>
      </div>
    </>
  );
}

function AdminOrders({ db }: { db: Db }) {
  const [status, setStatus] = useState('');
  const [clinic, setClinic] = useState('');
  const [q, setQ] = useState('');
  const [exOnly, setExOnly] = useState(false);
  const rows = db.orders.filter((o) => (!status || o.status === status) && (!clinic || o.clinicId === clinic) && (!q || o.id.toLowerCase().includes(q.toLowerCase().trim()))
    && (!exOnly || o.integrationError || o.cancellationRequested || o.status === 'clarification_required'));
  return (
    <>
      <PageHeader title="Orders">All clinics. Update simulated statuses, clarifications, cancellations and failed hand-offs.</PageHeader>
      <div className="card stack">
        <div className="form-grid">
          <div className="field"><label htmlFor="oq">Order ID</label><input id="oq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="MG-1041" /></div>
          <SelectField id="os" label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'All statuses' }, ...Object.entries(ORDER_STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))]} />
          <SelectField id="oc" label="Clinic" value={clinic} onChange={setClinic} options={[{ value: '', label: 'All clinics' }, ...db.clinics.map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
        <label className="check"><input type="checkbox" checked={exOnly} onChange={(e) => setExOnly(e.target.checked)} /> Exceptions only (failed hand-offs, cancellation requests, clarifications)</label>
        {rows.length === 0 ? <Empty title="No orders match" /> : <OrdersTable db={db} orders={rows} base="/admin/orders" />}
      </div>
    </>
  );
}

function AdminOrder({ db, user, id }: { db: Db; user: User; id: string }) {
  const o = db.orders.find((x) => x.id === id);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [retrying, setRetrying] = useState(false);
  if (!o) return <div className="card"><Empty title="Order not found" action={<Link to="/admin/orders" className="btn">Back to orders</Link>} /></div>;
  const next = ADMIN_TRANSITIONS[o.status] ?? [];
  const clinic = db.clinics.find((c) => c.id === o.clinicId);
  const c = orderCosts(o, db.products, db.assumptions);
  return (
    <>
      <PageHeader title={`Order ${o.id}`}><Link to="/admin/orders">Back to orders</Link> · {clinic?.name}</PageHeader>
      <div className="card row"><StatusBadge status={o.status} />{o.cancellationRequested && <Badge tone="warn">Cancellation requested</Badge>}{o.integrationError && <Badge tone="bad">Hand-off failed</Badge>}</div>
      {err && <Notice tone="bad"><p>{err}</p></Notice>}
      {o.integrationError && (
        <Notice tone="warn"><p>Mock adapter error: {o.integrationError}</p>
          <button className="btn btn-sm" disabled={retrying} onClick={async () => { setRetrying(true); const r = await A.sendToPharmacy(o.id); setRetrying(false); toast(r.ok ? 'Retry succeeded (mock)' : `Retry failed: ${r.error}`); }}>{retrying ? 'Retrying…' : 'Retry hand-off'}</button></Notice>
      )}
      {o.cancellationRequested && (
        <section className="card stack"><h2>Cancellation request</h2>
          <p>{[...o.events].reverse().find((e) => e.kind === 'cancellation_request')?.note}</p>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => setErr(act((d) => A.resolveCancellation(d, user, o.id, true), 'Cancellation approved'))}>Approve cancellation</button>
            <button className="btn" onClick={() => setErr(act((d) => A.resolveCancellation(d, user, o.id, false), 'Cancellation declined'))}>Decline</button>
          </div>
        </section>
      )}
      <section className="card stack" aria-labelledby="su-h">
        <h2 id="su-h">Update simulated status</h2>
        {next.length === 0 ? <p className="muted">{o.status === 'awaiting_clinician' && o.authorizedBy ? `Authorized by ${o.authorizedBy}; waiting for the mock pharmacy hand-off.` : o.status === 'awaiting_clinician' ? 'Waiting on the clinic’s clinician. Administrators cannot authorize on a clinician’s behalf.' : o.status === 'draft' ? 'Drafts belong to the clinic until submitted.' : 'No further status changes from here.'}</p> : (
          <>
            <div className="form-grid">
              <SelectField id="next-status" label="New status" value={to} onChange={setTo} options={[{ value: '', label: 'Choose a status' }, ...next.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] }))]} />
              <TextField id="status-note" label={to === 'clarification_required' ? 'What the clinic must clarify' : 'Note (optional)'} value={note} onChange={setNote} />
            </div>
            <div><button className="btn btn-primary" disabled={!to} onClick={() => { const e = act((d) => A.adminSetStatus(d, user, o.id, to as OrderStatus, note), `${o.id} is now ${ORDER_STATUS_LABEL[to as OrderStatus]}`); setErr(e); if (!e) { setTo(''); setNote(''); } }}>Apply status</button></div>
          </>
        )}
      </section>
      <div className="grid grid-2">
        <section className="card stack"><h2>Items and costs</h2><CostTable db={db} o={o} />
          <dl className="kv small"><dt>Pass-through</dt><dd className="tabular">{money(c.medication + c.pharmacyFees + c.shipping)}</dd><dt>Retained service fee</dt><dd className="tabular">{money(c.platformFee)}</dd></dl>
        </section>
        <section className="card"><h2>History</h2><History o={o} /></section>
      </div>
    </>
  );
}

function AdminTickets({ db }: { db: Db }) {
  const [status, setStatus] = useState('');
  const rows = db.tickets.filter((t) => !status || t.status === status);
  return (
    <>
      <PageHeader title="Support tickets" />
      <div className="card stack">
        <div style={{ maxWidth: 260 }}><SelectField id="ts" label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, ...Object.entries(TICKET_LABEL).map(([v, l]) => ({ value: v, label: l }))]} /></div>
        {rows.length === 0 ? <Empty title="No tickets" /> : (
          <div className="table-wrap"><table className="table-stack"><thead><tr><th>Ticket</th><th>Clinic</th><th>Order</th><th>Status</th><th>Opened</th></tr></thead>
            <tbody>{rows.map((t) => <tr key={t.id}><td data-label="Ticket"><Link to={`/admin/tickets/${t.id}`}>{t.id}: {t.subject}</Link></td><td data-label="Clinic">{db.clinics.find((c) => c.id === t.clinicId)?.name}</td><td data-label="Order">{t.orderId ?? 'None'}</td><td data-label="Status"><Badge tone={t.status === 'resolved' ? 'good' : 'info'}>{TICKET_LABEL[t.status]}</Badge></td><td data-label="Opened">{fmtDay(t.createdAt)}</td></tr>)}</tbody></table></div>
        )}
      </div>
    </>
  );
}

function Tasks({ db, user }: { db: Db; user: User }) {
  const [f, setF] = useState({ title: '', assignee: user.name, due: '2026-11-25', related: '' });
  const [err, setErr] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (f.title.trim().length < 4) { setErr('Give the task a title of at least 4 characters.'); return; }
    setErr('');
    act((d) => { d.tasks.unshift({ id: A.nextId(d, 'K'), title: f.title.trim(), assignee: f.assignee, due: f.due, related: f.related.trim(), status: 'open', notes: [], createdAt: A.now() }); }, 'Task added');
    setF({ ...f, title: '', related: '' });
  };
  return (
    <>
      <PageHeader title="Follow-up tasks">Assignments and notes for the platform team.</PageHeader>
      <form className="card stack" onSubmit={add} noValidate>
        <h2>New task</h2>
        <div className="form-grid">
          <TextField id="title" label="Task" value={f.title} onChange={(v) => setF({ ...f, title: v })} error={err} />
          <SelectField id="assignee" label="Assignee" value={f.assignee} onChange={(v) => setF({ ...f, assignee: v })} options={['Riley Grant', 'Onboarding team', 'Pharmacy liaison', 'Unassigned'].map((v) => ({ value: v, label: v }))} />
          <TextField id="due" label="Due" type="date" value={f.due} onChange={(v) => setF({ ...f, due: v })} />
          <TextField id="related" label="Related record (optional)" value={f.related} onChange={(v) => setF({ ...f, related: v })} placeholder="MG-1039 or clinic ID" />
        </div>
        <div><button className="btn btn-primary" type="submit">Add task</button></div>
      </form>
      <div className="stack">
        {db.tasks.length === 0 && <div className="card"><Empty title="No tasks" /></div>}
        {db.tasks.map((t) => (
          <article className="card stack" key={t.id}>
            <div className="spread"><h3 style={{ margin: 0 }}>{t.title}</h3><Badge tone={t.status === 'done' ? 'good' : 'warn'}>{t.status === 'done' ? 'Done' : 'Open'}</Badge></div>
            <p className="small muted" style={{ margin: 0 }}>{t.assignee} · due {t.due}{t.related && ` · ${t.related}`}</p>
            {t.notes.length > 0 && <ul className="small">{t.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            <div className="row">
              <label className="sr-only" htmlFor={`note-${t.id}`}>Note for {t.title}</label>
              <input id={`note-${t.id}`} style={{ flex: '1 1 200px', width: 'auto' }} value={notes[t.id] ?? ''} onChange={(e) => setNotes({ ...notes, [t.id]: e.target.value })} placeholder="Add a note" />
              <button className="btn btn-sm" onClick={() => { const n = (notes[t.id] ?? '').trim(); if (!n) return; act((d) => { d.tasks.find((x) => x.id === t.id)!.notes.push(n); }); setNotes({ ...notes, [t.id]: '' }); }}>Add note</button>
              <select aria-label={`Reassign ${t.title}`} style={{ width: 'auto' }} value={t.assignee} onChange={(e) => act((d) => { d.tasks.find((x) => x.id === t.id)!.assignee = e.target.value; }, 'Task reassigned')}>
                {['Riley Grant', 'Onboarding team', 'Pharmacy liaison', 'Unassigned'].map((v) => <option key={v}>{v}</option>)}
              </select>
              <button className="btn btn-sm" onClick={() => act((d) => { const x = d.tasks.find((y) => y.id === t.id)!; x.status = x.status === 'done' ? 'open' : 'done'; })}>{t.status === 'done' ? 'Reopen' : 'Mark done'}</button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

const LEAD_STATUSES: Lead['status'][] = ['new', 'contacted', 'qualified', 'converted', 'closed'];

function Leads({ db }: { db: Db }) {
  return (
    <>
      <PageHeader title="Leads">Contact, partnership and access requests from the public site.</PageHeader>
      <div className="card">
        {db.leads.length === 0 ? <Empty title="No leads yet" /> : (
          <div className="table-wrap"><table className="table-stack"><thead><tr><th>Lead</th><th>Type</th><th>Message</th><th>Owner</th><th>Status</th></tr></thead>
            <tbody>{db.leads.map((l) => (
              <tr key={l.id}><td data-label="Lead"><strong>{l.name}</strong><div className="small muted">{l.organization} · {l.email} · {fmtDay(l.createdAt)}</div>{l.clinicId && <Link to={`/admin/clinics/${l.clinicId}`}>Open application</Link>}</td>
                <td data-label="Type">{l.kind.replace('_', ' ')}</td><td data-label="Message">{l.message}</td>
                <td data-label="Owner"><select aria-label={`Owner for ${l.name}`} value={l.owner} onChange={(e) => act((d) => { d.leads.find((x) => x.id === l.id)!.owner = e.target.value; })}>{['Unassigned', 'Riley Grant', 'Onboarding team'].map((v) => <option key={v}>{v}</option>)}</select></td>
                <td data-label="Status"><select aria-label={`Status for ${l.name}`} value={l.status} onChange={(e) => act((d) => { d.leads.find((x) => x.id === l.id)!.status = e.target.value as Lead['status']; }, 'Lead updated')}>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></td></tr>
            ))}</tbody></table></div>
        )}
      </div>
    </>
  );
}

function Clinics({ db }: { db: Db }) {
  return (
    <>
      <PageHeader title="Clinics and applications">Approval here is a demo step. It does not verify any license, NPI or credential.</PageHeader>
      <div className="card table-wrap">
        <table className="table-stack"><thead><tr><th>Clinic</th><th>Type</th><th>Verification</th><th>Users</th><th>Orders</th><th>Applied</th></tr></thead>
          <tbody>{db.clinics.map((c) => (
            <tr key={c.id}><td data-label="Clinic"><Link to={`/admin/clinics/${c.id}`}>{c.name}</Link></td><td data-label="Type">{c.practiceType}</td>
              <td data-label="Verification"><Badge tone={c.verification === 'approved' ? 'good' : c.verification === 'rejected' ? 'bad' : 'warn'}>{VERIFICATION_LABEL[c.verification]}</Badge></td>
              <td data-label="Users">{db.users.filter((u) => u.clinicId === c.id).length}</td><td data-label="Orders">{db.orders.filter((o) => o.clinicId === c.id).length}</td><td data-label="Applied">{fmtDay(c.createdAt)}</td></tr>
          ))}</tbody></table>
      </div>
    </>
  );
}

function ClinicDetail({ db, user, id }: { db: Db; user: User; id: string }) {
  const c = db.clinics.find((x) => x.id === id);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [checking, setChecking] = useState(false);
  if (!c) return <div className="card"><Empty title="Clinic not found" action={<Link to="/admin/clinics" className="btn">Back to clinics</Link>} /></div>;
  const users = db.users.filter((u) => u.clinicId === c.id);
  const clinicians = db.clinicians.filter((x) => x.clinicId === c.id);
  const setV = (s: VerificationStatus) => { const e = act((d) => A.setVerification(d, user, c.id, s, note), `${c.name}: ${VERIFICATION_LABEL[s]}`); setErr(e); if (!e) setNote(''); };
  const adminUser = users.find((u) => u.role === 'clinic_admin');
  return (
    <>
      <PageHeader title={c.name} actions={c.verification === 'approved' && adminUser ? <button className="btn btn-primary" onClick={() => { update((d) => A.switchUser(d, adminUser.id)); navigate('/app'); toast(`Now viewing as ${adminUser.name}, clinic administrator`); }}>Open clinic workspace</button> : undefined}>
        <Link to="/admin/clinics">Back to clinics</Link> · {c.practiceType} · applied {fmtDay(c.createdAt)}
      </PageHeader>
      <section className="card stack" aria-labelledby="ver-h">
        <div className="spread"><h2 id="ver-h" style={{ margin: 0 }}>Verification</h2><Badge tone={c.verification === 'approved' ? 'good' : c.verification === 'rejected' ? 'bad' : 'warn'}>{VERIFICATION_LABEL[c.verification]}</Badge></div>
        <Notice tone="warn"><p>Demo approval does not verify credentials. A production review would use a credential verification service and documented human review.</p></Notice>
        {c.verificationNote && <p className="small">{c.verificationNote}</p>}
        {err && <Notice tone="bad"><p>{err}</p></Notice>}
        <TextArea id="ver-note" label="Note to the clinic" value={note} onChange={setNote} rows={2} hint="Required when requesting information or rejecting." />
        <div className="btn-row">
          {c.verification === 'submitted' && <button className="btn" onClick={() => setV('pending_review')}>Start review</button>}
          <button className="btn" onClick={() => setV('information_requested')}>Request information</button>
          <button className="btn btn-danger" onClick={() => setV('rejected')}>Reject</button>
          {c.verification !== 'approved' && <button className="btn btn-primary" onClick={() => setV('approved')}>Approve clinic (demo)</button>}
        </div>
      </section>
      <div className="grid grid-2">
        <section className="card"><h2>Profile</h2>
          <dl className="kv"><dt>Contact</dt><dd>{c.primaryContact.name}, {c.primaryContact.email}, {c.primaryContact.phone}</dd>
            <dt>Locations</dt><dd>{c.locations.map((l) => `${l.name} (${l.city}, ${l.state})`).join('; ')}</dd>
            <dt>Shipping</dt><dd>{c.shippingPreference === 'ship_to_clinic' ? 'Ship to clinic only' : 'Ship to patient allowed'}</dd>
            <dt>Billing</dt><dd>{c.billingPreference === 'invoice_monthly' ? 'Monthly invoice (demo)' : 'Card on file (demo, none stored)'}</dd></dl>
        </section>
        <section className="card stack"><h2>Clinicians</h2>
          {clinicians.length === 0 ? <Empty title="No clinicians" /> : <ul>{clinicians.map((x) => <li key={x.id}>{x.name}, {x.credential} · NPI <span className="mono">{x.npi}</span> · {x.licenseState} {x.licenseNumber} · {x.credentialCheck === 'mock_checked' ? 'mock check only' : 'not checked'}</li>)}</ul>}
          <div><button className="btn btn-sm" disabled={checking} onClick={async () => { setChecking(true); for (const x of clinicians) await mockCredentials.check(x.npi, x.licenseState); act((d) => { d.clinicians.filter((y) => y.clinicId === c.id).forEach((y) => { y.credentialCheck = 'mock_checked'; }); A.audit(d, user.name, 'credential.mock_check', 'clinic', c.id, 'Mock adapter, no registry queried'); }); setChecking(false); toast('Mock credential check recorded. Nothing was verified.'); }}>{checking ? 'Running mock check…' : 'Run mock credential check'}</button></div>
        </section>
      </div>
      <section className="card stack"><h2>Users and roles</h2>
        <div className="table-wrap"><table className="table-stack"><thead><tr><th>User</th><th>Role</th><th>Active</th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}><td data-label="User">{u.name}<div className="small muted">{u.email}</div></td>
              <td data-label="Role"><select aria-label={`Role for ${u.name}`} value={u.role} disabled={u.role === 'clinician'} onChange={(e) => act((d) => { const x = d.users.find((y) => y.id === u.id)!; x.role = e.target.value as never; A.audit(d, user.name, 'user.role', 'user', u.id, e.target.value); }, 'Role updated')}>
                <option value="clinic_admin">{ROLE_LABEL.clinic_admin}</option><option value="staff">{ROLE_LABEL.staff}</option>{u.role === 'clinician' && <option value="clinician">{ROLE_LABEL.clinician}</option>}</select></td>
              <td data-label="Active"><input type="checkbox" aria-label={`${u.name} active`} checked={u.active} onChange={(e) => act((d) => { d.users.find((y) => y.id === u.id)!.active = e.target.checked; })} /></td></tr>
          ))}</tbody></table></div>
      </section>
    </>
  );
}

function Insights({ db }: { db: Db }) {
  const interest = db.products.map((p) => ({
    p, favorites: Object.values(db.favorites).filter((l) => l.includes(p.id)).length,
    ordered: db.orders.filter((o) => o.status !== 'draft').reduce((s, o) => s + (o.items.find((i) => i.productId === p.id)?.quantity ?? 0), 0),
  })).filter((r) => r.favorites || r.ordered).sort((a, b) => b.ordered + b.favorites - (a.ordered + a.favorites));
  const clinics = db.clinics.map((c) => {
    const os = db.orders.filter((o) => o.clinicId === c.id && o.status !== 'draft' && o.status !== 'cancelled');
    return { c, orders: os.length, reorders: os.filter((o) => o.sourceOrderId).length, last: os.map((o) => o.updatedAt).sort().pop() };
  });
  const repeatClinics = clinics.filter((x) => x.orders >= 2).length;
  return (
    <>
      <PageHeader title="Activity insights">Product interest, clinic activity and repeat ordering from demo records.</PageHeader>
      <div className="grid grid-4">
        <Stat label="Clinics with 2+ requests" value={repeatClinics} />
        <Stat label="Requests started from a previous order" value={db.orders.filter((o) => o.sourceOrderId).length} />
        <Stat label="Saved favorites" value={Object.values(db.favorites).reduce((s, l) => s + l.length, 0)} />
      </div>
      <section className="card"><h2>Product interest</h2>
        {interest.length === 0 ? <Empty title="No product activity yet" /> : <div className="table-wrap"><table className="table-stack"><thead><tr><th>Product</th><th>Category</th><th className="num">Favorites</th><th className="num">Units requested</th></tr></thead>
          <tbody>{interest.map((r) => <tr key={r.p.id}><td data-label="Product">{r.p.name}</td><td data-label="Category">{CATEGORY_LABEL[r.p.category]}</td><td data-label="Favorites" className="num">{r.favorites}</td><td data-label="Units" className="num">{r.ordered}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="card"><h2>Clinic activity</h2>
        <div className="table-wrap"><table className="table-stack"><thead><tr><th>Clinic</th><th className="num">Requests</th><th className="num">From previous order</th><th>Last activity</th></tr></thead>
          <tbody>{clinics.map((r) => <tr key={r.c.id}><td data-label="Clinic">{r.c.name}</td><td data-label="Requests" className="num">{r.orders}</td><td data-label="Reorders" className="num">{r.reorders}</td><td data-label="Last">{fmtDay(r.last)}</td></tr>)}</tbody></table></div>
      </section>
    </>
  );
}

function CatalogAdmin({ db, user }: { db: Db; user: User }) {
  const [edit, setEdit] = useState<string | null>(null);
  const [draft, setDraft] = useState({ unitPrice: '', dispensingFee: '', states: '', availability: 'available' as Availability });
  const [err, setErr] = useState('');
  const open = (id: string) => { const p = db.products.find((x) => x.id === id)!; setEdit(id); setErr(''); setDraft({ unitPrice: String(p.unitPrice), dispensingFee: String(p.dispensingFee), states: p.states.join(', '), availability: p.availability }); };
  const save = () => {
    const price = Number(draft.unitPrice), fee = Number(draft.dispensingFee);
    const states = draft.states.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!(price > 0) || price > 100000) return setErr('Price must be a positive number.');
    if (!(fee >= 0)) return setErr('Fee must be zero or more.');
    const bad = states.filter((s) => !US_STATES.includes(s));
    if (!states.length || bad.length) return setErr(`Use two-letter codes from: ${US_STATES.join(', ')}.${bad.length ? ` Not recognized: ${bad.join(', ')}` : ''}`);
    act((d) => { const p = d.products.find((x) => x.id === edit)!; Object.assign(p, { unitPrice: price, dispensingFee: fee, states, availability: draft.availability }); A.audit(d, user.name, 'product.update', 'product', p.id, `price ${price}, fee ${fee}, ${draft.availability}`); }, 'Product saved. Open drafts reprice at submission.');
    setEdit(null);
  };
  return (
    <>
      <PageHeader title="Catalog and pricing">Eligibility, availability and prices. Changes apply to new submissions; submitted orders keep their prices.</PageHeader>
      <div className="card table-wrap">
        <table className="table-stack"><thead><tr><th>Product</th><th>Type</th><th>Pharmacy ID</th><th>Availability</th><th className="num">Price</th><th className="num">Fee</th><th>States</th><th>Active</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{db.products.map((p) => edit === p.id ? (
            <tr key={p.id}><td colSpan={9}>
              <div className="stack">
                <strong>{p.name}</strong>
                {err && <Notice tone="bad"><p>{err}</p></Notice>}
                <div className="form-grid">
                  <TextField id="e-price" label="Price" value={draft.unitPrice} onChange={(v) => setDraft({ ...draft, unitPrice: v })} inputMode="numeric" />
                  <TextField id="e-fee" label="Pharmacy fee" value={draft.dispensingFee} onChange={(v) => setDraft({ ...draft, dispensingFee: v })} inputMode="numeric" />
                  <SelectField id="e-av" label="Availability" value={draft.availability} onChange={(v) => setDraft({ ...draft, availability: v as Availability })} options={Object.entries(AVAILABILITY_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
                  <TextField id="e-states" label="Eligible states" value={draft.states} onChange={(v) => setDraft({ ...draft, states: v })} hint="Comma-separated codes" />
                </div>
                <p className="small muted">Supplier notes (admin only): {p.supplierNotes}</p>
                <div className="btn-row"><button className="btn btn-primary" onClick={save}>Save product</button><button className="btn" onClick={() => setEdit(null)}>Cancel</button></div>
              </div>
            </td></tr>
          ) : (
            <tr key={p.id}><td data-label="Product">{p.name}<div className="small muted">{CATEGORY_LABEL[p.category]}</div></td><td data-label="Type">{TYPE_LABEL[p.type]}</td><td data-label="Pharmacy ID" className="mono">{p.pharmacyProductId}</td>
              <td data-label="Availability">{AVAILABILITY_LABEL[p.availability]}</td><td data-label="Price" className="num">{money(p.unitPrice)}</td><td data-label="Fee" className="num">{money(p.dispensingFee)}</td>
              <td data-label="States" className="small">{p.states.length === 14 ? 'All demo states' : p.states.join(', ')}</td>
              <td data-label="Active"><input type="checkbox" aria-label={`${p.name} active`} checked={p.active} onChange={(e) => act((d) => { d.products.find((x) => x.id === p.id)!.active = e.target.checked; })} /></td>
              <td><button className="btn btn-sm" onClick={() => open(p.id)}>Edit<span className="sr-only"> {p.name}</span></button></td></tr>
          ))}</tbody></table>
      </div>
    </>
  );
}

const INTEGRATION_LABEL: Record<Pharmacy['integrationStatus'], string> = { mock: 'Mock adapter (simulated)', not_connected: 'Not connected, manual handling', sandbox_planned: 'Sandbox planned', paused: 'Paused' };

function Pharmacies({ db, user }: { db: Db; user: User }) {
  return (
    <>
      <PageHeader title="Pharmacy partners">Fictional records. No pharmacy here is a real partner, and no live connection exists.</PageHeader>
      <div className="grid grid-2">
        {db.pharmacies.map((p) => (
          <article className="card stack" key={p.id}>
            <div className="spread"><h2 style={{ margin: 0 }}>{p.name}</h2><Badge tone={p.integrationStatus === 'mock' ? 'info' : 'warn'}>{INTEGRATION_LABEL[p.integrationStatus]}</Badge></div>
            <dl className="kv"><dt>Kind</dt><dd>{p.kind}</dd><dt>Adapter</dt><dd className="mono">{p.adapter}</dd><dt>Contact</dt><dd>{p.contactEmail}</dd><dt>Products</dt><dd>{db.products.filter((x) => x.pharmacyId === p.id).length}</dd><dt>Notes</dt><dd>{p.notes}</dd></dl>
            <SelectField id={`int-${p.id}`} label="Integration status" value={p.integrationStatus} onChange={(v) => act((d) => { d.pharmacies.find((x) => x.id === p.id)!.integrationStatus = v as never; A.audit(d, user.name, 'pharmacy.integration', 'pharmacy', p.id, v); }, 'Integration status saved')}
              options={Object.entries(INTEGRATION_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </article>
        ))}
      </div>
    </>
  );
}

function Integrations({ db }: { db: Db }) {
  const [payload, setPayload] = useState({ ref: db.orders.find((o) => o.status === 'pharmacy_review')?.id ?? 'MG-1039', status: 'APPROVED' });
  const [result, setResult] = useState('');
  return (
    <>
      <PageHeader title="Integrations">Every adapter below is a mock. None contacts a real system. Live connection points are documented in docs/INTEGRATIONS.md.</PageHeader>
      <div className="card table-wrap">
        <table className="table-stack"><thead><tr><th>Capability</th><th>Current adapter</th><th>Mode</th><th>Production connection point</th></tr></thead>
          <tbody>{ADAPTER_REGISTRY.map((a) => <tr key={a.key}><td data-label="Capability">{a.label}</td><td data-label="Adapter" className="mono">{a.adapter}</td><td data-label="Mode"><Badge tone="info">Mock</Badge></td><td data-label="Live">{a.live}</td></tr>)}</tbody></table>
      </div>
      <div className="grid grid-2">
        <section className="card stack"><h2>Failure simulation</h2>
          <p>When on, the mock order adapter times out. The platform retries twice with backoff, then records an exception for support.</p>
          <label className="check"><input type="checkbox" checked={db.mockFailureMode} onChange={(e) => act((d) => { d.mockFailureMode = e.target.checked; }, e.target.checked ? 'Mock failures on' : 'Mock failures off')} /> Simulate pharmacy endpoint failures</label>
        </section>
        <section className="card stack"><h2>Send a mock status webhook</h2>
          <p className="small muted">Raw pharmacy statuses map onto platform statuses: {Object.entries(PHARMACY_STATUS_MAP).map(([k, v]) => `${k} → ${ORDER_STATUS_LABEL[v]}`).join(', ')}.</p>
          <div className="form-grid">
            <TextField id="wh-ref" label="Order ID" value={payload.ref} onChange={(v) => setPayload({ ...payload, ref: v.trim() })} />
            <TextField id="wh-status" label="Pharmacy status" value={payload.status} onChange={(v) => setPayload({ ...payload, status: v })} />
          </div>
          <div><button className="btn btn-primary" onClick={() => { let r = ''; update((d) => { r = A.applyWebhook(d, payload); }); setResult(r); }}>Send mock webhook</button></div>
          {result && <Notice tone={result.startsWith('Applied') ? 'good' : 'warn'}><p role="status">{result}</p></Notice>}
        </section>
      </div>
      <section className="card"><h2>Request log</h2>
        {db.integrationLog.length === 0 ? <Empty title="No adapter calls yet">Submitting or authorizing an order creates entries here.</Empty> : (
          <div className="table-wrap"><table className="table-stack"><thead><tr><th>When</th><th>Adapter</th><th>Operation</th><th>Outcome</th><th>Detail</th></tr></thead>
            <tbody>{db.integrationLog.slice(0, 50).map((l) => <tr key={l.id}><td data-label="When">{fmtDate(l.at)}</td><td data-label="Adapter" className="mono">{l.adapter}</td><td data-label="Operation">{l.operation}</td><td data-label="Outcome"><Badge tone={l.outcome === 'mock_success' ? 'good' : l.outcome === 'mock_failure' || l.outcome === 'rejected_invalid' ? 'bad' : 'warn'}>{l.outcome.replace('_', ' ')}</Badge></td><td data-label="Detail">{l.detail}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </>
  );
}

const ASSUMPTION_FIELDS: [keyof FinancialAssumptions, string, string][] = [
  ['platformFeePerOrder', 'Platform fee per order', '$'], ['platformFeePct', 'Platform fee, % of medication', '%'], ['paymentProcessingPct', 'Payment processing, % of total', '%'],
  ['supportCostPerOrder', 'Support cost per order', '$'], ['integrationCostPerOrder', 'Integration cost per order', '$'],
  ['shippingAmbient', 'Shipping, standard', '$'], ['shippingColdChain', 'Shipping, cold chain', '$'], ['shippingSignature', 'Shipping, signature', '$'],
];

function FinancialsPage({ db }: { db: Db }) {
  const [a, setA] = useState<Record<string, string>>(Object.fromEntries(Object.entries(db.assumptions).map(([k, v]) => [k, String(v)])));
  const [err, setErr] = useState('');
  const f = financials(db, db.assumptions);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed: Partial<FinancialAssumptions> = {};
    for (const [k, label] of ASSUMPTION_FIELDS) { const n = Number(a[k]); if (!Number.isFinite(n) || n < 0 || n > 10000) { setErr(`${label} must be a number from 0 to 10000.`); return; } parsed[k] = n; }
    setErr('');
    act((d) => { d.assumptions = parsed as FinancialAssumptions; }, 'Assumptions saved; figures recalculated');
  };
  const row = (label: string, v: number, strong = false) => <tr><td>{strong ? <strong>{label}</strong> : label}</td><td className="num">{strong ? <strong>{money(v)}</strong> : money(v)}</td></tr>;
  return (
    <>
      <PageHeader title="Financials">Fictional assumptions and demo orders. Order value is not revenue, and revenue is not profit.</PageHeader>
      <div className="grid grid-4">
        <Stat label="Total order value" value={money(f.totalOrderValue)} hint={`${f.orders} non-draft, non-cancelled requests`} />
        <Stat label="Pass-through to pharmacies" value={money(f.passThrough)} />
        <Stat label="Retained platform revenue" value={money(f.platformRevenue)} />
        <Stat label="Contribution margin" value={money(f.contributionMargin)} hint={`${f.marginOnRevenuePct}% of platform revenue`} />
      </div>
      <div className="grid grid-2">
        <section className="card"><h2>Breakdown</h2>
          <div className="table-wrap"><table><tbody>
            {row('Medication (pass-through)', f.medication)}{row('Pharmacy fees (pass-through)', f.pharmacyFees)}{row('Shipping (pass-through)', f.shipping)}
            {row('Total pass-through', f.passThrough, true)}{row('Platform service fees (retained)', f.platformRevenue, true)}
            {row('Total order value', f.totalOrderValue, true)}
            {row('Payment processing', f.paymentProcessing)}{row('Support', f.support)}{row('Integration', f.integration)}
            {row('Variable costs', f.variableCosts, true)}{row('Contribution margin (revenue minus variable costs)', f.contributionMargin, true)}
          </tbody></table></div>
        </section>
        <form className="card stack" onSubmit={save} noValidate><h2>Assumptions</h2>
          {err && <Notice tone="bad"><p>{err}</p></Notice>}
          <div className="form-grid">{ASSUMPTION_FIELDS.map(([k, label, unit]) => <TextField key={k} id={`as-${k}`} label={`${label} (${unit})`} value={a[k]} onChange={(v) => setA({ ...a, [k]: v })} inputMode="numeric" />)}</div>
          <div><button className="btn btn-primary" type="submit">Recalculate</button></div>
        </form>
      </div>
    </>
  );
}

function Audit({ db }: { db: Db }) {
  return (
    <>
      <PageHeader title="Audit log">Recorded in browser storage for the demo. A production audit log must be append-only and server-side.</PageHeader>
      <div className="card">{db.audit.length === 0 ? <Empty title="No audit records" /> : (
        <div className="table-wrap"><table className="table-stack"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Record</th><th>Detail</th></tr></thead>
          <tbody>{db.audit.slice(0, 100).map((r) => <tr key={r.id}><td data-label="When">{fmtDate(r.at)}</td><td data-label="Actor">{r.actor}</td><td data-label="Action" className="mono">{r.action}</td><td data-label="Record">{r.entity} {r.entityId}</td><td data-label="Detail">{r.detail}</td></tr>)}</tbody></table></div>
      )}</div>
    </>
  );
}
