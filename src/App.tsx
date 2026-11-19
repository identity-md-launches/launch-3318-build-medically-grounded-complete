import { useEffect } from 'react';
import { AdminApp } from './pages/admin';
import { ClinicApp } from './pages/clinic';
import { Categories, Contact, DemoChooser, ForClinics, Home, HowItWorks, PublicLayout, RequestAccess, Resources } from './pages/public';
import { Empty, Link, Toaster, useRoute } from './ui/kit';

const TITLES: Record<string, string> = {
  '/': 'Clinic pharmacy sourcing portal (demo)', '/how-it-works': 'How it works', '/categories': 'Product categories', '/clinics': 'For clinics',
  '/resources': 'Resources and FAQ', '/contact': 'Contact', '/request-access': 'Request clinic access', '/demo': 'Explore the demo',
};

export function App() {
  const route = useRoute();
  const path = route.split('?')[0];
  useEffect(() => {
    document.title = `Medically Grounded · ${TITLES[path] ?? (path.startsWith('/admin') ? 'Administration (demo)' : 'Clinic workspace (demo)')}`;
    window.scrollTo(0, 0);
  }, [path]);
  let body: JSX.Element;
  if (path === '/app' || path.startsWith('/app/')) body = <ClinicApp route={route} />;
  else if (path === '/admin' || path.startsWith('/admin/')) body = <AdminApp route={route} />;
  else {
    const pages: Record<string, JSX.Element> = {
      '/': <Home />, '/how-it-works': <HowItWorks />, '/categories': <Categories />, '/clinics': <ForClinics />, '/resources': <Resources />,
      '/contact': <Contact route={route} />, '/request-access': <RequestAccess />, '/demo': <DemoChooser />,
    };
    body = <PublicLayout route={path}>{pages[path] ?? <section className="section"><Empty title="Page not found" action={<Link to="/" className="btn">Go home</Link>} /></section>}</PublicLayout>;
  }
  return <>{body}<Toaster /></>;
}
