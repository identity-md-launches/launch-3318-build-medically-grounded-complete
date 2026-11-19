// Seed data. Every clinic, person, product, pharmacy, price and identifier here is fictional.
import { DEFAULT_PERMISSIONS } from '../domain/rules';
import type { Category, Db, Order, Pathway, Product, ProductType, ShippingRequirement, Availability } from '../domain/types';

export const DB_VERSION = 3;

const t = (daysAgo: number, h = 10) => {
  const d = new Date('2026-11-18T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(h);
  return d.toISOString();
};

const ALL = ['AZ', 'CA', 'CO', 'FL', 'GA', 'IL', 'MA', 'NC', 'NV', 'NY', 'OR', 'TX', 'UT', 'WA'];
const WEST = ['AZ', 'CA', 'CO', 'NV', 'OR', 'UT', 'WA'];
const EAST = ['FL', 'GA', 'MA', 'NC', 'NY', 'IL', 'TX'];

type P = [string, Category, ProductType, string, string, string, string, Pathway[], string[], Availability, ShippingRequirement, number, number];
const rows: P[] = [
  ['Avelon peptide vial', 'weight', 'patient_specific', 'Injectable vial', '2.5 mg/mL', '1 × 2 mL vial', 'ph-northwind', ['ps_patient', 'ps_clinic'], ALL, 'available', 'cold_chain', 189, 18],
  ['Avelon peptide vial, extended', 'weight', 'patient_specific', 'Injectable vial', '5 mg/mL', '1 × 2 mL vial', 'ph-northwind', ['ps_patient', 'ps_clinic'], WEST, 'limited', 'cold_chain', 249, 18],
  ['Tavira metabolic capsule', 'weight', 'patient_specific', 'Capsule', '100 mg', '30 capsules', 'ph-larkspur', ['ps_patient', 'ps_clinic'], ALL, 'available', 'ambient', 64, 9],
  ['Corvana pen', 'weight', 'branded', 'Prefilled pen', '1 mg per dose', '4 pens', 'ph-cobalt', ['branded'], ALL, 'backorder', 'cold_chain', 910, 25],
  ['Estrelle cream', 'womens_hormones', 'patient_specific', 'Topical cream', '0.5 mg/g', '30 g pump', 'ph-larkspur', ['ps_patient', 'ps_clinic'], ALL, 'available', 'ambient', 58, 9],
  ['Progyra capsule', 'womens_hormones', 'patient_specific', 'Capsule', '100 mg', '30 capsules', 'ph-larkspur', ['ps_patient', 'ps_clinic'], EAST, 'available', 'ambient', 42, 9],
  ['Estrelle troche', 'womens_hormones', 'patient_specific', 'Troche', '1 mg', '30 troches', 'ph-northwind', ['ps_patient'], ALL, 'limited', 'ambient', 71, 12],
  ['Andrion injectable', 'mens_hormones', 'patient_specific', 'Injectable vial', '200 mg/mL', '1 × 10 mL vial', 'ph-northwind', ['ps_patient', 'ps_clinic'], ALL, 'available', 'signature', 96, 15],
  ['Andrion cream', 'mens_hormones', 'patient_specific', 'Topical cream', '100 mg/g', '30 g pump', 'ph-larkspur', ['ps_patient', 'ps_clinic'], WEST, 'available', 'signature', 84, 12],
  ['Gonavel vial', 'mens_hormones', 'patient_specific', 'Injectable vial', '5000 units', '1 vial kit', 'ph-northwind', ['ps_patient', 'ps_clinic'], ALL, 'backorder', 'cold_chain', 132, 18],
  ['Vireo tablet', 'sexual_health', 'patient_specific', 'Tablet', '20 mg', '30 tablets', 'ph-larkspur', ['ps_patient', 'ps_clinic'], ALL, 'available', 'ambient', 39, 7],
  ['Vireo dissolving tablet', 'sexual_health', 'patient_specific', 'Orally dissolving tablet', '10 mg', '30 tablets', 'ph-larkspur', ['ps_patient'], EAST, 'available', 'ambient', 48, 7],
  ['Folivane topical solution', 'hair_derm', 'patient_specific', 'Topical solution', '5%', '60 mL bottle', 'ph-larkspur', ['ps_patient', 'ps_clinic'], ALL, 'available', 'ambient', 44, 8],
  ['Dermaluxe brightening cream', 'hair_derm', 'patient_specific', 'Cream', '4%', '30 g tube', 'ph-northwind', ['ps_patient', 'ps_clinic'], ALL, 'limited', 'ambient', 52, 8],
  ['Clinic-pack topical base', 'hair_derm', 'office_use', 'Topical cream', '23/7 blend', '6 × 30 g jars', 'ph-northwind', ['office_use'], WEST, 'available', 'ambient', 168, 0],
  ['Lumora vitamin injectable', 'wellness', 'office_use', 'Injectable vial', '1000 mcg/mL', '10 × 1 mL vials', 'ph-northwind', ['office_use'], ALL, 'available', 'cold_chain', 120, 0],
  ['Restiva amino blend', 'wellness', 'office_use', 'Injectable vial', 'Blend', '10 × 10 mL vials', 'ph-larkspur', ['office_use'], ALL, 'available', 'cold_chain', 210, 0],
  ['Lumora nasal spray', 'wellness', 'patient_specific', 'Nasal spray', '500 mcg/spray', '15 mL bottle', 'ph-larkspur', ['ps_patient', 'ps_clinic'], ALL, 'discontinued', 'ambient', 66, 8],
];

export const seedProducts = (): Product[] =>
  rows.map((r, i) => ({
    id: `prd-${String(i + 1).padStart(3, '0')}`,
    name: `${r[0]} (demo)`,
    category: r[1], type: r[2], form: r[3], strength: r[4], packageSize: r[5], pharmacyId: r[6],
    pharmacyProductId: `${r[6] === 'ph-northwind' ? 'NWX' : r[6] === 'ph-larkspur' ? 'LKS' : 'CBD'}-${4100 + i * 7}`,
    pathways: r[7], states: r[8], availability: r[9], shipping: r[10], unitPrice: r[11], dispensingFee: r[12],
    documents: [
      { title: 'Fictional product information sheet', kind: 'Fictional demo document' },
      ...(r[2] !== 'office_use' ? [{ title: 'Fictional pharmacy intake requirements', kind: 'Fictional demo document' }] : []),
    ],
    supplierNotes: 'Fictional contract terms. Pass-through pricing; no platform markup on medication.',
    active: true,
  }));

const ev = (id: string, at: string, status: Order['status'] | null, actor: string, note: string, kind: Order['events'][number]['kind'] = 'status') =>
  ({ id, at, status, actor, note, kind });

export function seedDb(): Db {
  const products = seedProducts();
  const P = (id: string) => products.find((p) => p.id === id)!;
  const item = (id: string, q: number) => ({ productId: id, quantity: q, unitPrice: P(id).unitPrice, dispensingFee: P(id).dispensingFee });
  return {
    version: DB_VERSION,
    seq: 1040,
    clinics: [
      {
        id: 'cl-harbor', name: 'Harbor Lane Aesthetics', practiceType: 'Med spa', verification: 'approved',
        verificationNote: 'Demo approval. No license, NPI or DEA verification was performed.',
        locations: [
          { id: 'loc-harbor-1', name: 'Harbor Lane, Main office', address: '100 Example Way', city: 'San Diego', state: 'CA', zip: '92101' },
          { id: 'loc-harbor-2', name: 'Harbor Lane, Uptown', address: '22 Sample Ave', city: 'Phoenix', state: 'AZ', zip: '85004' },
        ],
        primaryContact: { name: 'Dana Ortiz', email: 'dana@harborlane.example', phone: '555-0101' },
        billingContact: { name: 'Lee Park', email: 'billing@harborlane.example', phone: '555-0102' },
        shippingPreference: 'ship_to_patient_allowed', billingPreference: 'invoice_monthly',
        checklist: { profile: true, locations: true, clinicians: true, staff: true, billing: true, firstOrder: true },
        createdAt: t(60), approvedAt: t(55),
      },
      {
        id: 'cl-summit', name: 'Summit Vitality Telehealth', practiceType: 'Telehealth company', verification: 'approved',
        verificationNote: 'Demo approval. No license, NPI or DEA verification was performed.',
        locations: [{ id: 'loc-summit-1', name: 'Summit fulfillment desk', address: '9 Placeholder Rd', city: 'Atlanta', state: 'GA', zip: '30303' }],
        primaryContact: { name: 'Morgan Reyes', email: 'ops@summitvitality.example', phone: '555-0110' },
        billingContact: { name: 'Morgan Reyes', email: 'ops@summitvitality.example', phone: '555-0110' },
        shippingPreference: 'ship_to_patient_allowed', billingPreference: 'card_on_file_demo',
        checklist: { profile: true, locations: true, clinicians: true, staff: false, billing: true, firstOrder: true },
        createdAt: t(40), approvedAt: t(35),
      },
      {
        id: 'cl-cedar', name: 'Cedar Row Dermatology', practiceType: 'Dermatology office', verification: 'pending_review',
        verificationNote: '',
        locations: [{ id: 'loc-cedar-1', name: 'Cedar Row clinic', address: '5 Mock Street', city: 'Portland', state: 'OR', zip: '97201' }],
        primaryContact: { name: 'Avery Chen', email: 'avery@cedarrow.example', phone: '555-0120' },
        billingContact: { name: 'Avery Chen', email: 'avery@cedarrow.example', phone: '555-0120' },
        shippingPreference: 'ship_to_clinic', billingPreference: 'invoice_monthly',
        checklist: { profile: true, locations: true, clinicians: true, staff: false, billing: false, firstOrder: false },
        createdAt: t(3),
      },
    ],
    users: [
      { id: 'u-admin', clinicId: null, name: 'Riley Grant', email: 'riley@medicallygrounded.example', role: 'platform_admin', permissions: DEFAULT_PERMISSIONS.platform_admin, active: true },
      { id: 'u-harbor-admin', clinicId: 'cl-harbor', name: 'Dana Ortiz', email: 'dana@harborlane.example', role: 'clinic_admin', permissions: DEFAULT_PERMISSIONS.clinic_admin, active: true },
      { id: 'u-harbor-np', clinicId: 'cl-harbor', name: 'Jordan Wells, NP', email: 'jordan@harborlane.example', role: 'clinician', clinicianId: 'cn-harbor-1', permissions: DEFAULT_PERMISSIONS.clinician, active: true },
      { id: 'u-harbor-staff', clinicId: 'cl-harbor', name: 'Sam Patel', email: 'sam@harborlane.example', role: 'staff', permissions: DEFAULT_PERMISSIONS.staff, active: true },
      { id: 'u-summit-admin', clinicId: 'cl-summit', name: 'Morgan Reyes', email: 'ops@summitvitality.example', role: 'clinic_admin', permissions: DEFAULT_PERMISSIONS.clinic_admin, active: true },
      { id: 'u-summit-md', clinicId: 'cl-summit', name: 'Dr. Casey Moore', email: 'casey@summitvitality.example', role: 'clinician', clinicianId: 'cn-summit-1', permissions: DEFAULT_PERMISSIONS.clinician, active: true },
      { id: 'u-cedar-admin', clinicId: 'cl-cedar', name: 'Avery Chen', email: 'avery@cedarrow.example', role: 'clinic_admin', permissions: DEFAULT_PERMISSIONS.clinic_admin, active: true },
    ],
    clinicians: [
      { id: 'cn-harbor-1', clinicId: 'cl-harbor', name: 'Jordan Wells', credential: 'NP', npi: '0000000101', licenseState: 'CA', licenseNumber: 'DEMO-NP-1101', credentialCheck: 'mock_checked' },
      { id: 'cn-summit-1', clinicId: 'cl-summit', name: 'Casey Moore', credential: 'MD', npi: '0000000202', licenseState: 'GA', licenseNumber: 'DEMO-MD-2202', credentialCheck: 'mock_checked' },
      { id: 'cn-cedar-1', clinicId: 'cl-cedar', name: 'Avery Chen', credential: 'MD', npi: '0000000303', licenseState: 'OR', licenseNumber: 'DEMO-MD-3303', credentialCheck: 'not_checked' },
    ],
    products,
    pharmacies: [
      { id: 'ph-northwind', name: 'Northwind Compounding (fictional)', kind: 'Compounding pharmacy', integrationStatus: 'mock', adapter: 'MockPharmacyAdapter', states: ALL, contactEmail: 'partners@northwind.example', notes: 'Fictional record. No agreement exists.' },
      { id: 'ph-larkspur', name: 'Larkspur Specialty Rx (fictional)', kind: 'Compounding and specialty pharmacy', integrationStatus: 'mock', adapter: 'MockPharmacyAdapter', states: ALL, contactEmail: 'ops@larkspur.example', notes: 'Fictional record. No agreement exists.' },
      { id: 'ph-cobalt', name: 'Cobalt Branded Supply (fictional)', kind: 'Branded medication distributor', integrationStatus: 'not_connected', adapter: 'MockPharmacyAdapter', states: ALL, contactEmail: 'trade@cobalt.example', notes: 'Fictional record. Orders are held for manual handling.' },
    ],
    orders: [
      {
        id: 'MG-1038', clinicId: 'cl-harbor', locationId: 'loc-harbor-1', pathway: 'ps_patient',
        items: [item('prd-001', 1), item('prd-013', 2)], patientRef: 'DEMO-PT1001', poNumber: 'HL-221', pharmacyNotes: '',
        status: 'shipped', createdBy: 'Sam Patel', preparedBy: 'Sam Patel', authorizedBy: 'Jordan Wells, NP', authorizedAt: t(9, 12),
        idempotencyKey: 'seed-1038', cancellationRequested: false, externalRef: 'MOCK-NWX-88121', trackingNumber: 'MOCKTRK1038',
        events: [
          ev('e1', t(9, 9), 'draft', 'Sam Patel', 'Draft created'),
          ev('e2', t(9, 11), 'submitted', 'Sam Patel', 'Request submitted for clinician review'),
          ev('e3', t(9, 11), 'awaiting_clinician', 'System', 'Waiting for clinician authorization'),
          ev('e4', t(9, 12), 'pharmacy_review', 'Jordan Wells, NP', 'Authorized and sent to mock pharmacy adapter'),
          ev('e5', t(8, 10), 'accepted', 'Northwind Compounding (fictional)', 'Mock webhook: accepted'),
          ev('e6', t(7, 10), 'processing', 'Northwind Compounding (fictional)', 'Mock webhook: in preparation'),
          ev('e7', t(5, 15), 'shipped', 'Northwind Compounding (fictional)', 'Mock tracking number MOCKTRK1038'),
        ],
        createdAt: t(9, 9), updatedAt: t(5, 15), submittedAt: t(9, 11),
      },
      {
        id: 'MG-1039', clinicId: 'cl-harbor', locationId: 'loc-harbor-1', pathway: 'office_use',
        items: [item('prd-016', 2)], patientRef: '', poNumber: 'HL-230', pharmacyNotes: 'Deliver before noon if possible.',
        status: 'clarification_required', createdBy: 'Dana Ortiz', preparedBy: 'Dana Ortiz', authorizedBy: 'Jordan Wells, NP', authorizedAt: t(2, 12),
        idempotencyKey: 'seed-1039', cancellationRequested: false, externalRef: 'MOCK-NWX-88190',
        events: [
          ev('e1', t(2, 9), 'draft', 'Dana Ortiz', 'Draft created'),
          ev('e2', t(2, 10), 'submitted', 'Dana Ortiz', 'Request submitted for clinician review'),
          ev('e3', t(2, 10), 'awaiting_clinician', 'System', 'Waiting for clinician authorization'),
          ev('e4', t(2, 12), 'pharmacy_review', 'Jordan Wells, NP', 'Authorized and sent to mock pharmacy adapter'),
          ev('e5', t(1, 9), 'clarification_required', 'Northwind Compounding (fictional)', 'Please confirm the receiving hours for cold chain delivery.', 'clarification'),
        ],
        createdAt: t(2, 9), updatedAt: t(1, 9), submittedAt: t(2, 10),
      },
      {
        id: 'MG-1040', clinicId: 'cl-summit', locationId: 'loc-summit-1', pathway: 'ps_patient',
        items: [item('prd-011', 1)], patientRef: 'DEMO-PT2001', poNumber: '', pharmacyNotes: '',
        status: 'delivered', createdBy: 'Morgan Reyes', preparedBy: 'Morgan Reyes', authorizedBy: 'Dr. Casey Moore', authorizedAt: t(14, 12),
        idempotencyKey: 'seed-1040', cancellationRequested: false, externalRef: 'MOCK-LKS-1201', trackingNumber: 'MOCKTRK1040',
        events: [
          ev('e1', t(14, 9), 'draft', 'Morgan Reyes', 'Draft created'),
          ev('e2', t(14, 11), 'submitted', 'Morgan Reyes', 'Request submitted for clinician review'),
          ev('e3', t(14, 12), 'pharmacy_review', 'Dr. Casey Moore', 'Authorized and sent to mock pharmacy adapter'),
          ev('e4', t(13, 10), 'accepted', 'Larkspur Specialty Rx (fictional)', 'Mock webhook: accepted'),
          ev('e5', t(12, 10), 'processing', 'Larkspur Specialty Rx (fictional)', 'Mock webhook: in preparation'),
          ev('e6', t(11, 10), 'shipped', 'Larkspur Specialty Rx (fictional)', 'Mock tracking number MOCKTRK1040'),
          ev('e7', t(9, 10), 'delivered', 'Mock carrier', 'Mock carrier reports delivery'),
        ],
        createdAt: t(14, 9), updatedAt: t(9, 10), submittedAt: t(14, 11),
      },
    ],
    tickets: [
      {
        id: 'T-501', clinicId: 'cl-harbor', orderId: 'MG-1039', subject: 'Receiving hours for cold chain box', category: 'order', status: 'awaiting_support',
        messages: [{ id: 'm1', at: t(1, 11), author: 'Dana Ortiz', fromSupport: false, body: 'We can receive between 8 and 11am. Can you pass that along?' }],
        history: [{ at: t(1, 11), status: 'open', actor: 'Dana Ortiz' }, { at: t(1, 11), status: 'awaiting_support', actor: 'System' }],
        createdAt: t(1, 11),
      },
    ],
    leads: [
      { id: 'L-301', kind: 'partnership', name: 'Quinn Harper', organization: 'Example Wellness Group', email: 'quinn@example-wellness.test', message: 'Interested in a multi-location pilot.', status: 'contacted', owner: 'Riley Grant', createdAt: t(6) },
      { id: 'L-302', kind: 'access_request', name: 'Avery Chen', organization: 'Cedar Row Dermatology', email: 'avery@cedarrow.example', message: 'Application submitted from website.', status: 'qualified', clinicId: 'cl-cedar', owner: 'Riley Grant', createdAt: t(3) },
    ],
    tasks: [
      { id: 'K-1', title: 'Review Cedar Row application documents', assignee: 'Riley Grant', due: '2026-11-21', related: 'cl-cedar', status: 'open', notes: [], createdAt: t(3) },
      { id: 'K-2', title: 'Follow up on MG-1039 clarification', assignee: 'Riley Grant', due: '2026-11-19', related: 'MG-1039', status: 'open', notes: ['Clinic replied in T-501.'], createdAt: t(1) },
    ],
    audit: [
      { id: 'A-1', at: t(55), actor: 'Riley Grant', action: 'clinic.approve', entity: 'clinic', entityId: 'cl-harbor', detail: 'Demo approval, no credential verification' },
    ],
    notifications: [],
    integrationLog: [],
    favorites: { 'u-harbor-admin': ['prd-001'], 'u-harbor-staff': ['prd-016'] },
    assumptions: {
      platformFeePerOrder: 12, platformFeePct: 4, paymentProcessingPct: 2.9, supportCostPerOrder: 3.5,
      integrationCostPerOrder: 1.25, shippingAmbient: 14, shippingColdChain: 38, shippingSignature: 22,
    },
    mockFailureMode: false,
    session: { userId: 'u-harbor-admin' },
  };
}
