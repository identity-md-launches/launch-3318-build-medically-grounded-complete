// Clinic workspace: dashboard, catalog, orders, support, account. Every query is scoped to the user's clinic.
import { useMemo, useState } from 'react';
import {
  AVAILABILITY_LABEL, CANCELLABLE, CATEGORY_LABEL, ORDER_STATUS_HELP, ORDER_STATUS_LABEL, PATHWAY_LABEL, ROLE_LABEL, SHIPPING_LABEL, TICKET_LABEL, TYPE_LABEL,
  VERIFICATION_LABEL, canAuthorize, money, orderCosts, pathwaysForItems, scopeToClinic, validateOrderForSubmit, type Errors,
} from '../domain/rules';
import type { Category, Db, Order, OrderStatus, Pathway, Product, ProductType, Ticket, User } from '../domain/types';
import { getDb, update, useSession } from '../data/store';
import * as A from '../services/actions';
import { Badge, Empty, Link, Notice, SelectField, Skeleton, Stat, StatusBadge, TextArea, TextField, act, fmtDate, fmtDay, focusFirstError, match, navigate, toast } from '../ui/kit';
import { NoAccess, PageHeader, PortalShell, type NavItem } from '../ui/shell';

export function ClinicApp({ route }: { route: string }) {
  const { db, user, clinic } = useSession();
  if (user.role === 'platform_admin' || !clinic) {
    return <PortalShell nav={[]} route={route} title="Clinic workspace"><NoAccess message="Platform administrators use the administration workspace. Switch to a clinic user to see the clinic view." /><div><Link to="/admin" className="btn btn-primary">Open administration</Link></div></PortalShell>;
  }
  const orders = scopeToClinic(user, db.orders);
  const attention = orders.filter((o) => ['awaiting_clinician', 'clarification_required'].includes(o.status) || o.status === 'draft').length;
  const tickets = scopeToClinic(user, db.tickets).filter((t) => t.status === 'awaiting_clinic').length;
  const nav: NavItem[] = [
    { to: '/app', label: 'Dashboard' },
    { to: '/app/catalog', label: 'Catalog' },
    { to: '/app/orders', label: 'Orders', count: attention },
    { to: '/app/support', label: 'Support', count: tickets },
    { to: '/app/notifications', label: 'Notifications' },
    { to: '/app/account', label: 'Clinic account' },
  ];
  const path = route.split('?')[0];
  let page: JSX.Element;
  let m: Record<string, string> | null;
  if (path === '/app') page = <Dashboard db={db} user={user} />;
  else if (path === '/app/catalog') page = <Catalog db={db} user={user} />;
  else if ((m = match('/app/catalog/:id', path))) page = <ProductDetail db={db} user={user} id={m.id} />;
  else if (path === '/app/compare') page = <Compare db={db} ids={(new URLSearchParams(route.split('?')[1]).get('ids') ?? '').split(',').filter(Boolean)} />;
  else if (path === '/app/orders') page = <Orders db={db} user={user} />;
  else if ((m = match('/app/orders/:id', path))) page = <OrderPage db={db} user={user} id={m.id} />;
  else if (path === '/app/support') page = <Support db={db} user={user} prefillOrder={new URLSearchParams(route.split('?')[1]).get('order') ?? ''} />;
  else if ((m = match('/app/support/:id', path))) page = <TicketPage db={db} user={user} id={m.id} />;
  else if (path === '/app/notifications') page = <Notifications db={db} clinicId={user.clinicId} />;
  else if (path === '/app/account') page = <Account db={db} user={user} />;
  else page = <Empty title="Page not found" action={<Link to="/app" className="btn">Go to dashboard</Link>} />;
  return <PortalShell nav={nav} route={path} title={clinic.name}>{page}</PortalShell>;
}

const clinicOf = (db: Db, user: User) => db.clinics.find((c) => c.id === user.clinicId)!;

function startDraft(user: User) {
  let id = '';
  const err = act((d) => { id = A.createDraft(d, user, user.clinicId!).id; });
  if (err) toast(err); else navigate(`/app/orders/${id}`);
}

function Dashboard({ db, user }: { db: Db; user: User }) {
  const clinic = clinicOf(db, user);
  const orders = scopeToClinic(user, db.orders);
  const open = orders.filter((o) => !['draft', 'delivered', 'cancelled'].includes(o.status));
  const attention = orders.filter((o) => o.status === 'clarification_required' || (o.status === 'awaiting_clinician') || o.cancellationRequested);
  const favorites = (db.favorites[user.id] ?? []).map((id) => db.products.find((p) => p.id === id)).filter(Boolean) as Product[];
  const tickets = scopeToClinic(user, db.tickets).filter((t) => t.status !== 'resolved');
  const recent = orders.flatMap((o) => o.events.map((e) => ({ ...e, orderId: o.id }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  const approved = clinic.verification === 'approved';
  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(',')[0]}`} actions={approved && user.permissions.createDrafts ? <button className="btn btn-primary" onClick={() => startDraft(user)}>New order request</button> : undefined}>
        {ROLE_LABEL[user.role]} at {clinic.name}
      </PageHeader>
      {!approved && <Notice tone="warn"><p><strong>Application status: {VERIFICATION_LABEL[clinic.verification]}.</strong> Ordering opens once platform administration approves the clinic. {clinic.verificationNote}</p></Notice>}
      <div className="grid grid-4">
        <Stat label="Open requests" value={open.length} />
        <Stat label="Needs attention" value={attention.length} />
        <Stat label="Drafts" value={orders.filter((o) => o.status === 'draft').length} />
        <Stat label="Delivered" value={orders.filter((o) => o.status === 'delivered').length} />
      </div>
      <div className="grid grid-2">
        <section className="card" aria-labelledby="att-h">
          <div className="card-head"><h2 id="att-h">Items needing attention</h2></div>
          {attention.length === 0 ? <Empty title="Nothing needs you right now">Clarifications and authorizations will show here.</Empty> : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {attention.map((o) => (
                <li key={o.id} className="spread"><div><Link to={`/app/orders/${o.id}`}><span className="mono">{o.id}</span></Link><div className="small muted">{o.cancellationRequested ? 'Cancellation request pending' : ORDER_STATUS_HELP[o.status]}</div></div><StatusBadge status={o.status} /></li>
              ))}
            </ul>
          )}
        </section>
        <section className="card" aria-labelledby="act-h">
          <div className="card-head"><h2 id="act-h">Recent activity</h2><Link to="/app/orders">All orders</Link></div>
          {recent.length === 0 ? <Empty title="No activity yet">Your first order request will start the timeline.</Empty> : (
            <ol className="timeline">{recent.map((e) => <li key={e.orderId + e.id}><div className="small muted">{fmtDate(e.at)} · <span className="mono">{e.orderId}</span></div><div>{e.status ? <strong>{ORDER_STATUS_LABEL[e.status]}: </strong> : null}{e.note}</div></li>)}</ol>
          )}
        </section>
        <section className="card" aria-labelledby="fav-h">
          <div className="card-head"><h2 id="fav-h">Favorites</h2><Link to="/app/catalog">Browse catalog</Link></div>
          {favorites.length === 0 ? <Empty title="No favorites saved">Save products from the catalog to reach them quickly.</Empty> : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{favorites.map((p) => <li key={p.id} className="spread"><Link to={`/app/catalog/${p.id}`}>{p.name}</Link><span className="small muted">{p.strength} · {p.form}</span></li>)}</ul>
          )}
        </section>
        <section className="card" aria-labelledby="sup-h">
          <div className="card-head"><h2 id="sup-h">Support requests</h2><Link to="/app/support">Open support</Link></div>
          {tickets.length === 0 ? <Empty title="No open tickets">Ask about an order or your account from Support.</Empty> : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{tickets.map((t) => <li key={t.id} className="spread"><Link to={`/app/support/${t.id}`}>{t.id}: {t.subject}</Link><Badge tone={t.status === 'awaiting_clinic' ? 'warn' : 'info'}>{TICKET_LABEL[t.status]}</Badge></li>)}</ul>
          )}
        </section>
      </div>
      <section className="card" aria-labelledby="qa-h">
        <h2 id="qa-h">Quick actions</h2>
        <div className="btn-row">
          <Link to="/app/catalog" className="btn">Search catalog</Link>
          <Link to="/app/orders?status=draft" className="btn">Continue a draft</Link>
          <Link to="/app/support" className="btn">Ask support</Link>
          <Link to="/app/account" className="btn">Onboarding checklist</Link>
        </div>
      </section>
    </>
  );
}

function Catalog({ db, user }: { db: Db; user: User }) {
  const clinic = clinicOf(db, user);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | ''>('');
  const [type, setType] = useState<ProductType | ''>('');
  const [stateF, setStateF] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const favs = db.favorites[user.id] ?? [];
  const rows = db.products.filter((p) => p.active)
    .filter((p) => !q || `${p.name} ${p.form} ${p.strength} ${p.pharmacyProductId} ${CATEGORY_LABEL[p.category]}`.toLowerCase().includes(q.toLowerCase().trim()))
    .filter((p) => !cat || p.category === cat).filter((p) => !type || p.type === type)
    .filter((p) => !stateF || p.states.includes(stateF)).filter((p) => !onlyFav || favs.includes(p.id));
  const toggleCompare = (id: string) => setCompare((c) => c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? c : [...c, id]);
  const pharmacy = (id: string) => db.pharmacies.find((p) => p.id === id)?.name ?? id;
  return (
    <>
      <PageHeader title="Catalog">Fictional demo products. Listings describe products only and are not clinical guidance.</PageHeader>
      <section className="card stack" aria-label="Search and filters">
        <div className="form-grid">
          <div className="field"><label htmlFor="q">Search products</label><input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, form, strength or product ID" /></div>
          <SelectField id="f-type" label="Product type" value={type} onChange={(v) => setType(v as ProductType)} options={[{ value: '', label: 'All types' }, ...Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))]} />
          <SelectField id="f-state" label="Eligible to ship to" value={stateF} onChange={setStateF} options={[{ value: '', label: 'Any state' }, ...[...new Set(clinic.locations.map((l) => l.state))].map((s) => ({ value: s, label: `${s} (your location)` }))]} />
        </div>
        <div className="chips" role="group" aria-label="Category">
          <button className="chip" aria-pressed={cat === ''} onClick={() => setCat('')}>All categories</button>
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(cat === c ? '' : c)}>{CATEGORY_LABEL[c]}</button>)}
        </div>
        <div className="spread">
          <label className="check"><input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} /> Favorites only</label>
          <span className="small muted" aria-live="polite">{rows.length} product{rows.length === 1 ? '' : 's'}</span>
        </div>
      </section>
      {compare.length > 0 && (
        <div className="notice spread" role="region" aria-label="Comparison tray">
          <span>{compare.length} of 3 selected to compare</span>
          <div className="btn-row"><button className="btn btn-sm" onClick={() => setCompare([])}>Clear</button><Link to={`/app/compare?ids=${compare.join(',')}`} className="btn btn-sm btn-primary">Compare products</Link></div>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="card"><Empty title="No products match these filters" action={<button className="btn" onClick={() => { setQ(''); setCat(''); setType(''); setStateF(''); setOnlyFav(false); }}>Clear all filters</button>}>Try a broader search or another category.</Empty></div>
      ) : (
        <div className="grid grid-3">
          {rows.map((p) => {
            const fav = favs.includes(p.id);
            return (
              <article className="card product-card" key={p.id} data-testid="product-card">
                <div className="spread"><Badge tone={p.availability === 'available' ? 'good' : p.availability === 'discontinued' ? 'bad' : 'warn'}>{AVAILABILITY_LABEL[p.availability]}</Badge><span className="small muted">{CATEGORY_LABEL[p.category]}</span></div>
                <h3><Link to={`/app/catalog/${p.id}`}>{p.name}</Link></h3>
                <dl className="meta">
                  <dt>Type</dt><dd>{TYPE_LABEL[p.type]}</dd>
                  <dt>Form</dt><dd>{p.form}, {p.strength}</dd>
                  <dt>Package</dt><dd>{p.packageSize}</dd>
                  <dt>Pharmacy</dt><dd>{pharmacy(p.pharmacyId)}</dd>
                  <dt>Price</dt><dd className="tabular">{money(p.unitPrice)} + {money(p.dispensingFee)} fee</dd>
                </dl>
                <div className="btn-row" style={{ marginTop: 'auto' }}>
                  <button className="btn btn-sm" aria-pressed={fav} onClick={() => { update((d) => A.toggleFavorite(d, user, p.id)); toast(fav ? 'Removed from favorites' : 'Saved to favorites'); }}>
                    {fav ? 'Saved to favorites' : 'Save to favorites'}<span className="sr-only">: {p.name}</span>
                  </button>
                  <label className="check small"><input type="checkbox" checked={compare.includes(p.id)} disabled={!compare.includes(p.id) && compare.length >= 3} onChange={() => toggleCompare(p.id)} /> Compare</label>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function ProductFacts({ db, p }: { db: Db; p: Product }) {
  return (
    <dl className="kv">
      <dt>Category</dt><dd>{CATEGORY_LABEL[p.category]}</dd>
      <dt>Product type</dt><dd>{TYPE_LABEL[p.type]}</dd>
      <dt>Form</dt><dd>{p.form}</dd>
      <dt>Strength</dt><dd>{p.strength}</dd>
      <dt>Package size</dt><dd>{p.packageSize}</dd>
      <dt>Pharmacy</dt><dd>{db.pharmacies.find((x) => x.id === p.pharmacyId)?.name}</dd>
      <dt>Pharmacy product ID</dt><dd className="mono">{p.pharmacyProductId}</dd>
      <dt>Fulfillment pathways</dt><dd>{p.pathways.map((x) => PATHWAY_LABEL[x]).join('; ')}</dd>
      <dt>State eligibility</dt><dd>{p.states.join(', ')}</dd>
      <dt>Availability</dt><dd>{AVAILABILITY_LABEL[p.availability]}</dd>
      <dt>Shipping</dt><dd>{SHIPPING_LABEL[p.shipping]}</dd>
      <dt>Price</dt><dd className="tabular">{money(p.unitPrice)} per package</dd>
      <dt>Pharmacy fee</dt><dd className="tabular">{money(p.dispensingFee)} per package</dd>
    </dl>
  );
}

function ProductDetail({ db, user, id }: { db: Db; user: User; id: string }) {
  const p = db.products.find((x) => x.id === id && x.active);
  if (!p) return <Empty title="Product not found" action={<Link to="/app/catalog" className="btn">Back to catalog</Link>} />;
  const fav = (db.favorites[user.id] ?? []).includes(p.id);
  return (
    <>
      <PageHeader title={p.name} actions={<button className="btn" aria-pressed={fav} onClick={() => update((d) => A.toggleFavorite(d, user, p.id))}>{fav ? 'Saved to favorites' : 'Save to favorites'}</button>}>
        <Link to="/app/catalog">Back to catalog</Link>
      </PageHeader>
      <div className="grid grid-2">
        <section className="card"><h2>Product details</h2><ProductFacts db={db} p={p} /></section>
        <section className="card stack">
          <h2>Supporting documents</h2>
          <ul>{p.documents.map((d) => <li key={d.title}>{d.title} <span className="small muted">({d.kind}, not a real file)</span></li>)}</ul>
          <Notice><p>Demo listing. No clinical claims are made, and the pharmacy is fictional.</p></Notice>
        </section>
      </div>
    </>
  );
}

function Compare({ db, ids }: { db: Db; ids: string[] }) {
  const ps = ids.map((id) => db.products.find((p) => p.id === id)).filter(Boolean) as Product[];
  if (ps.length < 2) return <><PageHeader title="Compare products" /><div className="card"><Empty title="Pick at least two products" action={<Link to="/app/catalog" className="btn">Choose in catalog</Link>}>Tick Compare on two or three catalog cards.</Empty></div></>;
  const rows: [string, (p: Product) => string][] = [
    ['Type', (p) => TYPE_LABEL[p.type]], ['Form', (p) => p.form], ['Strength', (p) => p.strength], ['Package', (p) => p.packageSize],
    ['Pharmacy product ID', (p) => p.pharmacyProductId], ['Availability', (p) => AVAILABILITY_LABEL[p.availability]], ['Shipping', (p) => SHIPPING_LABEL[p.shipping]],
    ['Eligible states', (p) => p.states.join(', ')], ['Price', (p) => money(p.unitPrice)], ['Pharmacy fee', (p) => money(p.dispensingFee)],
  ];
  return (
    <>
      <PageHeader title="Compare products"><Link to="/app/catalog">Back to catalog</Link></PageHeader>
      <div className="card table-wrap">
        <table>
          <thead><tr><th scope="col">Field</th>{ps.map((p) => <th scope="col" key={p.id}>{p.name}</th>)}</tr></thead>
          <tbody>{rows.map(([label, f]) => <tr key={label}><th scope="row">{label}</th>{ps.map((p) => <td key={p.id}>{f(p)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

function OrdersTable({ db, orders, base }: { db: Db; orders: Order[]; base: string }) {
  return (
    <div className="table-wrap">
      <table className="table-stack">
        <thead><tr><th>Order</th>{base === '/admin/orders' && <th>Clinic</th>}<th>Status</th><th>Items</th><th>Pathway</th><th>Updated</th><th className="num">Est. total</th></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} data-order={o.id}>
              <td data-label="Order"><Link to={`${base}/${o.id}`}><span className="mono">{o.id}</span></Link>{o.sourceOrderId && <div className="small muted">from {o.sourceOrderId}</div>}</td>
              {base === '/admin/orders' && <td data-label="Clinic">{db.clinics.find((c) => c.id === o.clinicId)?.name}</td>}
              <td data-label="Status"><StatusBadge status={o.status} />{o.cancellationRequested && <div className="small muted">Cancellation requested</div>}{o.integrationError && <div className="small" style={{ color: 'var(--color-bad-text)' }}>Hand-off failed</div>}</td>
              <td data-label="Items">{o.items.length}</td>
              <td data-label="Pathway">{o.pathway ? PATHWAY_LABEL[o.pathway] : 'Not chosen'}</td>
              <td data-label="Updated">{fmtDate(o.updatedAt)}</td>
              <td data-label="Est. total" className="num">{money(orderCosts(o, db.products, db.assumptions).total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export { OrdersTable };

function Orders({ db, user }: { db: Db; user: User }) {
  const initial = new URLSearchParams(window.location.hash.split('?')[1]).get('status') ?? '';
  const [status, setStatus] = useState(initial);
  const all = scopeToClinic(user, db.orders);
  const rows = all.filter((o) => !status || o.status === status);
  const approved = clinicOf(db, user).verification === 'approved';
  return (
    <>
      <PageHeader title="Orders" actions={approved && user.permissions.createDrafts ? <button className="btn btn-primary" onClick={() => startDraft(user)}>New order request</button> : undefined}>
        Requests are not prescriptions. Nothing is charged or shipped in this demo.
      </PageHeader>
      <div className="card stack">
        <div style={{ maxWidth: 280 }}><SelectField id="status-filter" label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'All statuses' }, ...Object.entries(ORDER_STATUS_LABEL).map(([v, l]) => ({ value: v, label: `${l} (${all.filter((o) => o.status === v).length})` }))]} /></div>
        {rows.length === 0 ? <Empty title={status ? `No ${ORDER_STATUS_LABEL[status as OrderStatus]} orders` : 'No orders yet'} action={approved ? <button className="btn" onClick={() => startDraft(user)}>Start an order request</button> : undefined}>Order requests you create appear here with their status history.</Empty>
          : <OrdersTable db={db} orders={rows} base="/app/orders" />}
      </div>
    </>
  );
}

function OrderPage({ db, user, id }: { db: Db; user: User; id: string }) {
  const o = scopeToClinic(user, db.orders).find((x) => x.id === id);
  if (!o) return <div className="card"><Empty title="Order not found" action={<Link to="/app/orders" className="btn">Back to orders</Link>}>It may belong to another clinic, or the ID is wrong.</Empty></div>;
  return o.status === 'draft' ? <OrderBuilder db={db} user={user} o={o} /> : <OrderDetail db={db} user={user} o={o} />;
}

const STEPS = ['Location', 'Products', 'Pathway', 'Reference', 'Review'];

function OrderBuilder({ db, user, o }: { db: Db; user: User; o: Order }) {
  const clinic = clinicOf(db, user);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const loc = clinic.locations.find((l) => l.id === o.locationId);
  const save = (patch: Parameters<typeof A.updateDraft>[3]) => { const e = act((d) => A.updateDraft(d, user, o.id, patch)); if (e) toast(e); };
  const costs = orderCosts(o, db.products, db.assumptions);
  const allowedPathways = pathwaysForItems(o.items, db.products);
  const products = db.products.filter((p) => p.active && p.availability !== 'discontinued' && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const setQty = (pid: string, qty: number) => {
    const p = db.products.find((x) => x.id === pid)!;
    const items = o.items.filter((i) => i.productId !== pid);
    if (qty > 0) items.push({ productId: pid, quantity: qty, unitPrice: p.unitPrice, dispensingFee: p.dispensingFee });
    save({ items, pathway: o.pathway && pathwaysForItems(items, db.products).includes(o.pathway) ? o.pathway : null });
  };
  const stepErrors = (s: number): Errors => {
    const all = validateOrderForSubmit(o, db.products, loc?.state ?? '');
    const keys = [['locationId'], ['items'], ['pathway'], ['patientRef', 'poNumber'], []][s];
    return Object.fromEntries(Object.entries(all).filter(([k]) => keys.includes(k)));
  };
  const next = () => { const e = stepErrors(step); setErrors(e); if (Object.keys(e).length) focusFirstError(e); else setStep(step + 1); };
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    let res: ReturnType<typeof A.submitOrder> = { errors: {} };
    const err = act((d) => { res = A.submitOrder(d, user, o.id); });
    if (err) { toast(err); setBusy(false); return; }
    if (Object.keys(res.errors).length) { setErrors(res.errors); setBusy(false); return; }
    if (res.needsSend) await A.sendToPharmacy(o.id);
    setBusy(false);
    const final = getDb().orders.find((x) => x.id === o.id)!;
    toast(`Request ${o.id} submitted. Status: ${ORDER_STATUS_LABEL[final.status]}`);
    navigate(`/app/orders/${o.id}`);
  };
  if (!user.permissions.createDrafts) return <NoAccess message="Your role cannot edit drafts." />;
  return (
    <>
      <PageHeader title={`Order request ${o.id}`} actions={<button className="btn btn-danger" onClick={() => { if (window.confirm('Discard this draft?')) { act((d) => A.requestCancellation(d, user, o.id, 'discard'), 'Draft discarded'); navigate('/app/orders'); } }}>Discard draft</button>}>
        Draft saved automatically. {o.sourceOrderId && `Created from ${o.sourceOrderId}; prices refreshed and fresh review required.`}
      </PageHeader>
      <ol className="stepper" aria-label="Order steps">
        {STEPS.map((s, i) => <li key={s} aria-current={i === step ? 'step' : undefined} className={i < step ? 'done' : undefined}>{i + 1}. {s}</li>)}
      </ol>
      {Object.keys(errors).length > 0 && <Notice tone="bad">{Object.values(errors).map((e) => <p key={e}>{e}</p>)}</Notice>}
      <section className="card stack" aria-labelledby="step-h">
        <h2 id="step-h">{STEPS[step]}</h2>
        {step === 0 && (
          <SelectField id="locationId" label="Ship-to location" value={o.locationId} onChange={(v) => save({ locationId: v })} error={errors.locationId}
            hint="Product eligibility is checked against this location’s state."
            options={clinic.locations.map((l) => ({ value: l.id, label: `${l.name} (${l.city}, ${l.state})` }))} />
        )}
        {step === 1 && (
          <>
            <div className="field"><label htmlFor="pq">Find products</label><input id="pq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" /></div>
            <div className="table-wrap">
              <table className="table-stack">
                <thead><tr><th>Product</th><th>Type</th><th>Eligible for {loc?.state}</th><th className="num">Price</th><th>Quantity</th></tr></thead>
                <tbody>
                  {products.map((p) => {
                    const eligible = !!loc && p.states.includes(loc.state);
                    const qty = o.items.find((i) => i.productId === p.id)?.quantity ?? 0;
                    return (
                      <tr key={p.id}>
                        <td data-label="Product">{p.name}<div className="small muted">{p.form}, {p.strength} · {AVAILABILITY_LABEL[p.availability]}</div></td>
                        <td data-label="Type">{TYPE_LABEL[p.type]}</td>
                        <td data-label="Eligible">{eligible ? 'Yes' : <span style={{ color: 'var(--color-bad-text)' }}>No</span>}</td>
                        <td data-label="Price" className="num">{money(p.unitPrice)}</td>
                        <td data-label="Quantity">
                          <label className="sr-only" htmlFor={`qty-${p.id}`}>Quantity of {p.name}</label>
                          <input id={`qty-${p.id}`} type="number" min={0} max={50} step={1} inputMode="numeric" style={{ width: 88 }} value={qty} disabled={!eligible && qty === 0}
                            onChange={(e) => setQty(p.id, Math.max(0, Math.min(50, Math.floor(Number(e.target.value) || 0))))} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {products.length === 0 && <Empty title="No products match">Clear the search to see the full catalog.</Empty>}
            <p className="small muted" id="items" tabIndex={-1}>{o.items.length} product{o.items.length === 1 ? '' : 's'} selected. Ineligible products cannot be added.</p>
          </>
        )}
        {step === 2 && (
          <fieldset>
            <legend className="sr-only">Fulfillment pathway</legend>
            <div className="stack" id="pathway" tabIndex={-1}>
              {(Object.keys(PATHWAY_LABEL) as Pathway[]).map((pw) => {
                const ok = allowedPathways.includes(pw) && !(pw === 'ps_patient' && clinic.shippingPreference === 'ship_to_clinic');
                return (
                  <label className="check" key={pw}>
                    <input type="radio" name="pathway" value={pw} checked={o.pathway === pw} disabled={!ok} onChange={() => save({ pathway: pw })} />
                    <span>{PATHWAY_LABEL[pw]}{!ok && <span className="small muted"> (not available for the selected products or clinic preferences)</span>}</span>
                  </label>
                );
              })}
            </div>
            {allowedPathways.length === 0 && <Notice tone="warn"><p>The selected products have no pathway in common. Split them into separate requests.</p></Notice>}
          </fieldset>
        )}
        {step === 3 && (
          <div className="form-grid">
            {o.pathway?.startsWith('ps_') && (
              <TextField id="patientRef" label="Fictional patient reference" value={o.patientRef} onChange={(v) => save({ patientRef: v.toUpperCase() })} error={errors.patientRef}
                hint="Must start with DEMO-, for example DEMO-PT1042. Never enter a real name, date of birth or record number." />
            )}
            <TextField id="poNumber" label="Clinic PO number (optional)" value={o.poNumber} onChange={(v) => save({ poNumber: v })} error={errors.poNumber} />
            <TextArea id="pharmacyNotes" label="Notes for the pharmacy (optional)" value={o.pharmacyNotes} onChange={(v) => save({ pharmacyNotes: v })} hint="Logistics only. No clinical or patient details." />
          </div>
        )}
        {step === 4 && (
          <div className="stack">
            <dl className="kv">
              <dt>Ship to</dt><dd>{loc ? `${loc.name}, ${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}` : 'Not chosen'}</dd>
              <dt>Pathway</dt><dd>{o.pathway ? PATHWAY_LABEL[o.pathway] : 'Not chosen'}</dd>
              {o.patientRef && <><dt>Patient reference</dt><dd className="mono">{o.patientRef}</dd></>}
              {o.poNumber && <><dt>PO number</dt><dd>{o.poNumber}</dd></>}
            </dl>
            <CostTable db={db} o={o} />
            <Notice tone="warn"><p>This is a simulated request. It is not a valid prescription, nothing is charged and no pharmacy receives it.
              {canAuthorize(user) ? ' Because you are a clinician, submitting also records your authorization.' : ' After you submit, a clinician on your team must authorize it before it goes to pharmacy review.'}</p></Notice>
          </div>
        )}
        <div className="spread">
          <button className="btn" onClick={() => { setErrors({}); setStep(Math.max(0, step - 1)); }} disabled={step === 0}>Back</button>
          <span className="small muted tabular">Estimated total {money(costs.total)}</span>
          {step < 4 ? <button className="btn btn-primary" onClick={next}>Continue</button> : (
            <button className="btn btn-primary" onClick={submit} disabled={busy || !user.permissions.submitRequests} aria-busy={busy}>{busy ? 'Submitting…' : 'Submit request'}</button>
          )}
        </div>
      </section>
    </>
  );
}

function CostTable({ db, o }: { db: Db; o: Order }) {
  const c = orderCosts(o, db.products, db.assumptions);
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">Itemized costs</caption>
        <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Pharmacy fee</th><th className="num">Line total</th></tr></thead>
        <tbody>
          {o.items.map((i) => { const p = db.products.find((x) => x.id === i.productId); return (
            <tr key={i.productId}><td>{p?.name}<div className="small muted mono">{p?.pharmacyProductId}</div></td><td className="num">{i.quantity}</td><td className="num">{money(i.unitPrice)}</td><td className="num">{money(i.dispensingFee)}</td><td className="num">{money((i.unitPrice + i.dispensingFee) * i.quantity)}</td></tr>
          ); })}
          <tr><td colSpan={4}>Medication subtotal (passed through to pharmacy)</td><td className="num">{money(c.medication)}</td></tr>
          <tr><td colSpan={4}>Pharmacy fees (passed through)</td><td className="num">{money(c.pharmacyFees)}</td></tr>
          <tr><td colSpan={4}>Shipping estimate (passed through)</td><td className="num">{money(c.shipping)}</td></tr>
          <tr><td colSpan={4}>Platform service fee</td><td className="num">{money(c.platformFee)}</td></tr>
          <tr><td colSpan={4}><strong>Estimated total (fictional, not charged)</strong></td><td className="num"><strong>{money(c.total)}</strong></td></tr>
        </tbody>
      </table>
    </div>
  );
}
export { CostTable };

export function History({ o }: { o: Order }) {
  return (
    <ol className="timeline" aria-label="Order history">
      {[...o.events].reverse().map((e) => (
        <li key={e.id} data-event-status={e.status ?? ''}>
          <div className="small muted"><time dateTime={e.at}>{fmtDate(e.at)}</time> · {e.actor}</div>
          <div>{e.status && <StatusBadge status={e.status} />} {e.note}</div>
        </li>
      ))}
    </ol>
  );
}

function OrderDetail({ db, user, o }: { db: Db; user: User; o: Order }) {
  const [reason, setReason] = useState('');
  const [reply, setReply] = useState('');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const loc = clinicOf(db, user).locations.find((l) => l.id === o.locationId);
  const authorize = async () => {
    setSending(true);
    const e = act((d) => A.authorizeOrder(d, user, o.id));
    if (e) { setErr(e); setSending(false); return; }
    const r = await A.sendToPharmacy(o.id);
    setSending(false);
    toast(r.ok ? `${o.id} authorized and moved to pharmacy review (mock)` : `${o.id} authorized; hand-off failed and support will retry`);
  };
  return (
    <>
      <PageHeader title={`Order ${o.id}`} actions={<>
        <button className="btn" onClick={() => { let id = ''; let removed: string[] = []; const e = act((d) => { const r = A.reorder(d, user, o.id); id = r.order.id; removed = r.removed; }); if (e) toast(e); else { toast(`New draft ${id} created${removed.length ? `; removed ${removed.length} unavailable item(s)` : ''}`); navigate(`/app/orders/${id}`); } }}>Create new draft from this order</button>
        <Link to={`/app/support?order=${o.id}`} className="btn">Ask about this order</Link>
      </>}>
        <Link to="/app/orders">Back to orders</Link>
      </PageHeader>
      <div className="spread card">
        <div className="row"><StatusBadge status={o.status} /><span>{ORDER_STATUS_HELP[o.status]}</span></div>
        {o.trackingNumber && <span className="small">Mock tracking <span className="mono">{o.trackingNumber}</span></span>}
      </div>
      {err && <Notice tone="bad"><p>{err}</p></Notice>}
      {o.integrationError && <Notice tone="warn"><p>The simulated pharmacy hand-off failed ({o.integrationError}). Platform support has been alerted and can retry. Your request is saved.</p></Notice>}
      {o.status === 'awaiting_clinician' && (
        <section className="card stack" aria-labelledby="auth-h">
          <h2 id="auth-h">Clinician authorization</h2>
          {canAuthorize(user) ? (
            <>
              <p>Prepared by {o.preparedBy}. Review the items and costs below. Authorizing records your review in the history; it is not a prescription in this demo.</p>
              <div className="btn-row">
                <button className="btn btn-primary" onClick={authorize} disabled={sending} aria-busy={sending}>{sending ? 'Authorizing…' : 'Authorize request'}</button>
                <button className="btn" onClick={() => { const e = act((d) => A.returnToDraft(d, user, o.id, 'Returned to staff for edits')); if (e) setErr(e); }}>Return to staff for edits</button>
              </div>
            </>
          ) : <p>Waiting for a clinician. Your role ({ROLE_LABEL[user.role]}) cannot authorize requests.</p>}
        </section>
      )}
      {sending && <Skeleton lines={2} />}
      {o.status === 'clarification_required' && (
        <section className="card stack" aria-labelledby="cl-h">
          <h2 id="cl-h">Clarification requested</h2>
          <p>{[...o.events].reverse().find((e) => e.kind === 'clarification')?.note}</p>
          <TextArea id="clarify" label="Your response" value={reply} onChange={setReply} />
          <div><button className="btn btn-primary" onClick={() => { const e = act((d) => A.respondClarification(d, user, o.id, reply), 'Response sent; back in pharmacy review'); setErr(e); if (!e) setReply(''); }}>Send response</button></div>
        </section>
      )}
      <div className="grid grid-2">
        <section className="card stack"><h2>Request details</h2>
          <dl className="kv">
            <dt>Ship to</dt><dd>{loc ? `${loc.name}, ${loc.city}, ${loc.state}` : 'Unknown'}</dd>
            <dt>Pathway</dt><dd>{o.pathway ? PATHWAY_LABEL[o.pathway] : 'Not chosen'}</dd>
            <dt>Prepared by</dt><dd>{o.preparedBy}</dd>
            <dt>Authorized by</dt><dd>{o.authorizedBy ? `${o.authorizedBy}, ${fmtDate(o.authorizedAt)}` : 'Not yet'}</dd>
            <dt>Submitted</dt><dd>{fmtDate(o.submittedAt)}</dd>
            {o.patientRef && <><dt>Patient reference</dt><dd className="mono">{o.patientRef}</dd></>}
            {o.externalRef && <><dt>Mock pharmacy ref</dt><dd className="mono">{o.externalRef}</dd></>}
          </dl>
          <CostTable db={db} o={o} />
        </section>
        <section className="card"><h2>History</h2><History o={o} /></section>
      </div>
      {CANCELLABLE.includes(o.status) && (
        <section className="card stack" aria-labelledby="cx-h">
          <h2 id="cx-h">Request cancellation</h2>
          {o.cancellationRequested ? <p>Cancellation requested. Platform administration will confirm with the pharmacy.</p> : <>
            <TextField id="cancel-reason" label="Reason" value={reason} onChange={setReason} hint="Platform administration reviews every request; the pharmacy may already have started." />
            <div><button className="btn btn-danger" onClick={() => { const e = act((d) => A.requestCancellation(d, user, o.id, reason), 'Cancellation requested'); setErr(e); }}>Request cancellation</button></div>
          </>}
        </section>
      )}
    </>
  );
}

function Support({ db, user, prefillOrder }: { db: Db; user: User; prefillOrder: string }) {
  const tickets = scopeToClinic(user, db.tickets);
  const orders = scopeToClinic(user, db.orders).filter((o) => o.status !== 'draft');
  const [f, setF] = useState({ subject: prefillOrder ? `Question about ${prefillOrder}` : '', category: (prefillOrder ? 'order' : 'other') as Ticket['category'], orderId: prefillOrder, body: '' });
  const [errors, setErrors] = useState<Errors>({});
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let r: { errors: Errors; id?: string } = { errors: {} };
    const err = act((d) => { r = A.createTicket(d, user, f); });
    if (err) { setErrors({ subject: err }); return; }
    setErrors(r.errors);
    if (r.id) { toast(`Ticket ${r.id} opened`); navigate(`/app/support/${r.id}`); } else focusFirstError(r.errors);
  };
  return (
    <>
      <PageHeader title="Support">Ask about an order, your account or the catalog. Replies here are from demo administration; notifications are simulated.</PageHeader>
      <div className="grid grid-2">
        <form className="card stack" onSubmit={submit} noValidate aria-labelledby="nt-h">
          <h2 id="nt-h">New ticket</h2>
          <TextField id="subject" label="Subject" value={f.subject} onChange={(v) => setF({ ...f, subject: v })} error={errors.subject} />
          <div className="form-grid">
            <SelectField id="category" label="Topic" value={f.category} onChange={(v) => setF({ ...f, category: v as Ticket['category'] })} options={['order', 'account', 'catalog', 'billing', 'other'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
            <SelectField id="orderId" label="Linked order (optional)" value={f.orderId} onChange={(v) => setF({ ...f, orderId: v })} error={errors.orderId} options={[{ value: '', label: 'None' }, ...orders.map((o) => ({ value: o.id, label: `${o.id} · ${ORDER_STATUS_LABEL[o.status]}` }))]} />
          </div>
          <TextArea id="body" label="Question" value={f.body} onChange={(v) => setF({ ...f, body: v })} error={errors.body} hint="Do not include patient details." />
          <div><button className="btn btn-primary" type="submit">Open ticket</button></div>
        </form>
        <section className="card" aria-labelledby="tl-h">
          <h2 id="tl-h">Your tickets</h2>
          {tickets.length === 0 ? <Empty title="No tickets yet">Tickets you open appear here with their status.</Empty> : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {tickets.map((t) => <li key={t.id} className="spread"><div><Link to={`/app/support/${t.id}`}>{t.id}: {t.subject}</Link><div className="small muted">{t.orderId ? `Order ${t.orderId} · ` : ''}{fmtDay(t.createdAt)}</div></div><Badge tone={t.status === 'resolved' ? 'good' : t.status === 'awaiting_clinic' ? 'warn' : 'info'}>{TICKET_LABEL[t.status]}</Badge></li>)}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

export function TicketThread({ db, user, t, back }: { db: Db; user: User; t: Ticket; back: string }) {
  const [reply, setReply] = useState('');
  const [resolution, setResolution] = useState('');
  const [err, setErr] = useState('');
  const isAdmin = user.role === 'platform_admin';
  return (
    <>
      <PageHeader title={`${t.id}: ${t.subject}`}><Link to={back}>Back to tickets</Link></PageHeader>
      <div className="card row"><Badge tone={t.status === 'resolved' ? 'good' : t.status === 'awaiting_clinic' ? 'warn' : 'info'}>{TICKET_LABEL[t.status]}</Badge>
        <span className="small muted">{db.clinics.find((c) => c.id === t.clinicId)?.name}{t.orderId && <> · Order <Link to={`${isAdmin ? '/admin/orders' : '/app/orders'}/${t.orderId}`}>{t.orderId}</Link></>}</span></div>
      {err && <Notice tone="bad"><p>{err}</p></Notice>}
      <div className="grid grid-2">
        <section className="card stack" aria-labelledby="th-h">
          <h2 id="th-h">Conversation</h2>
          {t.messages.map((m) => <div key={m.id} className={m.fromSupport ? 'msg support' : 'msg'}><div className="small muted">{m.author}{m.fromSupport ? ' (support)' : ''} · {fmtDate(m.at)}</div><p style={{ margin: 0 }}>{m.body}</p></div>)}
          {t.resolution && <Notice tone="good"><p><strong>Resolution:</strong> {t.resolution}</p></Notice>}
          {t.status !== 'resolved' ? (
            <>
              <TextArea id="reply" label={isAdmin ? 'Reply to clinic' : 'Reply to support'} value={reply} onChange={setReply} />
              <div className="btn-row"><button className="btn btn-primary" onClick={() => { const e = act((d) => A.replyTicket(d, user, t.id, reply), 'Reply sent (simulated notification)'); setErr(e); if (!e) setReply(''); }}>Send reply</button></div>
              <TextField id="resolution" label="Resolution summary" value={resolution} onChange={setResolution} />
              <div><button className="btn" onClick={() => { const e = act((d) => A.resolveTicket(d, user, t.id, resolution), 'Ticket resolved'); setErr(e); }}>Mark resolved</button></div>
            </>
          ) : <div><button className="btn" onClick={() => act((d) => A.reopenTicket(d, user, t.id), 'Ticket reopened')}>Reopen ticket</button></div>}
        </section>
        <section className="card" aria-labelledby="rh-h">
          <h2 id="rh-h">Status history</h2>
          <ol className="timeline">{t.history.map((h, i) => <li key={i}><div className="small muted">{fmtDate(h.at)} · {h.actor}</div><div>{TICKET_LABEL[h.status]}</div></li>)}</ol>
        </section>
      </div>
    </>
  );
}

function TicketPage({ db, user, id }: { db: Db; user: User; id: string }) {
  const t = scopeToClinic(user, db.tickets).find((x) => x.id === id);
  if (!t) return <div className="card"><Empty title="Ticket not found" action={<Link to="/app/support" className="btn">Back to support</Link>} /></div>;
  return <TicketThread db={db} user={user} t={t} back="/app/support" />;
}

export function Notifications({ db, clinicId }: { db: Db; clinicId: string | null }) {
  const rows = db.notifications.filter((n) => clinicId === null || n.clinicId === clinicId);
  return (
    <>
      <PageHeader title="Simulated notifications">Messages the platform would send. None were emailed: the mock email adapter only records them here.</PageHeader>
      <div className="card">
        {rows.length === 0 ? <Empty title="No notifications yet">Submitting an order or replying to a ticket creates one.</Empty> : (
          <div className="table-wrap"><table className="table-stack"><thead><tr><th>When</th><th>To</th><th>Subject</th><th>Delivery</th></tr></thead>
            <tbody>{rows.map((n) => <tr key={n.id}><td data-label="When">{fmtDate(n.at)}</td><td data-label="To">{n.to}</td><td data-label="Subject">{n.subject}</td><td data-label="Delivery"><Badge>Simulated, not sent</Badge></td></tr>)}</tbody></table></div>
        )}
      </div>
    </>
  );
}

const CHECKLIST: [string, string][] = [['profile', 'Practice profile'], ['locations', 'Locations'], ['clinicians', 'Clinicians added'], ['staff', 'Staff invited'], ['billing', 'Billing preferences'], ['firstOrder', 'First order request']];

function Account({ db, user }: { db: Db; user: User }) {
  const c = clinicOf(db, user);
  const team = db.users.filter((u) => u.clinicId === c.id);
  const clinicians = db.clinicians.filter((x) => x.clinicId === c.id);
  const [f, setF] = useState({ name: '', email: '', role: 'staff' as 'staff' | 'clinician' | 'clinic_admin', npi: '', licenseState: c.locations[0]?.state ?? 'CA', licenseNumber: '' });
  const [errors, setErrors] = useState<Errors>({});
  const canManage = user.permissions.manageUsers;
  const done = useMemo(() => CHECKLIST.filter(([k]) => c.checklist[k]).length, [c]);
  return (
    <>
      <PageHeader title="Clinic account">Practice details, team and onboarding. Credential fields are fictional and never verified in the demo.</PageHeader>
      <div className="grid grid-2">
        <section className="card stack"><h2>Practice</h2>
          <dl className="kv">
            <dt>Name</dt><dd>{c.name}</dd><dt>Type</dt><dd>{c.practiceType}</dd>
            <dt>Verification</dt><dd><Badge tone={c.verification === 'approved' ? 'good' : c.verification === 'rejected' ? 'bad' : 'warn'}>{VERIFICATION_LABEL[c.verification]}</Badge>{c.verificationNote && <div className="small muted">{c.verificationNote}</div>}</dd>
            <dt>Primary contact</dt><dd>{c.primaryContact.name}, {c.primaryContact.email}</dd>
            <dt>Billing contact</dt><dd>{c.billingContact.name}, {c.billingContact.email}</dd>
          </dl>
          {canManage && (
            <div className="form-grid">
              <SelectField id="ship-pref" label="Shipping preference" value={c.shippingPreference} onChange={(v) => act((d) => { d.clinics.find((x) => x.id === c.id)!.shippingPreference = v as never; }, 'Shipping preference saved')}
                options={[{ value: 'ship_to_clinic', label: 'Ship to clinic only' }, { value: 'ship_to_patient_allowed', label: 'Allow ship to patient' }]} />
              <SelectField id="bill-pref" label="Billing preference" value={c.billingPreference} onChange={(v) => act((d) => { const x = d.clinics.find((y) => y.id === c.id)!; x.billingPreference = v as never; x.checklist.billing = true; }, 'Billing preference saved')}
                options={[{ value: 'invoice_monthly', label: 'Monthly invoice (demo)' }, { value: 'card_on_file_demo', label: 'Card on file (demo, none stored)' }]} />
            </div>
          )}
        </section>
        <section className="card stack"><h2>Onboarding checklist</h2>
          <p className="small muted tabular">{done} of {CHECKLIST.length} complete</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack">
            {CHECKLIST.map(([k, label]) => <li key={k} className="spread"><span>{label}</span><Badge tone={c.checklist[k] ? 'good' : 'neutral'}>{c.checklist[k] ? 'Done' : 'To do'}</Badge></li>)}
          </ul>
        </section>
        <section className="card stack"><h2>Locations</h2>
          <ul>{c.locations.map((l) => <li key={l.id}><strong>{l.name}</strong>, {l.address}, {l.city}, {l.state} {l.zip}</li>)}</ul>
        </section>
        <section className="card stack"><h2>Clinicians</h2>
          <div className="table-wrap"><table className="table-stack"><thead><tr><th>Name</th><th>NPI (fictional)</th><th>License</th><th>Check</th></tr></thead>
            <tbody>{clinicians.map((x) => <tr key={x.id}><td data-label="Name">{x.name}, {x.credential}</td><td data-label="NPI" className="mono">{x.npi}</td><td data-label="License">{x.licenseState} {x.licenseNumber}</td><td data-label="Check">{x.credentialCheck === 'mock_checked' ? 'Mock only, not verified' : 'Not checked'}</td></tr>)}</tbody></table></div>
        </section>
      </div>
      <section className="card stack" aria-labelledby="team-h">
        <h2 id="team-h">Team and permissions</h2>
        <div className="table-wrap"><table className="table-stack"><thead><tr><th>Name</th><th>Role</th><th>Create drafts</th><th>Submit</th><th>Authorize</th><th>Manage users</th></tr></thead>
          <tbody>{team.map((u) => (
            <tr key={u.id}><td data-label="Name">{u.name}<div className="small muted">{u.email}</div></td><td data-label="Role">{ROLE_LABEL[u.role]}</td>
              {(['createDrafts', 'submitRequests', 'authorizeOrders', 'manageUsers'] as const).map((k) => (
                <td key={k} data-label={k}><input type="checkbox" aria-label={`${k} for ${u.name}`} checked={u.permissions[k]} disabled={!canManage || u.id === user.id || (k === 'authorizeOrders' && u.role !== 'clinician')}
                  onChange={(e) => { const er = act((d) => A.setPermission(d, user, u.id, k, e.target.checked), 'Permission updated'); if (er) toast(er); }} /></td>
              ))}
            </tr>
          ))}</tbody></table></div>
        {!canManage ? <p className="small muted">Only clinic administrators can add team members or change permissions.</p> : (
          <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); let errs: Errors = {}; update((d) => { errs = A.addTeamMember(d, user, f); }); setErrors(errs); if (!Object.keys(errs).length) { toast(`${f.name} added`); setF({ ...f, name: '', email: '', npi: '', licenseNumber: '' }); } else focusFirstError(errs); }}>
            <h3>Add a team member</h3>
            <div className="form-grid">
              <TextField id="name" label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} error={errors.name} />
              <TextField id="email" label="Email" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} error={errors.email} />
              <SelectField id="role" label="Role" value={f.role} onChange={(v) => setF({ ...f, role: v as typeof f.role })} options={[{ value: 'staff', label: 'Staff' }, { value: 'clinician', label: 'Clinician' }, { value: 'clinic_admin', label: 'Clinic administrator' }]} />
              {f.role === 'clinician' && <>
                <TextField id="npi" label="NPI (fictional)" value={f.npi} onChange={(v) => setF({ ...f, npi: v })} error={errors.npi} inputMode="numeric" />
                <TextField id="licenseNumber" label="License number (fictional)" value={f.licenseNumber} onChange={(v) => setF({ ...f, licenseNumber: v })} error={errors.licenseNumber} />
              </>}
            </div>
            <div><button className="btn btn-primary" type="submit">Add team member</button></div>
          </form>
        )}
      </section>
    </>
  );
}
