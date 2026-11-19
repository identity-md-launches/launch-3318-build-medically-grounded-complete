// Portal chrome shared by the clinic workspace and platform administration.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ROLE_LABEL } from '../domain/rules';
import { getSaveError, resetDemo, update, useSession } from '../data/store';
import { switchUser } from '../services/actions';
import { Link, Logo, Notice, navigate, toast } from './kit';

export interface NavItem { to: string; label: string; count?: number; group?: string }

export function PortalShell({ nav, route, title, children }: { nav: NavItem[]; route: string; title: string; children: ReactNode }) {
  const { db, user } = useSession();
  const [open, setOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [route]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); menuBtn.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const active = (to: string) => route === to || (to !== '/app' && to !== '/admin' && route.startsWith(to + '/'));
  const switchTo = (id: string) => {
    update((d) => switchUser(d, id));
    const u = db.users.find((x) => x.id === id)!;
    navigate(u.role === 'platform_admin' ? '/admin' : '/app');
    toast(`Now viewing as ${u.name} (${ROLE_LABEL[u.role]})`);
  };
  const saveError = getSaveError();
  let lastGroup: string | undefined;
  return (
    <>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <div className="shell">
        {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
        <aside className={open ? 'sidebar open' : 'sidebar'} id="portal-nav" aria-label={`${title} navigation`}>
          <Link to="/" className="brand"><Logo /> Medically Grounded</Link>
          <nav aria-label={title}>
            {nav.map((n) => {
              const header = n.group && n.group !== lastGroup ? <div className="group-label" key={`g-${n.group}`}>{n.group}</div> : null;
              lastGroup = n.group;
              return [header, (
                <Link key={n.to} to={n.to} current={active(n.to)}>
                  <span>{n.label}</span>{n.count ? <span className="count" aria-label={`${n.count} need attention`}>{n.count}</span> : null}
                </Link>
              )];
            })}
          </nav>
        </aside>
        <div className="main">
          <div className="demo-banner" role="note">
            <span>Demo workspace: fictional data. Role switching below is not sign-in.</span>
            <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm('Reset all demo data to the original seed? Your changes in this browser will be lost.')) { resetDemo(); navigate('/demo'); toast('Demo data reset'); } }}>Reset demo data</button>
          </div>
          <div className="topbar">
            <div className="row">
              <button ref={menuBtn} className="btn btn-sm portal-menu-btn" aria-expanded={open} aria-controls="portal-nav" onClick={() => setOpen(!open)}>Menu</button>
              <strong>{title}</strong>
            </div>
            <div className="role-switch">
              <label htmlFor="role-switch" className="small muted">Viewing as</label>
              <select id="role-switch" value={user.id} onChange={(e) => switchTo(e.target.value)}>
                {db.users.filter((u) => u.active && (!u.clinicId || db.clinics.find((c) => c.id === u.clinicId))).map((u) => {
                  const c = db.clinics.find((x) => x.id === u.clinicId);
                  return <option key={u.id} value={u.id}>{u.name} · {ROLE_LABEL[u.role]}{c ? ` · ${c.name}` : ''}</option>;
                })}
              </select>
            </div>
          </div>
          <main id="main" tabIndex={-1} className="content">
            {saveError && <Notice tone="bad"><p>{saveError}</p></Notice>}
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

export function PageHeader({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="spread">
      <div><h1>{title}</h1>{children && <p>{children}</p>}</div>
      {actions && <div className="btn-row">{actions}</div>}
    </header>
  );
}

export function NoAccess({ message }: { message: string }) {
  return <div className="card"><h2>Not available for this role</h2><p>{message}</p><Link to="/demo" className="btn">Choose another demo role</Link></div>;
}
