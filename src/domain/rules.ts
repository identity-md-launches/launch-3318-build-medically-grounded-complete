// Pure business rules: labels, status machine, permissions, pricing, validation, financials.
// No React and no storage here so the same rules can move to a server unchanged.
import type {
  Availability, Category, Db, FinancialAssumptions, Order, OrderStatus, Pathway, Permissions,
  Product, ProductType, Role, ShippingRequirement, TicketStatus, User, VerificationStatus,
} from './types';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  awaiting_clinician: 'Awaiting Clinician',
  pharmacy_review: 'Pharmacy Review',
  clarification_required: 'Clarification Required',
  accepted: 'Accepted',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/**
 * An order whose clinician authorization is saved but whose simulated pharmacy hand-off has not
 * been accepted yet (still Submitted/Awaiting Clinician with no external reference). The authorization
 * and this readiness are persisted in the same store update, so a reload mid-send leaves an order
 * that administration can send or retry.
 */
export function handoffPending(o: Pick<Order, 'status' | 'authorizedBy' | 'externalRef'>): boolean {
  return !!o.authorizedBy && !o.externalRef && (o.status === 'submitted' || o.status === 'awaiting_clinician');
}

/** Clinic-facing explanation of an order's state, aware of authorization and hand-off progress. */
export function orderHelp(o: Pick<Order, 'status' | 'authorizedBy' | 'externalRef' | 'integrationError'>): string {
  if (handoffPending(o)) return o.integrationError
    ? 'Clinician authorized. Platform administration can retry the simulated hand-off.'
    : 'Clinician authorized. Waiting for simulated pharmacy hand-off.';
  return ORDER_STATUS_HELP[o.status];
}

/** True when the clinic has a task on this order (authorization, clarification or pending cancellation). */
export function needsClinicAttention(o: Pick<Order, 'status' | 'authorizedBy' | 'cancellationRequested'>): boolean {
  return o.status === 'clarification_required' || (o.status === 'awaiting_clinician' && !o.authorizedBy) || o.cancellationRequested;
}

export const ORDER_STATUS_HELP: Record<OrderStatus, string> = {
  draft: 'Being prepared. Not visible to the pharmacy.',
  submitted: 'Request recorded on the platform. Not yet reviewed by a pharmacy.',
  awaiting_clinician: 'Prepared by staff. A clinician must review and authorize it.',
  pharmacy_review: 'Sent to the fictional pharmacy (mock adapter) for review.',
  clarification_required: 'The pharmacy needs more information before it can continue.',
  accepted: 'The pharmacy accepted the request. Nothing has shipped.',
  processing: 'The pharmacy is preparing the order.',
  shipped: 'Handed to a carrier. Not yet delivered.',
  delivered: 'Carrier reports delivery.',
  cancelled: 'Closed without fulfillment.',
};

export const STATUS_TONE: Record<OrderStatus, 'neutral' | 'info' | 'warn' | 'good' | 'bad'> = {
  draft: 'neutral', submitted: 'info', awaiting_clinician: 'warn', pharmacy_review: 'info',
  clarification_required: 'warn', accepted: 'info', processing: 'info', shipped: 'info',
  delivered: 'good', cancelled: 'bad',
};

/** Allowed manual transitions performed by platform administration (simulating pharmacy updates). */
export const ADMIN_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  submitted: ['pharmacy_review', 'cancelled'],
  pharmacy_review: ['clarification_required', 'accepted', 'cancelled'],
  clarification_required: ['pharmacy_review', 'cancelled'],
  accepted: ['processing', 'cancelled'],
  processing: ['shipped'],
  shipped: ['delivered'],
};

export const CANCELLABLE: OrderStatus[] = ['submitted', 'awaiting_clinician', 'pharmacy_review', 'clarification_required', 'accepted'];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ADMIN_TRANSITIONS[from] ?? []).includes(to);
}

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  submitted: 'Submitted',
  pending_review: 'Pending review',
  information_requested: 'Information requested',
  approved: 'Approved (demo)',
  rejected: 'Rejected',
};

export const TICKET_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  awaiting_clinic: 'Awaiting clinic',
  awaiting_support: 'Awaiting support',
  resolved: 'Resolved',
};

export const ROLE_LABEL: Record<Role, string> = {
  clinic_admin: 'Clinic administrator',
  clinician: 'Clinician',
  staff: 'Staff',
  platform_admin: 'Platform administrator',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  weight: 'Weight management',
  womens_hormones: 'Women’s hormones',
  mens_hormones: 'Men’s hormones',
  sexual_health: 'Sexual health',
  hair_derm: 'Hair and dermatology',
  wellness: 'Wellness',
};

export const TYPE_LABEL: Record<ProductType, string> = {
  patient_specific: 'Patient-specific prescription',
  office_use: 'Office-use product',
  branded: 'Branded medication',
};

export const PATHWAY_LABEL: Record<Pathway, string> = {
  ps_patient: 'Patient-specific, ship to patient',
  ps_clinic: 'Patient-specific, ship to clinic',
  office_use: 'Office-use stock, ship to clinic',
  branded: 'Branded medication via pharmacy',
};

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: 'Available',
  limited: 'Limited',
  backorder: 'Backorder',
  discontinued: 'Discontinued',
};

export const SHIPPING_LABEL: Record<ShippingRequirement, string> = {
  ambient: 'Standard, room temperature',
  cold_chain: 'Cold chain packaging',
  signature: 'Adult signature required',
};

export const DEFAULT_PERMISSIONS: Record<Role, Permissions> = {
  clinic_admin: { createDrafts: true, submitRequests: true, authorizeOrders: false, manageUsers: true, viewBilling: true },
  clinician: { createDrafts: true, submitRequests: true, authorizeOrders: true, manageUsers: false, viewBilling: false },
  staff: { createDrafts: true, submitRequests: true, authorizeOrders: false, manageUsers: false, viewBilling: false },
  platform_admin: { createDrafts: false, submitRequests: false, authorizeOrders: false, manageUsers: true, viewBilling: true },
};

/** Authorization is a clinician-only act, whatever permissions a clinic admin toggles. */
export function canAuthorize(user: User): boolean {
  return user.role === 'clinician' && user.permissions.authorizeOrders && !!user.clinicianId;
}

export function isPlatformAdmin(user: User | undefined): boolean {
  return !!user && user.role === 'platform_admin';
}

/** Tenant scoping used by every clinic-side query. A server must enforce the same rule. */
export function scopeToClinic<T extends { clinicId: string }>(user: User, rows: T[]): T[] {
  if (user.role === 'platform_admin') return rows;
  return rows.filter((r) => r.clinicId === user.clinicId);
}

export const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export interface CostBreakdown {
  medication: number;
  pharmacyFees: number;
  shipping: number;
  platformFee: number;
  total: number;
}

export function shippingFor(products: Product[], a: FinancialAssumptions): number {
  if (products.length === 0) return 0;
  if (products.some((p) => p.shipping === 'cold_chain')) return a.shippingColdChain;
  if (products.some((p) => p.shipping === 'signature')) return a.shippingSignature;
  return a.shippingAmbient;
}

export function orderCosts(order: Pick<Order, 'items'>, products: Product[], a: FinancialAssumptions): CostBreakdown {
  const medication = round(order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0));
  const pharmacyFees = round(order.items.reduce((s, i) => s + i.dispensingFee * i.quantity, 0));
  const used = order.items.map((i) => products.find((p) => p.id === i.productId)).filter(Boolean) as Product[];
  const shipping = shippingFor(used, a);
  const platformFee = order.items.length ? round(a.platformFeePerOrder + medication * (a.platformFeePct / 100)) : 0;
  return { medication, pharmacyFees, shipping, platformFee, total: round(medication + pharmacyFees + shipping + platformFee) };
}

export function round(n: number) {
  return Math.round(n * 100) / 100;
}

/** Orders that count toward value reporting: actually requested, not drafts or cancellations. */
export function countsTowardValue(o: Order) {
  return !['draft', 'cancelled'].includes(o.status);
}

export interface Financials {
  orders: number;
  totalOrderValue: number;
  passThrough: number;
  medication: number;
  pharmacyFees: number;
  shipping: number;
  platformRevenue: number;
  variableCosts: number;
  paymentProcessing: number;
  support: number;
  integration: number;
  contributionMargin: number;
  marginOnRevenuePct: number;
}

export function financials(db: Pick<Db, 'orders' | 'products'>, a: FinancialAssumptions): Financials {
  const rows = db.orders.filter(countsTowardValue);
  let medication = 0, pharmacyFees = 0, shipping = 0, platformRevenue = 0, total = 0;
  for (const o of rows) {
    const c = orderCosts(o, db.products, a);
    medication += c.medication; pharmacyFees += c.pharmacyFees; shipping += c.shipping;
    platformRevenue += c.platformFee; total += c.total;
  }
  const paymentProcessing = total * (a.paymentProcessingPct / 100);
  const support = rows.length * a.supportCostPerOrder;
  const integration = rows.length * a.integrationCostPerOrder;
  const variableCosts = paymentProcessing + support + integration;
  const contributionMargin = platformRevenue - variableCosts;
  return {
    orders: rows.length,
    totalOrderValue: round(total),
    passThrough: round(medication + pharmacyFees + shipping),
    medication: round(medication), pharmacyFees: round(pharmacyFees), shipping: round(shipping),
    platformRevenue: round(platformRevenue),
    variableCosts: round(variableCosts),
    paymentProcessing: round(paymentProcessing), support: round(support), integration: round(integration),
    contributionMargin: round(contributionMargin),
    marginOnRevenuePct: platformRevenue ? round((contributionMargin / platformRevenue) * 100) : 0,
  };
}

// ---------- Validation ----------
export type Errors = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (s: string) => EMAIL.test(s.trim());
export const US_STATES = ['AZ', 'CA', 'CO', 'FL', 'GA', 'IL', 'MA', 'NC', 'NV', 'NY', 'OR', 'TX', 'UT', 'WA'];

export interface ApplicationInput {
  practiceName: string; practiceType: string; contactName: string; email: string; phone: string;
  locationName: string; address: string; city: string; state: string; zip: string;
  clinicianName: string; clinicianCredential: string; npi: string; licenseState: string; licenseNumber: string;
  acknowledge: boolean;
}

export function validateApplication(i: ApplicationInput): Errors {
  const e: Errors = {};
  if (i.practiceName.trim().length < 3) e.practiceName = 'Enter the practice name, at least 3 characters.';
  if (!i.practiceType) e.practiceType = 'Choose the practice type.';
  if (i.contactName.trim().length < 2) e.contactName = 'Enter the administrator’s name.';
  if (!isEmail(i.email)) e.email = 'Enter an email like name@example-clinic.test.';
  if (!/^[0-9()+\-\s.]{7,}$/.test(i.phone.trim())) e.phone = 'Enter a phone number, digits only is fine.';
  if (!i.locationName.trim()) e.locationName = 'Name this location, for example “Main office”.';
  if (!i.address.trim()) e.address = 'Enter a street address.';
  if (!i.city.trim()) e.city = 'Enter a city.';
  if (!US_STATES.includes(i.state)) e.state = 'Choose a state from the list.';
  if (!/^\d{5}$/.test(i.zip.trim())) e.zip = 'Enter a 5-digit ZIP code.';
  if (i.clinicianName.trim().length < 2) e.clinicianName = 'Enter the primary clinician’s name.';
  if (!/^\d{10}$/.test(i.npi.trim())) e.npi = 'NPI must be 10 digits. Use a fictional number in this demo.';
  if (!US_STATES.includes(i.licenseState)) e.licenseState = 'Choose the license state.';
  if (!i.licenseNumber.trim()) e.licenseNumber = 'Enter a fictional license number.';
  if (!i.acknowledge) e.acknowledge = 'Confirm that every detail you entered is fictional.';
  return e;
}

/** Patient references must be obviously fictional so no real patient data enters the demo. */
export const PATIENT_REF = /^DEMO-[A-Z0-9]{3,12}$/;

export function validateOrderForSubmit(o: Order, products: Product[], locationState: string): Errors {
  const e: Errors = {};
  if (!o.locationId) e.locationId = 'Choose a ship-to location.';
  if (o.items.length === 0) e.items = 'Add at least one product.';
  for (const it of o.items) {
    const p = products.find((x) => x.id === it.productId);
    if (!p || !p.active || p.availability === 'discontinued') e.items = `${p?.name ?? 'A product'} is no longer orderable. Remove it.`;
    else if (!p.states.includes(locationState)) e.items = `${p.name} is not eligible to ship to ${locationState}. Remove it or choose another location.`;
    if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 50) e.items = 'Quantities must be whole numbers from 1 to 50.';
  }
  if (!o.pathway) e.pathway = 'Choose a fulfillment pathway.';
  else if (o.items.some((it) => !products.find((p) => p.id === it.productId)?.pathways.includes(o.pathway!)))
    e.pathway = 'One or more products cannot use this pathway. Pick another pathway or split the request.';
  if (o.pathway && o.pathway.startsWith('ps_') && !PATIENT_REF.test(o.patientRef.trim()))
    e.patientRef = 'Use a fictional reference that starts with DEMO-, for example DEMO-PT1042. Never enter real patient details.';
  if (o.poNumber && !/^[A-Za-z0-9-]{1,20}$/.test(o.poNumber)) e.poNumber = 'Use letters, numbers and dashes only, up to 20 characters.';
  return e;
}

export function pathwaysForItems(items: { productId: string }[], products: Product[]): Pathway[] {
  const all: Pathway[] = ['ps_patient', 'ps_clinic', 'office_use', 'branded'];
  return all.filter((pw) => items.every((i) => products.find((p) => p.id === i.productId)?.pathways.includes(pw)));
}
