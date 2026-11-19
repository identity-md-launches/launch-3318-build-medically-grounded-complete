// Domain model for Medically Grounded. All records in this demo are fictional.
// These types are shared by the browser demo and mirrored by server/schema.sql.

export type Role = 'clinic_admin' | 'clinician' | 'staff' | 'platform_admin';

export type VerificationStatus = 'submitted' | 'pending_review' | 'information_requested' | 'approved' | 'rejected';

export type OrderStatus =
  | 'draft'
  | 'submitted'
  | 'awaiting_clinician'
  | 'pharmacy_review'
  | 'clarification_required'
  | 'accepted'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type ProductType = 'patient_specific' | 'office_use' | 'branded';

export type Category = 'weight' | 'womens_hormones' | 'mens_hormones' | 'sexual_health' | 'hair_derm' | 'wellness';

export type Pathway = 'ps_patient' | 'ps_clinic' | 'office_use' | 'branded';

export type Availability = 'available' | 'limited' | 'backorder' | 'discontinued';

export type ShippingRequirement = 'ambient' | 'cold_chain' | 'signature';

export interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface Contact {
  name: string;
  email: string;
  phone: string;
}

export interface Clinic {
  id: string;
  name: string;
  practiceType: string;
  verification: VerificationStatus;
  verificationNote: string;
  locations: Location[];
  primaryContact: Contact;
  billingContact: Contact;
  shippingPreference: 'ship_to_clinic' | 'ship_to_patient_allowed';
  billingPreference: 'invoice_monthly' | 'card_on_file_demo';
  checklist: Record<string, boolean>;
  createdAt: string;
  approvedAt?: string;
}

export interface Clinician {
  id: string;
  clinicId: string;
  name: string;
  credential: string;
  npi: string;
  licenseState: string;
  licenseNumber: string;
  /** Demo only: never a real verification result. */
  credentialCheck: 'not_checked' | 'mock_checked';
}

export interface Permissions {
  createDrafts: boolean;
  submitRequests: boolean;
  authorizeOrders: boolean;
  manageUsers: boolean;
  viewBilling: boolean;
}

export interface User {
  id: string;
  clinicId: string | null;
  name: string;
  email: string;
  role: Role;
  clinicianId?: string;
  permissions: Permissions;
  active: boolean;
}

export interface SupportingDoc {
  title: string;
  kind: string;
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  type: ProductType;
  form: string;
  strength: string;
  packageSize: string;
  pharmacyId: string;
  pharmacyProductId: string;
  pathways: Pathway[];
  states: string[];
  availability: Availability;
  shipping: ShippingRequirement;
  unitPrice: number;
  dispensingFee: number;
  documents: SupportingDoc[];
  /** Admin only. Never rendered in clinic views. */
  supplierNotes: string;
  active: boolean;
}

export interface Pharmacy {
  id: string;
  name: string;
  kind: string;
  integrationStatus: 'mock' | 'not_connected' | 'sandbox_planned' | 'paused';
  adapter: string;
  states: string[];
  contactEmail: string;
  notes: string;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  dispensingFee: number;
}

export interface StatusEvent {
  id: string;
  at: string;
  status: OrderStatus | null;
  actor: string;
  kind: 'status' | 'note' | 'clarification' | 'cancellation_request' | 'integration' | 'edit';
  note: string;
}

export interface Order {
  id: string;
  clinicId: string;
  locationId: string;
  pathway: Pathway | null;
  items: OrderItem[];
  patientRef: string;
  poNumber: string;
  pharmacyNotes: string;
  status: OrderStatus;
  createdBy: string;
  preparedBy?: string;
  authorizedBy?: string;
  authorizedAt?: string;
  idempotencyKey: string;
  sourceOrderId?: string;
  cancellationRequested: boolean;
  integrationError?: string;
  externalRef?: string;
  trackingNumber?: string;
  events: StatusEvent[];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
}

export type TicketStatus = 'open' | 'awaiting_clinic' | 'awaiting_support' | 'resolved';

export interface TicketMessage {
  id: string;
  at: string;
  author: string;
  fromSupport: boolean;
  body: string;
}

export interface Ticket {
  id: string;
  clinicId: string;
  orderId?: string;
  subject: string;
  category: 'order' | 'account' | 'catalog' | 'billing' | 'other';
  status: TicketStatus;
  messages: TicketMessage[];
  history: { at: string; status: TicketStatus; actor: string }[];
  resolution?: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  kind: 'access_request' | 'contact' | 'partnership';
  name: string;
  organization: string;
  email: string;
  message: string;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'closed';
  clinicId?: string;
  owner: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  assignee: string;
  due: string;
  related: string;
  status: 'open' | 'done';
  notes: string[];
  createdAt: string;
}

export interface AuditRecord {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  detail: string;
}

export interface Notification {
  id: string;
  at: string;
  to: string;
  subject: string;
  body: string;
  clinicId: string | null;
}

export interface IntegrationLog {
  id: string;
  at: string;
  adapter: string;
  operation: string;
  outcome: 'mock_success' | 'mock_failure' | 'rejected_invalid' | 'duplicate_ignored' | 'retrying';
  detail: string;
}

export interface FinancialAssumptions {
  platformFeePerOrder: number;
  platformFeePct: number;
  paymentProcessingPct: number;
  supportCostPerOrder: number;
  integrationCostPerOrder: number;
  shippingAmbient: number;
  shippingColdChain: number;
  shippingSignature: number;
}

export interface Session {
  userId: string;
}

export interface Db {
  version: number;
  seq: number;
  clinics: Clinic[];
  users: User[];
  clinicians: Clinician[];
  products: Product[];
  pharmacies: Pharmacy[];
  orders: Order[];
  tickets: Ticket[];
  leads: Lead[];
  tasks: Task[];
  audit: AuditRecord[];
  notifications: Notification[];
  integrationLog: IntegrationLog[];
  favorites: Record<string, string[]>; // userId -> productIds
  assumptions: FinancialAssumptions;
  mockFailureMode: boolean;
  session: Session;
}
