// Business operations. Each mutates a Db draft passed in by the caller (see data/store.update),
// so they run identically in unit tests and in the browser. A production API would run these
// server-side after authenticating the actor and checking tenant scope.
import {
  ADMIN_TRANSITIONS, CANCELLABLE, DEFAULT_PERMISSIONS, ORDER_STATUS_LABEL, TICKET_LABEL, canAuthorize, canTransition,
  validateApplication, validateOrderForSubmit, type ApplicationInput, type Errors,
} from '../domain/rules';
import type { Db, Lead, Order, OrderStatus, Role, Ticket, TicketStatus, User, VerificationStatus } from '../domain/types';
import { createMockOrderAdapter, mockStatusWebhook, withRetry } from '../integrations/adapters';
import { getDb, update } from '../data/store';

export const now = () => new Date().toISOString();
export function nextId(d: Db, prefix: string) { d.seq += 1; return `${prefix}-${d.seq}`; }

export class ActionError extends Error {}
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new ActionError(msg); }

export function audit(d: Db, actor: string, action: string, entity: string, entityId: string, detail = '') {
  d.audit.unshift({ id: nextId(d, 'A'), at: now(), actor, action, entity, entityId, detail });
}

/** Simulated notification. Nothing is emailed; the record is shown in the portal outbox. */
export function notify(d: Db, to: string, subject: string, body: string, clinicId: string | null) {
  d.notifications.unshift({ id: nextId(d, 'N'), at: now(), to, subject, body, clinicId });
}

function event(o: Order, actor: string, status: OrderStatus | null, note: string, kind: Order['events'][number]['kind'] = 'status') {
  o.events.push({ id: `ev-${o.events.length + 1}-${Date.now().toString(36)}`, at: now(), status, actor, note, kind });
  if (status) o.status = status;
  o.updatedAt = now();
}

const clinicEmail = (d: Db, clinicId: string) => d.clinics.find((c) => c.id === clinicId)?.primaryContact.email ?? 'clinic';

function requireClinicAccess(user: User, clinicId: string) {
  assert(user.role === 'platform_admin' || user.clinicId === clinicId, 'You do not have access to this clinic.');
}
function requireAdmin(user: User) { assert(user.role === 'platform_admin', 'Only platform administrators can do this.'); }

// ---------- Public site ----------
export function submitApplication(d: Db, input: ApplicationInput): { errors: Errors; clinicId?: string } {
  const errors = validateApplication(input);
  if (d.clinics.some((c) => c.name.trim().toLowerCase() === input.practiceName.trim().toLowerCase()))
    errors.practiceName = 'An application with this practice name already exists. Contact us to update it.';
  if (Object.keys(errors).length) return { errors };
  const clinicId = nextId(d, 'cl');
  const clinicianId = nextId(d, 'cn');
  d.clinics.push({
    id: clinicId, name: input.practiceName.trim(), practiceType: input.practiceType, verification: 'submitted', verificationNote: '',
    locations: [{ id: nextId(d, 'loc'), name: input.locationName.trim(), address: input.address.trim(), city: input.city.trim(), state: input.state, zip: input.zip.trim() }],
    primaryContact: { name: input.contactName.trim(), email: input.email.trim(), phone: input.phone.trim() },
    billingContact: { name: input.contactName.trim(), email: input.email.trim(), phone: input.phone.trim() },
    shippingPreference: 'ship_to_clinic', billingPreference: 'invoice_monthly',
    checklist: { profile: true, locations: true, clinicians: true, staff: false, billing: false, firstOrder: false },
    createdAt: now(),
  });
  d.clinicians.push({ id: clinicianId, clinicId, name: input.clinicianName.trim(), credential: input.clinicianCredential || 'MD', npi: input.npi.trim(), licenseState: input.licenseState, licenseNumber: input.licenseNumber.trim(), credentialCheck: 'not_checked' });
  d.users.push({ id: nextId(d, 'u'), clinicId, name: input.contactName.trim(), email: input.email.trim(), role: 'clinic_admin', permissions: { ...DEFAULT_PERMISSIONS.clinic_admin }, active: true });
  d.users.push({ id: nextId(d, 'u'), clinicId, name: input.clinicianName.trim(), email: `clinician+${clinicId}@example.test`, role: 'clinician', clinicianId, permissions: { ...DEFAULT_PERMISSIONS.clinician }, active: true });
  d.leads.unshift({ id: nextId(d, 'L'), kind: 'access_request', name: input.contactName.trim(), organization: input.practiceName.trim(), email: input.email.trim(), message: 'Clinic application submitted from website.', status: 'new', clinicId, owner: 'Unassigned', createdAt: now() });
  audit(d, input.contactName.trim(), 'clinic.apply', 'clinic', clinicId, input.practiceName.trim());
  notify(d, input.email.trim(), 'We received your clinic application', 'Your application is in the review queue.', clinicId);
  return { errors: {}, clinicId };
}

export function submitLead(d: Db, kind: Lead['kind'], f: { name: string; organization: string; email: string; message: string }): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter an email like name@example.test.';
  if (f.message.trim().length < 10) e.message = 'Tell us a little more, at least 10 characters.';
  if (Object.keys(e).length) return e;
  d.leads.unshift({ id: nextId(d, 'L'), kind, name: f.name.trim(), organization: f.organization.trim(), email: f.email.trim(), message: f.message.trim(), status: 'new', owner: 'Unassigned', createdAt: now() });
  return {};
}

// ---------- Session (demo role switching, not authentication) ----------
export function switchUser(d: Db, userId: string) {
  assert(d.users.some((u) => u.id === userId && u.active), 'That demo user is not available.');
  d.session.userId = userId;
}

// ---------- Clinic verification ----------
export function setVerification(d: Db, admin: User, clinicId: string, status: VerificationStatus, note: string) {
  requireAdmin(admin);
  const c = d.clinics.find((x) => x.id === clinicId);
  assert(c, 'Clinic not found.');
  if ((status === 'information_requested' || status === 'rejected') && !note.trim()) throw new ActionError('Add a note explaining what the clinic should do next.');
  c.verification = status;
  c.verificationNote = status === 'approved' ? 'Demo approval. No license, NPI or DEA verification was performed.' : note.trim();
  if (status === 'approved') c.approvedAt = now();
  const lead = d.leads.find((l) => l.clinicId === clinicId);
  if (lead && status === 'approved') lead.status = 'converted';
  audit(d, admin.name, `clinic.${status}`, 'clinic', clinicId, note);
  notify(d, c.primaryContact.email, `Application status: ${status.replace('_', ' ')}`, c.verificationNote || 'Status updated.', clinicId);
}

// ---------- Favorites ----------
export function toggleFavorite(d: Db, user: User, productId: string) {
  const list = d.favorites[user.id] ?? [];
  d.favorites[user.id] = list.includes(productId) ? list.filter((p) => p !== productId) : [...list, productId];
}

// ---------- Orders ----------
function clinicApproved(d: Db, clinicId: string) {
  return d.clinics.find((c) => c.id === clinicId)?.verification === 'approved';
}

export function createDraft(d: Db, user: User, clinicId: string): Order {
  requireClinicAccess(user, clinicId);
  assert(user.permissions.createDrafts, 'Your role cannot create order drafts.');
  assert(clinicApproved(d, clinicId), 'Orders open once the clinic application is approved.');
  const c = d.clinics.find((x) => x.id === clinicId)!;
  const id = `MG-${(d.seq += 1)}`;
  const o: Order = {
    id, clinicId, locationId: c.locations[0]?.id ?? '', pathway: null, items: [], patientRef: '', poNumber: '', pharmacyNotes: '',
    status: 'draft', createdBy: user.name, preparedBy: user.name, idempotencyKey: `${id}-${Math.random().toString(36).slice(2, 10)}`,
    cancellationRequested: false, events: [], createdAt: now(), updatedAt: now(),
  };
  event(o, user.name, 'draft', 'Draft created');
  d.orders.unshift(o);
  audit(d, user.name, 'order.draft', 'order', id);
  return o;
}

export function updateDraft(d: Db, user: User, orderId: string, patch: Partial<Pick<Order, 'locationId' | 'pathway' | 'items' | 'patientRef' | 'poNumber' | 'pharmacyNotes'>>) {
  const o = d.orders.find((x) => x.id === orderId);
  assert(o, 'Order not found.');
  requireClinicAccess(user, o.clinicId);
  assert(o.status === 'draft', 'Only drafts can be edited.');
  Object.assign(o, patch);
  o.updatedAt = now();
}

/** Staff and admins submit for clinician review. A clinician's own submission is also their authorization. */
export function submitOrder(d: Db, user: User, orderId: string): { errors: Errors; duplicate?: boolean; needsSend?: boolean } {
  const o = d.orders.find((x) => x.id === orderId);
  assert(o, 'Order not found.');
  requireClinicAccess(user, o.clinicId);
  if (o.status !== 'draft') return { errors: {}, duplicate: true };
  assert(user.permissions.submitRequests, 'Your role cannot submit requests.');
  const clinic = d.clinics.find((c) => c.id === o.clinicId)!;
  const loc = clinic.locations.find((l) => l.id === o.locationId);
  const errors = validateOrderForSubmit(o, d.products, loc?.state ?? '');
  if (Object.keys(errors).length) return { errors };
  // Reprice from the current catalog at submission.
  o.items = o.items.map((i) => { const p = d.products.find((x) => x.id === i.productId)!; return { ...i, unitPrice: p.unitPrice, dispensingFee: p.dispensingFee }; });
  o.submittedAt = now();
  event(o, user.name, 'submitted', 'Request submitted on the platform. Not a prescription.');
  audit(d, user.name, 'order.submit', 'order', o.id);
  if (canAuthorize(user)) {
    o.authorizedBy = user.name; o.authorizedAt = now();
    event(o, user.name, null, 'Clinician reviewed and authorized the request', 'note');
    return { errors: {}, needsSend: true };
  }
  event(o, 'System', 'awaiting_clinician', 'Waiting for clinician authorization');
  notify(d, clinicEmail(d, o.clinicId), `${o.id} needs clinician authorization`, 'A staff-prepared request is waiting for a clinician.', o.clinicId);
  return { errors: {} };
}

export function authorizeOrder(d: Db, user: User, orderId: string) {
  const o = d.orders.find((x) => x.id === orderId);
  assert(o, 'Order not found.');
  requireClinicAccess(user, o.clinicId);
  assert(canAuthorize(user), 'Only a clinician can authorize a request.');
  assert(o.status === 'awaiting_clinician', 'This request is not waiting for authorization.');
  o.authorizedBy = user.name; o.authorizedAt = now();
  event(o, user.name, 'submitted', 'Clinician reviewed and authorized the request');
  audit(d, user.name, 'order.authorize', 'order', o.id);
}

export function returnToDraft(d: Db, user: User, orderId: string, note: string) {
  const o = d.orders.find((x) => x.id === orderId);
  assert(o, 'Order not found.');
  requireClinicAccess(user, o.clinicId);
  assert(canAuthorize(user), 'Only a clinician can return a request for edits.');
  assert(o.status === 'awaiting_clinician', 'Only requests awaiting a clinician can be returned.');
  event(o, user.name, 'draft', note.trim() || 'Returned to staff for edits');
}

const inflight = new Set<string>();

/** Sends an authorized order through the (mock) order adapter with retries and duplicate protection. */
export async function sendToPharmacy(orderId: string, opts = { retries: 2, baseMs: 150 }): Promise<{ ok: boolean; error?: string }> {
  if (inflight.has(orderId)) {
    update((d) => d.integrationLog.unshift({ id: nextId(d, 'I'), at: now(), adapter: 'MockOrderSubmissionAdapter', operation: 'submit', outcome: 'duplicate_ignored', detail: `${orderId} already in flight` }));
    return { ok: false, error: 'Already sending' };
  }
  const order = getDb().orders.find((o) => o.id === orderId);
  if (!order || order.status !== 'submitted' || !order.authorizedBy) return { ok: false, error: 'Order is not ready to send.' };
  inflight.add(orderId);
  try {
    const adapter = createMockOrderAdapter(() => getDb().mockFailureMode);
    const res = await withRetry((attempt) => adapter.submit(order, order.idempotencyKey + (attempt ? '' : '')), {
      ...opts,
      onRetry: (attempt, error) => update((d) => d.integrationLog.unshift({ id: nextId(d, 'I'), at: now(), adapter: adapter.name, operation: 'submit', outcome: 'retrying', detail: `${orderId} attempt ${attempt} failed: ${error}` })),
    });
    update((d) => {
      const o = d.orders.find((x) => x.id === orderId)!;
      if (res.ok) {
        o.externalRef = res.data!.externalRef; o.integrationError = undefined;
        const ph = d.pharmacies.find((p) => p.id === d.products.find((x) => x.id === o.items[0]?.productId)?.pharmacyId);
        event(o, ph?.name ?? 'Mock pharmacy', 'pharmacy_review', `Mock adapter accepted the hand-off (ref ${o.externalRef}). Simulated, no real pharmacy contacted.`);
        d.integrationLog.unshift({ id: nextId(d, 'I'), at: now(), adapter: adapter.name, operation: 'submit', outcome: 'mock_success', detail: `${orderId} in ${res.attempts} attempt(s)` });
        notify(d, clinicEmail(d, o.clinicId), `${o.id} is in pharmacy review`, 'Simulated hand-off to a fictional pharmacy.', o.clinicId);
      } else {
        o.integrationError = res.error;
        event(o, 'System', null, `Hand-off failed after ${res.attempts} attempts: ${res.error}. Platform support will retry.`, 'integration');
        d.integrationLog.unshift({ id: nextId(d, 'I'), at: now(), adapter: adapter.name, operation: 'submit', outcome: 'mock_failure', detail: `${orderId}: ${res.error}` });
      }
    });
    return { ok: res.ok, error: res.error };
  } finally {
    inflight.delete(orderId);
  }
}

export function requestCancellation(d: Db, user: User, orderId: string, reason: string) {
  const o = d.orders.find((x) => x.id === orderId);
  assert(o, 'Order not found.');
  requireClinicAccess(user, o.clinicId);
  if (o.status === 'draft') { event(o, user.name, 'cancelled', 'Draft discarded'); return; }
  assert(CANCELLABLE.includes(o.status), `A ${ORDER_STATUS_LABEL[o.status]} order can no longer be cancelled. Open a support ticket instead.`);
  assert(!o.cancellationRequested, 'A cancellation request is already pending.');
  assert(reason.trim().length >= 5, 'Give a short reason for the cancellation request.');
  o.cancellationRequested = true;
  event(o, user.name, null, `Cancellation requested: ${reason.trim()}`, 'cancellation_request');
  audit(d, user.name, 'order.cancel_request', 'order', o.id, reason);
}

export function resolveCancellation(d: Db, admin: User, orderId: string, approve: boolean) {
  requireAdmin(admin);
  const o = d.orders.find((x) => x.id === orderId);
  assert(o && o.cancellationRequested, 'No pending cancellation request.');
  o.cancellationRequested = false;
  if (approve) event(o, admin.name, 'cancelled', 'Cancellation approved by platform administration');
  else event(o, admin.name, null, 'Cancellation declined: the pharmacy has already started work', 'note');
  audit(d, admin.name, approve ? 'order.cancel' : 'order.cancel_decline', 'order', o.id);
  notify(d, clinicEmail(d, o.clinicId), `${o.id} cancellation ${approve ? 'approved' : 'declined'}`, '', o.clinicId);
}

export function adminSetStatus(d: Db, admin: User, orderId: string, to: OrderStatus, note: string) {
  requireAdmin(admin);
  const o = d.orders.find((x) => x.id === orderId);
  assert(o, 'Order not found.');
  assert(canTransition(o.status, to), `Cannot move from ${ORDER_STATUS_LABEL[o.status]} to ${ORDER_STATUS_LABEL[to]}.`);
  if (to === 'clarification_required') assert(note.trim().length >= 5, 'Say what the clinic needs to clarify.');
  if (to === 'shipped') o.trackingNumber = `MOCKTRK${o.id.replace(/\D/g, '')}`;
  const defaultNote = to === 'shipped' ? `Simulated shipment, mock tracking ${o.trackingNumber}` : `Simulated pharmacy update: ${ORDER_STATUS_LABEL[to]}`;
  event(o, admin.name, to, note.trim() || defaultNote, to === 'clarification_required' ? 'clarification' : 'status');
  audit(d, admin.name, 'order.status', 'order', o.id, `${to}${note ? ': ' + note : ''}`);
  notify(d, clinicEmail(d, o.clinicId), `${o.id} is now ${ORDER_STATUS_LABEL[to]}`, note, o.clinicId);
}

export function respondClarification(d: Db, user: User, orderId: string, note: string) {
  const o = d.orders.find((x) => x.id === orderId);
  assert(o, 'Order not found.');
  requireClinicAccess(user, o.clinicId);
  assert(o.status === 'clarification_required', 'This order is not waiting for clarification.');
  assert(note.trim().length >= 5, 'Write a response of at least 5 characters.');
  event(o, user.name, 'pharmacy_review', `Clinic response: ${note.trim()}`, 'clarification');
}

/** Copies a previous order into a new draft priced from today's catalog. It always needs fresh review. */
export function reorder(d: Db, user: User, orderId: string): { order: Order; removed: string[] } {
  const src = d.orders.find((x) => x.id === orderId);
  assert(src, 'Order not found.');
  requireClinicAccess(user, src.clinicId);
  const o = createDraft(d, user, src.clinicId);
  const loc = d.clinics.find((c) => c.id === src.clinicId)!.locations.find((l) => l.id === src.locationId);
  const removed: string[] = [];
  o.items = src.items.flatMap((i) => {
    const p = d.products.find((x) => x.id === i.productId);
    if (!p || !p.active || p.availability === 'discontinued' || (loc && !p.states.includes(loc.state))) { removed.push(p?.name ?? i.productId); return []; }
    return [{ productId: p.id, quantity: i.quantity, unitPrice: p.unitPrice, dispensingFee: p.dispensingFee }];
  });
  o.locationId = src.locationId; o.pathway = src.pathway; o.sourceOrderId = src.id; o.poNumber = '';
  o.patientRef = '';
  o.events[0].note = `Draft created from ${src.id}. Prices refreshed; needs fresh clinician review.${removed.length ? ' Removed: ' + removed.join(', ') : ''}`;
  return { order: o, removed };
}

// ---------- Support ----------
export function createTicket(d: Db, user: User, f: { subject: string; category: Ticket['category']; orderId?: string; body: string }): { errors: Errors; id?: string } {
  const e: Errors = {};
  assert(user.clinicId, 'Only clinic users open tickets in this demo.');
  if (f.subject.trim().length < 4) e.subject = 'Write a subject of at least 4 characters.';
  if (f.body.trim().length < 10) e.body = 'Describe the question in at least 10 characters.';
  if (f.orderId && !d.orders.some((o) => o.id === f.orderId && o.clinicId === user.clinicId)) e.orderId = 'Choose one of your clinic’s orders.';
  if (Object.keys(e).length) return { errors: e };
  const id = `T-${(d.seq += 1)}`;
  d.tickets.unshift({
    id, clinicId: user.clinicId, orderId: f.orderId || undefined, subject: f.subject.trim(), category: f.category, status: 'open',
    messages: [{ id: 'm1', at: now(), author: user.name, fromSupport: false, body: f.body.trim() }],
    history: [{ at: now(), status: 'open', actor: user.name }], createdAt: now(),
  });
  notify(d, 'support@medicallygrounded.example', `New ticket ${id}`, f.subject, user.clinicId);
  return { errors: {}, id };
}

function setTicketStatus(t: Ticket, s: TicketStatus, actor: string) {
  if (t.status !== s) { t.status = s; t.history.push({ at: now(), status: s, actor }); }
}

export function replyTicket(d: Db, user: User, ticketId: string, body: string) {
  const t = d.tickets.find((x) => x.id === ticketId);
  assert(t, 'Ticket not found.');
  requireClinicAccess(user, t.clinicId);
  assert(body.trim().length >= 2, 'Write a reply before sending.');
  const fromSupport = user.role === 'platform_admin';
  t.messages.push({ id: `m${t.messages.length + 1}`, at: now(), author: user.name, fromSupport, body: body.trim() });
  setTicketStatus(t, fromSupport ? 'awaiting_clinic' : 'awaiting_support', user.name);
  if (fromSupport) notify(d, clinicEmail(d, t.clinicId), `Reply on ${t.id}`, body.trim(), t.clinicId);
}

export function resolveTicket(d: Db, user: User, ticketId: string, resolution: string) {
  const t = d.tickets.find((x) => x.id === ticketId);
  assert(t, 'Ticket not found.');
  requireClinicAccess(user, t.clinicId);
  assert(resolution.trim().length >= 4, 'Summarize the resolution in a few words.');
  t.resolution = resolution.trim();
  setTicketStatus(t, 'resolved', user.name);
  audit(d, user.name, 'ticket.resolve', 'ticket', t.id, resolution);
  notify(d, clinicEmail(d, t.clinicId), `${t.id} resolved`, resolution.trim(), t.clinicId);
}

export function reopenTicket(d: Db, user: User, ticketId: string) {
  const t = d.tickets.find((x) => x.id === ticketId);
  assert(t, 'Ticket not found.');
  requireClinicAccess(user, t.clinicId);
  setTicketStatus(t, 'open', user.name);
}

export { TICKET_LABEL };

// ---------- Clinic team ----------
export function addTeamMember(d: Db, user: User, f: { name: string; email: string; role: Exclude<Role, 'platform_admin'>; npi?: string; licenseState?: string; licenseNumber?: string }): Errors {
  assert(user.clinicId || user.role === 'platform_admin', 'No clinic.');
  assert(user.permissions.manageUsers, 'Only clinic administrators can manage the team.');
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = 'Enter a name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter an email like name@example.test.';
  if (d.users.some((u) => u.email.toLowerCase() === f.email.trim().toLowerCase())) e.email = 'Someone already uses this email.';
  if (f.role === 'clinician') {
    if (!/^\d{10}$/.test(f.npi ?? '')) e.npi = 'NPI must be 10 digits (fictional).';
    if (!f.licenseNumber?.trim()) e.licenseNumber = 'Enter a fictional license number.';
  }
  if (Object.keys(e).length) return e;
  const clinicId = user.clinicId!;
  let clinicianId: string | undefined;
  if (f.role === 'clinician') {
    clinicianId = nextId(d, 'cn');
    d.clinicians.push({ id: clinicianId, clinicId, name: f.name.trim(), credential: 'Clinician', npi: f.npi!, licenseState: f.licenseState || 'CA', licenseNumber: f.licenseNumber!.trim(), credentialCheck: 'not_checked' });
  }
  d.users.push({ id: nextId(d, 'u'), clinicId, name: f.name.trim(), email: f.email.trim(), role: f.role, clinicianId, permissions: { ...DEFAULT_PERMISSIONS[f.role] }, active: true });
  const c = d.clinics.find((x) => x.id === clinicId);
  if (c) c.checklist.staff = true;
  audit(d, user.name, 'user.add', 'user', f.email, f.role);
  return {};
}

export function setPermission(d: Db, user: User, targetId: string, key: keyof User['permissions'], value: boolean) {
  assert(user.permissions.manageUsers, 'Only administrators can change permissions.');
  const t = d.users.find((u) => u.id === targetId);
  assert(t && (user.role === 'platform_admin' || t.clinicId === user.clinicId), 'User not found in your clinic.');
  assert(!(key === 'authorizeOrders' && value && t.role !== 'clinician'), 'Only clinicians can authorize requests.');
  t.permissions[key] = value;
  audit(d, user.name, 'user.permission', 'user', t.id, `${key}=${value}`);
}

export function applyWebhook(d: Db, payload: { status: string; ref: string }): string {
  const parsed = mockStatusWebhook.parse(payload);
  if (!parsed.ok) {
    d.integrationLog.unshift({ id: nextId(d, 'I'), at: now(), adapter: mockStatusWebhook.name, operation: 'webhook', outcome: 'rejected_invalid', detail: parsed.error! });
    return parsed.error!;
  }
  const o = d.orders.find((x) => x.id === parsed.data!.ref);
  if (!o) { d.integrationLog.unshift({ id: nextId(d, 'I'), at: now(), adapter: mockStatusWebhook.name, operation: 'webhook', outcome: 'rejected_invalid', detail: `No order ${payload.ref}` }); return `No order ${payload.ref}`; }
  const to = parsed.data!.status;
  if (o.status === to) { d.integrationLog.unshift({ id: nextId(d, 'I'), at: now(), adapter: mockStatusWebhook.name, operation: 'webhook', outcome: 'duplicate_ignored', detail: `${o.id} already ${to}` }); return 'Duplicate event ignored'; }
  if (!(ADMIN_TRANSITIONS[o.status] ?? []).includes(to)) { d.integrationLog.unshift({ id: nextId(d, 'I'), at: now(), adapter: mockStatusWebhook.name, operation: 'webhook', outcome: 'rejected_invalid', detail: `${o.id}: ${o.status} → ${to} not allowed` }); return `Out-of-order event rejected: ${ORDER_STATUS_LABEL[o.status]} cannot become ${ORDER_STATUS_LABEL[to]}`; }
  if (to === 'shipped') o.trackingNumber = `MOCKTRK${o.id.replace(/\D/g, '')}`;
  event(o, 'Mock webhook', to, `Mock webhook “${payload.status}” mapped to ${ORDER_STATUS_LABEL[to]}`);
  d.integrationLog.unshift({ id: nextId(d, 'I'), at: now(), adapter: mockStatusWebhook.name, operation: 'webhook', outcome: 'mock_success', detail: `${o.id} → ${to}` });
  return `Applied: ${o.id} is now ${ORDER_STATUS_LABEL[to]}`;
}
