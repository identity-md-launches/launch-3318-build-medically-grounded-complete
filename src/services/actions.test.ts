import { beforeEach, describe, expect, it } from 'vitest';
import { seedDb } from '../data/seed';
import { getDb, resetDemo, update } from '../data/store';
import { canTransition, financials, orderCosts, scopeToClinic, validateOrderForSubmit } from '../domain/rules';
import type { Db } from '../domain/types';
import { mockLatency, PHARMACY_STATUS_MAP, withRetry } from '../integrations/adapters';
import * as A from './actions';

const user = (d: Db, id: string) => d.users.find((u) => u.id === id)!;
const app = {
  practiceName: 'Test Ridge Clinic', practiceType: 'Med spa', contactName: 'Pat Example', email: 'pat@ridge.example', phone: '555-0199',
  locationName: 'Main', address: '1 Test St', city: 'Denver', state: 'CO', zip: '80202', clinicianName: 'Lee Example', clinicianCredential: 'MD',
  npi: '0000000999', licenseState: 'CO', licenseNumber: 'DEMO-1', acknowledge: true,
};

beforeEach(() => { resetDemo(); mockLatency.ms = 1; });

describe('clinic application and approval', () => {
  it('rejects invalid input with field messages', () => {
    const d = seedDb();
    const r = A.submitApplication(d, { ...app, email: 'nope', npi: '12', zip: 'abc', acknowledge: false });
    expect(Object.keys(r.errors).sort()).toEqual(['acknowledge', 'email', 'npi', 'zip']);
  });
  it('creates clinic, users, lead; blocks duplicates; approval enables drafts', () => {
    const d = seedDb();
    const r = A.submitApplication(d, app);
    expect(r.clinicId).toBeTruthy();
    expect(d.clinics.find((c) => c.id === r.clinicId)!.verification).toBe('submitted');
    expect(A.submitApplication(d, app).errors.practiceName).toMatch(/already exists/);
    const admin = d.users.find((u) => u.clinicId === r.clinicId && u.role === 'clinic_admin')!;
    expect(() => A.createDraft(d, admin, r.clinicId!)).toThrow(/approved/);
    expect(() => A.setVerification(d, admin, r.clinicId!, 'approved', '')).toThrow(/platform administrators/);
    A.setVerification(d, user(d, 'u-admin'), r.clinicId!, 'approved', '');
    expect(d.clinics.find((c) => c.id === r.clinicId)!.verificationNote).toMatch(/No license/);
    expect(A.createDraft(d, admin, r.clinicId!).status).toBe('draft');
  });
  it('requires a note to request information or reject', () => {
    const d = seedDb();
    expect(() => A.setVerification(d, user(d, 'u-admin'), 'cl-cedar', 'rejected', '')).toThrow(/note/);
  });
});

describe('order workflow', () => {
  it('separates staff preparation from clinician authorization and protects duplicates', async () => {
    let id = '';
    update((d) => {
      const staff = user(d, 'u-harbor-staff');
      const o = A.createDraft(d, staff, 'cl-harbor'); id = o.id;
      A.updateDraft(d, staff, id, { items: [{ productId: 'prd-003', quantity: 2, unitPrice: 0, dispensingFee: 0 }], pathway: 'ps_patient', patientRef: 'John Smith' });
      expect(A.submitOrder(d, staff, id).errors.patientRef).toMatch(/DEMO-/);
      A.updateDraft(d, staff, id, { patientRef: 'DEMO-PT9' });
      const r = A.submitOrder(d, staff, id);
      expect(r.errors).toEqual({});
      expect(r.needsSend).toBeFalsy();
      expect(A.submitOrder(d, staff, id).duplicate).toBe(true);
      expect(() => A.authorizeOrder(d, staff, id)).toThrow(/clinician/);
      expect(() => A.authorizeOrder(d, user(d, 'u-summit-md'), id)).toThrow(/access/);
      A.authorizeOrder(d, user(d, 'u-harbor-np'), id);
    });
    const [a, b] = await Promise.all([A.sendToPharmacy(id), A.sendToPharmacy(id)]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    const o = getDb().orders.find((x) => x.id === id)!;
    expect(o.status).toBe('pharmacy_review');
    expect(o.events.map((e) => e.status).filter(Boolean)).toEqual(['draft', 'submitted', 'awaiting_clinician', 'pharmacy_review']);
    expect(o.events.filter((e) => e.status === 'submitted').length).toBe(1);
    expect(o.events.some((e) => e.kind === 'note' && /authorized/.test(e.note))).toBe(true);
    expect(getDb().orders.filter((x) => x.id === id).length).toBe(1);
    expect(getDb().integrationLog.some((l) => l.outcome === 'duplicate_ignored')).toBe(true);
  });
  it('retries then records a failure when the mock endpoint fails', async () => {
    let id = '';
    update((d) => {
      d.mockFailureMode = true;
      const np = user(d, 'u-harbor-np');
      id = A.createDraft(d, np, 'cl-harbor').id;
      A.updateDraft(d, np, id, { items: [{ productId: 'prd-016', quantity: 1, unitPrice: 0, dispensingFee: 0 }], pathway: 'office_use' });
      expect(A.submitOrder(d, np, id).needsSend).toBe(true);
    });
    const r = await A.sendToPharmacy(id, { retries: 2, baseMs: 1 });
    expect(r.ok).toBe(false);
    const o = getDb().orders.find((x) => x.id === id)!;
    expect(o.status).toBe('submitted');
    expect(o.integrationError).toMatch(/timed out/);
    expect(getDb().integrationLog.filter((l) => l.outcome === 'retrying').length).toBe(2);
    update((d) => { d.mockFailureMode = false; });
    expect((await A.sendToPharmacy(id, { retries: 0, baseMs: 1 })).ok).toBe(true);
  });
  it('blocks ineligible states and enforces transitions', () => {
    const d = seedDb();
    const o = { ...d.orders[0], status: 'draft' as const, locationId: 'loc-harbor-2', items: [{ productId: 'prd-009', quantity: 1, unitPrice: 1, dispensingFee: 1 }], pathway: 'ps_clinic' as const };
    expect(validateOrderForSubmit(o, d.products, 'GA').items).toMatch(/not eligible/);
    expect(canTransition('submitted', 'delivered')).toBe(false);
    expect(canTransition('shipped', 'delivered')).toBe(true);
    expect(() => A.adminSetStatus(d, user(d, 'u-admin'), 'MG-1038', 'accepted', '')).toThrow(/Cannot move/);
    A.adminSetStatus(d, user(d, 'u-admin'), 'MG-1038', 'delivered', '');
    expect(d.orders.find((x) => x.id === 'MG-1038')!.status).toBe('delivered');
  });
  it('reorder creates a fresh draft that needs review', () => {
    const d = seedDb();
    const { order } = A.reorder(d, user(d, 'u-harbor-staff'), 'MG-1038');
    expect(order.status).toBe('draft');
    expect(order.sourceOrderId).toBe('MG-1038');
    expect(order.authorizedBy).toBeUndefined();
    expect(order.patientRef).toBe('');
  });
  it('cancellation requires admin approval except for drafts', () => {
    const d = seedDb();
    const staff = user(d, 'u-harbor-staff');
    A.requestCancellation(d, staff, 'MG-1039', 'No longer needed');
    expect(d.orders.find((o) => o.id === 'MG-1039')!.status).toBe('clarification_required');
    A.resolveCancellation(d, user(d, 'u-admin'), 'MG-1039', true);
    expect(d.orders.find((o) => o.id === 'MG-1039')!.status).toBe('cancelled');
    expect(() => A.requestCancellation(d, staff, 'MG-1038', 'too late')).toThrow(/no longer be cancelled/);
  });
});

describe('tenant scoping, support, webhooks, financials', () => {
  it('scopes clinic users to their own records', () => {
    const d = seedDb();
    expect(scopeToClinic(user(d, 'u-summit-admin'), d.orders).map((o) => o.id)).toEqual(['MG-1040']);
    expect(() => A.replyTicket(d, user(d, 'u-summit-admin'), 'T-501', 'hello')).toThrow(/access/);
  });
  it('runs a ticket through reply and resolution', () => {
    const d = seedDb();
    const r = A.createTicket(d, user(d, 'u-harbor-staff'), { subject: 'Where is it', category: 'order', orderId: 'MG-1038', body: 'Checking on delivery timing.' });
    A.replyTicket(d, user(d, 'u-admin'), r.id!, 'Mock tracking shows in transit.');
    expect(d.tickets.find((t) => t.id === r.id)!.status).toBe('awaiting_clinic');
    A.resolveTicket(d, user(d, 'u-admin'), r.id!, 'Answered');
    expect(d.tickets.find((t) => t.id === r.id)!.history.map((h) => h.status)).toEqual(['open', 'awaiting_clinic', 'resolved']);
    expect(A.createTicket(d, user(d, 'u-summit-admin'), { subject: 'xxxx', category: 'order', orderId: 'MG-1038', body: 'not my order at all' }).errors.orderId).toBeTruthy();
  });
  it('maps webhooks and rejects unknown or out-of-order events', () => {
    const d = seedDb();
    expect(PHARMACY_STATUS_MAP.NEEDS_INFO).toBe('clarification_required');
    expect(A.applyWebhook(d, { ref: 'MG-1039', status: 'BOGUS' })).toMatch(/Unknown/);
    expect(A.applyWebhook(d, { ref: 'MG-1039', status: 'DELIVERED' })).toMatch(/Out-of-order/);
    expect(A.applyWebhook(d, { ref: 'MG-1039', status: 'RECEIVED' })).toMatch(/Applied/);
    expect(A.applyWebhook(d, { ref: 'MG-1039', status: 'RECEIVED' })).toMatch(/Duplicate/);
  });
  it('keeps order value, pass-through, revenue and margin distinct', () => {
    const d = seedDb();
    const f = financials(d, d.assumptions);
    expect(f.totalOrderValue).toBeCloseTo(f.passThrough + f.platformRevenue, 2);
    expect(f.contributionMargin).toBeCloseTo(f.platformRevenue - f.variableCosts, 2);
    expect(f.contributionMargin).toBeLessThan(f.totalOrderValue);
    const c = orderCosts(d.orders[0], d.products, d.assumptions);
    expect(c.shipping).toBe(d.assumptions.shippingColdChain);
  });
  it('withRetry stops on non-retryable errors', async () => {
    let n = 0;
    const r = await withRetry(async () => { n++; return { ok: false, mode: 'mock' as const, error: 'bad', retryable: false }; }, { retries: 3, baseMs: 1 });
    expect(n).toBe(1); expect(r.attempts).toBe(1);
  });
});
