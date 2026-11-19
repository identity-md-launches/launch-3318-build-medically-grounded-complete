-- Medically Grounded production schema (PostgreSQL 15+). SCAFFOLD ONLY: not deployed.
-- Mirrors src/domain/types.ts. Tenant isolation via clinic_id + row-level security.

create type user_role as enum ('clinic_admin', 'clinician', 'staff', 'platform_admin');
create type verification_status as enum ('submitted', 'pending_review', 'information_requested', 'approved', 'rejected');
create type order_status as enum ('draft', 'submitted', 'awaiting_clinician', 'pharmacy_review', 'clarification_required', 'accepted', 'processing', 'shipped', 'delivered', 'cancelled');
create type ticket_status as enum ('open', 'awaiting_clinic', 'awaiting_support', 'resolved');

create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  practice_type text not null,
  verification verification_status not null default 'submitted',
  verification_note text not null default '',
  shipping_preference text not null default 'ship_to_clinic',
  billing_preference text not null default 'invoice_monthly',
  checklist jsonb not null default '{}',
  primary_contact jsonb not null,
  billing_contact jsonb not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  name text not null, address text not null, city text not null, state char(2) not null, zip text not null
);

create table clinicians (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  name text not null, credential text not null, npi char(10) not null,
  license_state char(2) not null, license_number text not null,
  credential_check text not null default 'not_checked', -- set only by a real verification workflow
  unique (clinic_id, npi)
);

create table users (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),          -- null for platform staff
  idp_subject text not null unique,               -- OIDC subject; no passwords stored here
  name text not null, email citext not null unique,
  role user_role not null,
  clinician_id uuid references clinicians(id),
  permissions jsonb not null,
  active boolean not null default true,
  check ((role = 'platform_admin') = (clinic_id is null)),
  check (role <> 'clinician' or clinician_id is not null)
);

create table pharmacies (
  id uuid primary key default gen_random_uuid(),
  name text not null, kind text not null,
  integration_status text not null default 'not_connected',
  adapter text not null, states char(2)[] not null, contact_email text, notes text
  -- API credentials are NOT stored here; they live in the secret manager keyed by pharmacy id.
);

create table products (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id),
  pharmacy_product_id text not null,
  name text not null, category text not null, type text not null,
  form text not null, strength text not null, package_size text not null,
  pathways text[] not null, states char(2)[] not null,
  availability text not null, shipping text not null,
  unit_price numeric(10,2) not null check (unit_price > 0),
  dispensing_fee numeric(10,2) not null check (dispensing_fee >= 0),
  supplier_notes text not null default '',       -- platform admin only (exclude from clinic views)
  documents jsonb not null default '[]',
  active boolean not null default true,
  unique (pharmacy_id, pharmacy_product_id)
);

create table orders (
  id text primary key,                            -- MG-####
  clinic_id uuid not null references clinics(id),
  location_id uuid not null references locations(id),
  pathway text,
  status order_status not null default 'draft',
  patient_ref text not null default '',
  po_number text not null default '',
  pharmacy_notes text not null default '',
  prepared_by uuid references users(id),
  authorized_by uuid references users(id),
  authorized_at timestamptz,
  idempotency_key text not null unique,
  source_order_id text references orders(id),
  cancellation_requested boolean not null default false,
  integration_error text,
  external_ref text, tracking_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table order_items (
  order_id text not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity int not null check (quantity between 1 and 50),
  unit_price numeric(10,2) not null,
  dispensing_fee numeric(10,2) not null,
  primary key (order_id, product_id)
);

create table order_events (
  id bigserial primary key,
  order_id text not null references orders(id),
  clinic_id uuid not null references clinics(id),
  at timestamptz not null default now(),
  status order_status, actor text not null, kind text not null, note text not null
);

create table tickets (
  id text primary key, clinic_id uuid not null references clinics(id), order_id text references orders(id),
  subject text not null, category text not null, status ticket_status not null default 'open',
  resolution text, created_at timestamptz not null default now()
);
create table ticket_messages (id bigserial primary key, ticket_id text not null references tickets(id), clinic_id uuid not null, at timestamptz not null default now(), author uuid references users(id), from_support boolean not null, body text not null);
create table ticket_history (id bigserial primary key, ticket_id text not null references tickets(id), clinic_id uuid not null, at timestamptz not null default now(), status ticket_status not null, actor uuid references users(id));

create table leads (id uuid primary key default gen_random_uuid(), kind text not null, name text not null, organization text, email citext not null, message text, status text not null default 'new', owner text, clinic_id uuid references clinics(id), created_at timestamptz not null default now());
create table tasks (id uuid primary key default gen_random_uuid(), title text not null, assignee text, due date, related text, status text not null default 'open', notes jsonb not null default '[]', created_at timestamptz not null default now());
create table favorites (user_id uuid references users(id), product_id uuid references products(id), primary key (user_id, product_id));
create table notifications_outbox (id bigserial primary key, clinic_id uuid, to_address text not null, subject text not null, body text not null, created_at timestamptz not null default now(), sent_at timestamptz, attempts int not null default 0, last_error text);
create table integration_outbox (id bigserial primary key, order_id text not null references orders(id), operation text not null, idempotency_key text not null, attempts int not null default 0, next_attempt_at timestamptz not null default now(), last_error text, state text not null default 'pending', unique (order_id, operation, idempotency_key));
create table financial_assumptions (id int primary key default 1 check (id = 1), values jsonb not null, updated_by uuid references users(id), updated_at timestamptz not null default now());

create table audit_log (
  id bigserial primary key, at timestamptz not null default now(),
  actor uuid, action text not null, entity text not null, entity_id text not null, detail text not null default '',
  clinic_id uuid
);
revoke update, delete on audit_log from public;

-- Row-level security: the API sets app.clinic_id and app.role per request from the session.
alter table orders enable row level security;
create policy clinic_orders on orders
  using (current_setting('app.role') = 'platform_admin' or clinic_id = current_setting('app.clinic_id')::uuid);
alter table order_events enable row level security;
create policy clinic_order_events on order_events
  using (current_setting('app.role') = 'platform_admin' or clinic_id = current_setting('app.clinic_id')::uuid);
alter table tickets enable row level security;
create policy clinic_tickets on tickets
  using (current_setting('app.role') = 'platform_admin' or clinic_id = current_setting('app.clinic_id')::uuid);
alter table ticket_messages enable row level security;
create policy clinic_ticket_messages on ticket_messages
  using (current_setting('app.role') = 'platform_admin' or clinic_id = current_setting('app.clinic_id')::uuid);
alter table locations enable row level security;
create policy clinic_locations on locations
  using (current_setting('app.role') = 'platform_admin' or clinic_id = current_setting('app.clinic_id')::uuid);
alter table clinicians enable row level security;
create policy clinic_clinicians on clinicians
  using (current_setting('app.role') = 'platform_admin' or clinic_id = current_setting('app.clinic_id')::uuid);
-- Clinic roles read products through a view that omits supplier_notes:
create view clinic_products as
  select id, pharmacy_id, pharmacy_product_id, name, category, type, form, strength, package_size, pathways, states,
         availability, shipping, unit_price, dispensing_fee, documents
  from products where active;
