// Public marketing site: Home, How it works, Categories, For clinics, Resources/FAQ, Contact, Request access, Demo chooser.
import { useState, type ReactNode } from 'react';
import { CATEGORY_LABEL, ORDER_STATUS_HELP, ORDER_STATUS_LABEL, ROLE_LABEL, TYPE_LABEL, US_STATES, type ApplicationInput, type Errors } from '../domain/rules';
import type { Category, OrderStatus } from '../domain/types';
import { update, useDb } from '../data/store';
import { submitApplication, submitLead, switchUser } from '../services/actions';
import { Link, Logo, Notice, SelectField, StatusBadge, TextArea, TextField, focusFirstError, navigate } from '../ui/kit';

const NAV = [
  ['/how-it-works', 'How it works'],
  ['/categories', 'Product categories'],
  ['/clinics', 'For clinics'],
  ['/resources', 'Resources and FAQ'],
  ['/contact', 'Contact'],
] as const;

export function PublicLayout({ route, children }: { route: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <header className="site-header">
        <div className="inner">
          <Link to="/" className="brand"><Logo /> Medically Grounded</Link>
          <button className="btn btn-on-dark btn-sm menu-btn" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>
            {open ? 'Close menu' : 'Menu'}
          </button>
          <nav id="site-nav" aria-label="Main" className={open ? 'site-nav open' : 'site-nav'} onClick={() => setOpen(false)}>
            {NAV.map(([to, label]) => <Link key={to} to={to} current={route === to}>{label}</Link>)}
            <Link to="/request-access" className="btn btn-primary btn-sm">Request clinic access</Link>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="site-footer">
        <div className="inner">
          <div>
            <strong>Medically Grounded</strong> is a demonstration product. All clinics, products, prices and pharmacies shown are fictional.
            <br />Requests made in the demo are not prescriptions and nothing is charged or shipped.
          </div>
          <nav aria-label="Footer" className="row">
            <Link to="/demo">Explore demo</Link>
            <Link to="/contact?partnership">Discuss a partnership</Link>
            <Link to="/resources">FAQ</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

function PageHead({ title, children }: { title: string; children: ReactNode }) {
  return <section className="page-head"><div className="inner"><h1>{title}</h1><p>{children}</p></div></section>;
}

const PREVIEW: [string, string, OrderStatus][] = [
  ['MG-2041', 'Office-use stock · 2 items', 'pharmacy_review'],
  ['MG-2038', 'Patient-specific · 1 item', 'awaiting_clinician'],
  ['MG-2033', 'Patient-specific · 3 items', 'shipped'],
];

export function Home() {
  return (
    <>
      <section className="hero">
        <div className="inner">
          <div>
            <h1>Source. Request. Track.</h1>
            <p className="lead">A portal where clinics browse pharmacy catalogs, submit order requests and follow each one to delivery.</p>
            <div className="btn-row">
              <Link to="/request-access" className="btn btn-primary">Request clinic access</Link>
              <Link to="/demo" className="btn btn-on-dark">Explore demo</Link>
            </div>
          </div>
          <div className="hero-preview" aria-label="Example order list from the demo workspace">
            <div className="spread"><strong>Recent requests</strong><span className="small muted">Demo data</span></div>
            {PREVIEW.map(([id, desc, s]) => (
              <div className="preview-row" key={id}>
                <div><div className="mono">{id}</div><div className="small muted">{desc}</div></div>
                <StatusBadge status={s} />
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="section-head"><h2>What the portal handles</h2><p>Built for med spas, weight-management and hormone clinics, dermatology offices and telehealth teams.</p></div>
        <div className="grid grid-3">
          <article className="card"><h3>Centralized sourcing</h3><p>Search one catalog across pharmacy partners, with form, strength, package size, state eligibility and fees on every product.</p></article>
          <article className="card"><h3>Order visibility</h3><p>Every request has an ID and a timestamped history, from staff draft to clinician authorization, pharmacy review, shipment and delivery.</p></article>
          <article className="card"><h3>Administrative support</h3><p>Order-linked support tickets, onboarding checklists and a team that follows up on clarifications and exceptions.</p></article>
        </div>
      </section>
      <section className="section">
        <div className="cta-band">
          <div><h2>See the full workflow</h2><p>The demo runs in your browser with fictional data. Switch between clinic and administrator roles.</p></div>
          <div className="btn-row">
            <Link to="/demo" className="btn btn-on-dark">Explore demo</Link>
            <Link to="/contact?partnership" className="btn btn-on-dark">Discuss a partnership</Link>
          </div>
        </div>
      </section>
    </>
  );
}

export function HowItWorks() {
  const statuses = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];
  return (
    <>
      <PageHead title="How it works">From application to delivery, every step is recorded and visible to your clinic team.</PageHead>
      <section className="section">
        <ol className="steps">
          <li><h3>Apply</h3><p>Submit practice, location and clinician details. Platform administrators review each application.</p></li>
          <li><h3>Set up your team</h3><p>Add clinicians and staff, set permissions and complete the onboarding checklist.</p></li>
          <li><h3>Prepare a request</h3><p>Staff choose a location, products and a fulfillment pathway, then review itemized costs.</p></li>
          <li><h3>Clinician authorization</h3><p>Requests prepared by staff wait for a clinician on your team to review and authorize them.</p></li>
          <li><h3>Pharmacy review</h3><p>The request goes to the pharmacy. If it needs more information you see a clarification request.</p></li>
          <li><h3>Track to delivery</h3><p>Follow accepted, processing, shipped and delivered updates, each with a timestamp.</p></li>
        </ol>
      </section>
      <section className="section">
        <div className="section-head"><h2>Order statuses</h2><p>Each status means one thing. Submitted is not accepted, and shipped is not delivered.</p></div>
        <div className="card table-wrap">
          <table className="table-stack">
            <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
            <tbody>{statuses.map((s) => <tr key={s}><td data-label="Status"><StatusBadge status={s} /></td><td data-label="Meaning">{ORDER_STATUS_HELP[s]}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const CATEGORY_COPY: Record<Category, string> = {
  weight: 'Injectable and oral options from fictional compounding partners and branded suppliers.',
  womens_hormones: 'Creams, capsules and troches listed with strength, form and state eligibility.',
  mens_hormones: 'Injectables and topicals, including items that need an adult signature on delivery.',
  sexual_health: 'Tablet and dissolving formats for patient-specific requests.',
  hair_derm: 'Topical solutions and creams, plus office-use products for in-clinic procedures.',
  wellness: 'Office-use vials and patient-specific products for wellness programs.',
};

export function Categories() {
  const db = useDb();
  return (
    <>
      <PageHead title="Product categories">Six categories, each separated into patient-specific prescriptions, office-use products and branded medications.</PageHead>
      <section className="section">
        <div className="grid grid-3">
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
            <article className="card" key={c}>
              <h3>{CATEGORY_LABEL[c]}</h3>
              <p>{CATEGORY_COPY[c]}</p>
              <p className="small muted">{db.products.filter((p) => p.category === c && p.active).length} demo products</p>
            </article>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-head"><h2>Three ways a product is sourced</h2></div>
        <div className="grid grid-3">
          <article className="card"><h3>{TYPE_LABEL.patient_specific}</h3><p>Prepared for one patient after a clinician authorizes the request. Ships to the patient or the clinic where allowed.</p></article>
          <article className="card"><h3>{TYPE_LABEL.office_use}</h3><p>Stock for use inside the clinic, where the product and state permit it. Always ships to a clinic location.</p></article>
          <article className="card"><h3>{TYPE_LABEL.branded}</h3><p>Manufacturer products sourced through a pharmacy or distributor partner.</p></article>
        </div>
        <p className="muted small" style={{ marginTop: 16 }}>Catalog entries describe products only. They are not clinical guidance, and product availability varies by pharmacy and state.</p>
      </section>
    </>
  );
}

export function ForClinics() {
  const kinds: [string, string][] = [
    ['Med spas', 'Office-use stock and patient-specific requests from one account, with per-location shipping.'],
    ['Weight-management clinics', 'Track recurring requests and start new drafts from previous orders, with fresh clinician review each time.'],
    ['Hormone and wellness practices', 'Keep clinician authorization separate from staff preparation, with a full audit trail.'],
    ['Dermatology offices', 'Compare formulations side by side, save favorites and see state eligibility before you order.'],
    ['Telehealth companies', 'Manage multiple clinicians and licenses, and route patient-specific shipments where allowed.'],
  ];
  return (
    <>
      <PageHead title="For clinics">Clinic administrators, clinicians and staff each get the tools their role needs.</PageHead>
      <section className="section">
        <div className="grid grid-2">{kinds.map(([t, d]) => <article className="card" key={t}><h3>{t}</h3><p>{d}</p></article>)}</div>
      </section>
      <section className="section">
        <div className="section-head"><h2>Roles</h2></div>
        <div className="grid grid-3">
          <article className="card"><h3>{ROLE_LABEL.clinic_admin}</h3><p>Manages the practice profile, locations, billing preferences, team and permissions.</p></article>
          <article className="card"><h3>{ROLE_LABEL.clinician}</h3><p>Reviews and authorizes requests. Only clinicians can authorize.</p></article>
          <article className="card"><h3>{ROLE_LABEL.staff}</h3><p>Prepares drafts, answers clarifications and opens support tickets.</p></article>
        </div>
      </section>
    </>
  );
}

const FAQ: [string, string][] = [
  ['Is this a real pharmacy service?', 'No. This is a demonstration. Products, prices, pharmacies and clinics are fictional, and requests are never sent to a real pharmacy.'],
  ['Is a request in the portal a prescription?', 'No. A request records what a clinic wants to source. Prescribing happens outside this demo, under each clinician’s own professional judgment and applicable law.'],
  ['Does approval mean credentials were verified?', 'In the demo, no. Approval is a simulated administrative step. A production system would use a credential verification service and human review.'],
  ['Which states can products ship to?', 'Each product lists its own eligible states. The order form blocks products that are not eligible for the chosen location.'],
  ['How are costs shown?', 'Each request itemizes medication, pharmacy fees, shipping and a platform service fee. Demo figures are fictional and nothing is charged.'],
  ['Where is my data stored?', 'In the demo, only in your browser’s local storage. Do not enter real patient, payment or credential information.'],
  ['Is the platform HIPAA compliant?', 'This demo makes no compliance claim. The architecture notes describe what a production deployment would need, including independent review.'],
];

export function Resources() {
  return (
    <>
      <PageHead title="Resources and FAQ">Plain answers about how the portal works and what the demo does not do.</PageHead>
      <section className="section stack faq">
        {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
      </section>
    </>
  );
}

export function Contact({ route }: { route: string }) {
  const partnership = route.includes('partnership');
  const [kind, setKind] = useState<'contact' | 'partnership'>(partnership ? 'partnership' : 'contact');
  const [f, setF] = useState({ name: '', organization: '', email: '', message: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [sent, setSent] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let errs: Errors = {};
    update((d) => { errs = submitLead(d, kind, f); });
    setErrors(errs);
    if (Object.keys(errs).length) focusFirstError(errs); else setSent(true);
  };
  return (
    <>
      <PageHead title="Contact">Questions about the portal, or interested in a partnership? Send a note.</PageHead>
      <section className="section" style={{ maxWidth: 720 }}>
        {sent ? (
          <Notice tone="good"><p><strong>Message saved.</strong> It appears in the demo administration leads list. No email was sent.</p>
            <button className="btn btn-sm" onClick={() => { setSent(false); setF({ name: '', organization: '', email: '', message: '' }); }}>Send another message</button></Notice>
        ) : (
          <form className="card stack" onSubmit={submit} noValidate>
            <SelectField id="kind" label="Topic" value={kind} onChange={(v) => setKind(v as typeof kind)}
              options={[{ value: 'contact', label: 'General question' }, { value: 'partnership', label: 'Discuss a partnership' }]} />
            <div className="form-grid">
              <TextField id="name" label="Your name" value={f.name} onChange={(v) => setF({ ...f, name: v })} error={errors.name} autoComplete="name" required />
              <TextField id="organization" label="Organization" value={f.organization} onChange={(v) => setF({ ...f, organization: v })} autoComplete="organization" />
            </div>
            <TextField id="email" label="Email" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} error={errors.email} autoComplete="email" required />
            <TextArea id="message" label="Message" value={f.message} onChange={(v) => setF({ ...f, message: v })} error={errors.message} />
            <div><button className="btn btn-primary" type="submit">Send message</button></div>
          </form>
        )}
      </section>
    </>
  );
}

const blankApp: ApplicationInput = {
  practiceName: '', practiceType: '', contactName: '', email: '', phone: '', locationName: 'Main office', address: '', city: '', state: '', zip: '',
  clinicianName: '', clinicianCredential: 'MD', npi: '', licenseState: '', licenseNumber: '', acknowledge: false,
};

export function RequestAccess() {
  const [f, setF] = useState<ApplicationInput>(blankApp);
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<string | null>(null);
  const set = (k: keyof ApplicationInput) => (v: string) => setF({ ...f, [k]: v });
  const stateOpts = [{ value: '', label: 'Choose a state' }, ...US_STATES.map((s) => ({ value: s, label: s }))];
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let res: { errors: Errors; clinicId?: string } = { errors: {} };
    update((d) => { res = submitApplication(d, f); });
    setErrors(res.errors);
    if (res.clinicId) { setDone(res.clinicId); window.scrollTo(0, 0); } else focusFirstError(res.errors);
  };
  if (done) return (
    <>
      <PageHead title="Application submitted">Your application is in the review queue with status Submitted.</PageHead>
      <section className="section" style={{ maxWidth: 720 }}>
        <div className="card stack">
          <p>Application reference <strong className="mono" data-testid="application-id">{done}</strong>. In this demo you can review it yourself in platform administration.</p>
          <Notice tone="warn"><p>Approving it in the demo does not verify any license, NPI or other credential.</p></Notice>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => { update((d) => switchUser(d, 'u-admin')); navigate(`/admin/clinics/${done}`); }}>Review in demo administration</button>
            <Link to="/" className="btn">Back to home</Link>
          </div>
        </div>
      </section>
    </>
  );
  return (
    <>
      <PageHead title="Request clinic access">Tell us about your practice. Use fictional details only: this is a demo and nothing is verified.</PageHead>
      <section className="section" style={{ maxWidth: 880 }}>
        <form className="card stack" onSubmit={submit} noValidate aria-label="Clinic application">
          {Object.keys(errors).length > 0 && <Notice tone="bad"><p>Fix {Object.keys(errors).length} field{Object.keys(errors).length > 1 ? 's' : ''} marked below, then submit again.</p></Notice>}
          <fieldset className="stack"><legend>Practice</legend>
            <div className="form-grid">
              <TextField id="practiceName" label="Practice name" value={f.practiceName} onChange={set('practiceName')} error={errors.practiceName} autoComplete="organization" required />
              <SelectField id="practiceType" label="Practice type" value={f.practiceType} onChange={set('practiceType')} error={errors.practiceType}
                options={[{ value: '', label: 'Choose a type' }, ...['Med spa', 'Weight-management clinic', 'Hormone or wellness practice', 'Dermatology office', 'Telehealth company'].map((v) => ({ value: v, label: v }))]} />
              <TextField id="contactName" label="Administrator name" value={f.contactName} onChange={set('contactName')} error={errors.contactName} autoComplete="name" required />
              <TextField id="email" label="Administrator email" type="email" value={f.email} onChange={set('email')} error={errors.email} autoComplete="email" required />
              <TextField id="phone" label="Phone" type="tel" value={f.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" inputMode="tel" required />
            </div>
          </fieldset>
          <fieldset className="stack"><legend>First location</legend>
            <div className="form-grid">
              <TextField id="locationName" label="Location name" value={f.locationName} onChange={set('locationName')} error={errors.locationName} />
              <TextField id="address" label="Street address" value={f.address} onChange={set('address')} error={errors.address} autoComplete="street-address" />
              <TextField id="city" label="City" value={f.city} onChange={set('city')} error={errors.city} autoComplete="address-level2" />
              <SelectField id="state" label="State" value={f.state} onChange={set('state')} error={errors.state} options={stateOpts} />
              <TextField id="zip" label="ZIP code" value={f.zip} onChange={set('zip')} error={errors.zip} inputMode="numeric" autoComplete="postal-code" />
            </div>
          </fieldset>
          <fieldset className="stack"><legend>Primary clinician</legend>
            <div className="form-grid">
              <TextField id="clinicianName" label="Clinician name" value={f.clinicianName} onChange={set('clinicianName')} error={errors.clinicianName} />
              <SelectField id="clinicianCredential" label="Credential" value={f.clinicianCredential} onChange={set('clinicianCredential')} options={['MD', 'DO', 'NP', 'PA'].map((v) => ({ value: v, label: v }))} />
              <TextField id="npi" label="NPI (fictional)" value={f.npi} onChange={set('npi')} error={errors.npi} inputMode="numeric" hint="10 digits, for example 0000000404." />
              <SelectField id="licenseState" label="License state" value={f.licenseState} onChange={set('licenseState')} error={errors.licenseState} options={stateOpts} />
              <TextField id="licenseNumber" label="License number (fictional)" value={f.licenseNumber} onChange={set('licenseNumber')} error={errors.licenseNumber} />
            </div>
          </fieldset>
          <div className="field">
            <label className="check"><input id="acknowledge" type="checkbox" checked={f.acknowledge} onChange={(e) => setF({ ...f, acknowledge: e.target.checked })} aria-invalid={errors.acknowledge ? true : undefined} aria-describedby={errors.acknowledge ? 'acknowledge-error' : undefined} />
              <span>Every detail above is fictional. I have not entered real patient, license or payment information.</span></label>
            {errors.acknowledge && <span className="error" id="acknowledge-error">{errors.acknowledge}</span>}
          </div>
          <div><button className="btn btn-primary" type="submit">Submit application</button></div>
        </form>
      </section>
    </>
  );
}

export function DemoChooser() {
  const db = useDb();
  const open = (userId: string, to: string) => { update((d) => switchUser(d, userId)); navigate(to); };
  const clinicUsers = db.users.filter((u) => u.clinicId && db.clinics.find((c) => c.id === u.clinicId)?.verification === 'approved');
  return (
    <>
      <PageHead title="Explore the demo">Pick a role to open. Role switching is a demo convenience, not sign-in, and all data stays in this browser.</PageHead>
      <section className="section grid grid-2">
        <div className="card stack">
          <h2>Clinic workspace</h2>
          <div className="stack" role="list">
            {clinicUsers.map((u) => (
              <div className="spread" key={u.id} role="listitem">
                <div><strong>{u.name}</strong><div className="small muted">{ROLE_LABEL[u.role]} · {db.clinics.find((c) => c.id === u.clinicId)?.name}</div></div>
                <button className="btn btn-sm" onClick={() => open(u.id, '/app')}>Open as {ROLE_LABEL[u.role].toLowerCase()}<span className="sr-only">, {u.name}</span></button>
              </div>
            ))}
          </div>
        </div>
        <div className="card stack">
          <h2>Platform administration</h2>
          <p>Review applications, manage the catalog and pharmacies, update simulated order statuses, answer tickets and see financial reporting.</p>
          <div><button className="btn btn-primary" onClick={() => open('u-admin', '/admin')}>Open administration</button></div>
        </div>
      </section>
    </>
  );
}
