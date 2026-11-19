// Integration adapters. Every implementation in this file is a MOCK: it never contacts a pharmacy,
// payment processor, carrier, credential service or email provider. Replace each mock with a
// server-side adapter that implements the same interface (see docs/INTEGRATIONS.md).
import type { Order, OrderStatus, Product } from '../domain/types';

export type AdapterMode = 'mock' | 'live';

export interface AdapterResult<T> {
  ok: boolean;
  mode: AdapterMode;
  data?: T;
  error?: string;
  retryable?: boolean;
}

export interface PharmacyCatalogAdapter {
  name: string; mode: AdapterMode;
  fetchCatalog(pharmacyId: string): Promise<AdapterResult<Pick<Product, 'pharmacyProductId' | 'unitPrice' | 'availability'>[]>>;
}
export interface OrderSubmissionAdapter {
  name: string; mode: AdapterMode;
  submit(order: Order, idempotencyKey: string): Promise<AdapterResult<{ externalRef: string }>>;
}
export interface StatusWebhookAdapter {
  name: string; mode: AdapterMode;
  /** Converts a pharmacy's raw status payload into a platform status. */
  parse(payload: { status: string; ref: string }): AdapterResult<{ status: OrderStatus; ref: string }>;
}
export interface ShipmentTrackingAdapter {
  name: string; mode: AdapterMode;
  track(trackingNumber: string): Promise<AdapterResult<{ carrier: string; state: 'in_transit' | 'delivered' }>>;
}
export interface PaymentsAdapter {
  name: string; mode: AdapterMode;
  /** Demo never charges. A live adapter would create an invoice or payment intent server-side. */
  quote(amount: number): Promise<AdapterResult<{ charged: false; amount: number }>>;
}
export interface CredentialVerificationAdapter {
  name: string; mode: AdapterMode;
  check(npi: string, licenseState: string): Promise<AdapterResult<{ verified: false; note: string }>>;
}
export interface EmailAdapter {
  name: string; mode: AdapterMode;
  send(to: string, subject: string): Promise<AdapterResult<{ simulated: true }>>;
}

/** Pharmacy raw status vocabulary mapped onto the platform's statuses. One table, used everywhere. */
export const PHARMACY_STATUS_MAP: Record<string, OrderStatus> = {
  RECEIVED: 'pharmacy_review',
  IN_REVIEW: 'pharmacy_review',
  NEEDS_INFO: 'clarification_required',
  APPROVED: 'accepted',
  COMPOUNDING: 'processing',
  PACKED: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  VOID: 'cancelled',
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const mockLatency = { ms: 350 };

/** Retry with exponential backoff for retryable failures only. */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<AdapterResult<T>>,
  opts: { retries: number; baseMs: number; onRetry?: (attempt: number, error: string) => void },
): Promise<AdapterResult<T> & { attempts: number }> {
  let last: AdapterResult<T> = { ok: false, mode: 'mock', error: 'not attempted' };
  for (let attempt = 1; attempt <= opts.retries + 1; attempt++) {
    last = await fn(attempt);
    if (last.ok || !last.retryable) return { ...last, attempts: attempt };
    if (attempt <= opts.retries) {
      opts.onRetry?.(attempt, last.error ?? 'unknown');
      await wait(opts.baseMs * 2 ** (attempt - 1));
    }
  }
  return { ...last, attempts: opts.retries + 1 };
}

/** Remembers idempotency keys already accepted so a repeated submit returns the first result. */
const seenKeys = new Map<string, string>();

export function createMockOrderAdapter(getFailureMode: () => boolean): OrderSubmissionAdapter {
  return {
    name: 'MockOrderSubmissionAdapter',
    mode: 'mock',
    async submit(order, key) {
      await wait(mockLatency.ms);
      if (!order.items.length) return { ok: false, mode: 'mock', error: 'Order has no items', retryable: false };
      const prior = seenKeys.get(key);
      if (prior) return { ok: true, mode: 'mock', data: { externalRef: prior } };
      if (getFailureMode()) return { ok: false, mode: 'mock', error: 'Mock pharmacy endpoint timed out (simulated)', retryable: true };
      const ref = `MOCK-${order.id}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      seenKeys.set(key, ref);
      return { ok: true, mode: 'mock', data: { externalRef: ref } };
    },
  };
}

export const mockStatusWebhook: StatusWebhookAdapter = {
  name: 'MockStatusWebhookAdapter',
  mode: 'mock',
  parse(payload) {
    const status = PHARMACY_STATUS_MAP[payload.status?.toUpperCase?.() ?? ''];
    if (!status) return { ok: false, mode: 'mock', error: `Unknown pharmacy status “${payload.status}”`, retryable: false };
    if (!/^MG-\d+$/.test(payload.ref)) return { ok: false, mode: 'mock', error: 'Unknown order reference', retryable: false };
    return { ok: true, mode: 'mock', data: { status, ref: payload.ref } };
  },
};

export const mockCatalog: PharmacyCatalogAdapter = {
  name: 'MockCatalogAdapter', mode: 'mock',
  async fetchCatalog() { await wait(mockLatency.ms); return { ok: true, mode: 'mock', data: [] }; },
};

export const mockTracking: ShipmentTrackingAdapter = {
  name: 'MockShipmentTrackingAdapter', mode: 'mock',
  async track() { await wait(mockLatency.ms); return { ok: true, mode: 'mock', data: { carrier: 'Mock carrier', state: 'in_transit' } }; },
};

export const mockPayments: PaymentsAdapter = {
  name: 'MockPaymentsAdapter', mode: 'mock',
  async quote(amount) { return { ok: true, mode: 'mock', data: { charged: false, amount } }; },
};

export const mockCredentials: CredentialVerificationAdapter = {
  name: 'MockCredentialVerificationAdapter', mode: 'mock',
  async check() {
    await wait(mockLatency.ms);
    return { ok: true, mode: 'mock', data: { verified: false, note: 'Mock check only. No registry was queried.' } };
  },
};

export const mockEmail: EmailAdapter = {
  name: 'MockEmailAdapter', mode: 'mock',
  async send() { return { ok: true, mode: 'mock', data: { simulated: true } }; },
};

export const ADAPTER_REGISTRY = [
  { key: 'catalog', label: 'Pharmacy catalog and pricing', adapter: mockCatalog.name, live: 'Pharmacy catalog API or SFTP price file, pulled server-side on a schedule' },
  { key: 'orders', label: 'Order submission', adapter: 'MockOrderSubmissionAdapter', live: 'Pharmacy order API (REST) with idempotency key header' },
  { key: 'webhooks', label: 'Status webhooks', adapter: mockStatusWebhook.name, live: 'Signed HTTPS webhook endpoint on the API server' },
  { key: 'tracking', label: 'Shipment tracking', adapter: mockTracking.name, live: 'Carrier tracking API or pharmacy-provided tracking events' },
  { key: 'payments', label: 'Payments and invoicing', adapter: mockPayments.name, live: 'Payment processor via server-side secret key; never in the browser' },
  { key: 'credentials', label: 'Credential verification', adapter: mockCredentials.name, live: 'NPI registry lookup plus state license verification service' },
  { key: 'email', label: 'Email notifications', adapter: mockEmail.name, live: 'Transactional email provider via server-side API key' },
] as const;
