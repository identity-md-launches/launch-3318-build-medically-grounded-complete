// End-to-end acceptance run against the built static export (dist/) served under /preview/.
// Usage: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/acceptance.mjs
// (or install playwright where Node can resolve it). Exits 1 if any check fails.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/preview/')) { res.writeHead(404); return res.end(); }
  const rel = normalize(url.pathname.slice('/preview/'.length) || 'index.html').replace(/^(\.\.[/\\])+/, '');
  try { const body = await readFile(join(dist, rel)); res.writeHead(200, { 'content-type': types[extname(rel)] ?? 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/preview/`;

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push({ name, ok: true }); console.log('PASS', name); }
  catch (e) { results.push({ name, ok: false, error: String(e.message ?? e).split('\n')[0] }); console.log('FAIL', name, '-', String(e.message ?? e).split('\n')[0]); }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(6000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', (r) => errors.push(`request failed ${r.url()}`));
page.on('dialog', (d) => d.accept());
const go = async (hash) => { await page.goto(base + '#' + hash); await page.waitForTimeout(80); };
const asUser = async (name) => {
  const v = await page.$eval('#role-switch', (s, n) => [...s.options].find((o) => o.text.includes(n))?.value, name);
  expect(v, `no demo user ${name}`);
  await page.selectOption('#role-switch', v);
  await page.waitForTimeout(80);
};
const clinicName = `Acceptance Ridge Clinic ${Date.now().toString(36)}`;
let clinicId = '', orderId = '', ticketId = '';

await page.goto(base);
await page.evaluate(() => localStorage.clear());

await check('1. invalid application shows field errors', async () => {
  await go('/request-access');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await page.getByText(/Fix \d+ fields marked below/).waitFor();
  expect(await page.locator('[aria-invalid="true"]').count() >= 10, 'expected invalid fields');
  expect(await page.evaluate(() => document.activeElement?.id) === 'practiceName', 'focus should move to first invalid field');
});

await check('1. create fictional clinic application', async () => {
  await page.getByLabel('Practice name').fill(clinicName);
  await page.getByLabel('Practice type').selectOption('Med spa');
  await page.getByLabel('Administrator name').fill('Pat Example');
  await page.getByLabel('Administrator email').fill('pat@ridge.example');
  await page.getByLabel('Phone').fill('555-0199');
  await page.getByLabel('Street address').fill('1 Test St');
  await page.getByLabel('City').fill('Denver');
  await page.getByLabel('State', { exact: true }).selectOption('CO');
  await page.getByLabel('ZIP code').fill('80202');
  await page.getByLabel('Clinician name').fill('Lee Example');
  await page.getByLabel('NPI (fictional)').fill('0000000999');
  await page.getByLabel('License state').selectOption('CO');
  await page.getByLabel('License number (fictional)').fill('DEMO-CO-1');
  await page.getByLabel(/Every detail above is fictional/).check();
  await page.getByRole('button', { name: 'Submit application' }).click();
  clinicId = await page.getByTestId('application-id').textContent();
  expect(clinicId, 'no application id');
});

await check('2. approve it in demo administration', async () => {
  await page.getByRole('button', { name: 'Review in demo administration' }).click();
  await page.getByRole('heading', { name: clinicName }).waitFor();
  await page.getByRole('button', { name: 'Approve clinic (demo)' }).click();
  await page.locator('.badge', { hasText: 'Approved (demo)' }).first().waitFor();
  await page.getByText('Demo approval. No license').first().waitFor();
});

await check('3. open its clinic workspace', async () => {
  await page.getByRole('button', { name: 'Open clinic workspace' }).click();
  await page.getByRole('heading', { name: 'Welcome, Pat Example' }).waitFor();
  expect((await page.locator('.topbar strong').textContent()) === clinicName, 'workspace shows another clinic');
});

await check('4. search products, empty state, save a favorite', async () => {
  await page.locator('#portal-nav').getByRole('link', { name: 'Catalog', exact: true }).click();
  await page.getByLabel('Search products').fill('zzzz-nothing');
  await page.getByText('No products match these filters').waitFor();
  await page.getByLabel('Search products').fill('Vireo');
  expect(await page.getByTestId('product-card').count() === 2, 'expected 2 Vireo products');
  await page.getByTestId('product-card').first().getByRole('button', { name: /Save to favorites/ }).click();
  await page.getByTestId('product-card').first().getByRole('button', { name: /Saved to favorites/ }).waitFor();
  await page.locator('#portal-nav').getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.locator('#fav-h').locator('xpath=../..').getByText('Vireo tablet (demo)').waitFor();
});

await check('5. create and submit an order request (staff-side prep, duplicate click)', async () => {
  await go('/app/orders');
  await page.getByText('No orders yet').waitFor();
  await page.getByRole('button', { name: 'New order request' }).click();
  await page.getByRole('heading', { name: 'Location' }).waitFor();
  orderId = page.url().split('/').pop();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Add at least one product.').first().waitFor();
  await page.locator('#qty-prd-011').fill('2');
  await page.getByRole('button', { name: 'Continue' }).click();
  expect(await page.getByLabel('Patient-specific, ship to patient').isDisabled(), 'ship-to-patient should be disabled by clinic preference');
  await page.getByLabel('Patient-specific, ship to clinic').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Fictional patient reference').fill('Jane Real');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText(/must start with DEMO-|Use a fictional reference/).first().waitFor();
  await page.getByLabel('Fictional patient reference').fill('DEMO-PT1001');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Estimated total (fictional, not charged)').waitFor();
  await page.getByRole('button', { name: 'Submit request' }).dblclick();
  await page.getByRole('heading', { name: `Order ${orderId}` }).waitFor();
  await page.locator('.card .badge', { hasText: 'Awaiting Clinician' }).first().waitFor();
  expect(await page.getByRole('button', { name: 'Authorize request' }).count() === 0, 'clinic admin must not authorize');
  const count = await page.evaluate((id) => JSON.parse(localStorage.getItem('medically-grounded-demo-v1')).orders.filter((o) => o.id === id).length, orderId);
  expect(count === 1, 'duplicate order created');
  const submits = await page.evaluate((id) => JSON.parse(localStorage.getItem('medically-grounded-demo-v1')).orders.find((o) => o.id === id).events.filter((e) => e.status === 'submitted').length, orderId);
  expect(submits === 1, `expected 1 submitted event, got ${submits}`);
});

await check('5b. clinician authorizes; mock hand-off to pharmacy review', async () => {
  await asUser('Lee Example');
  await go(`/app/orders/${orderId}`);
  await page.getByRole('button', { name: 'Authorize request' }).click();
  await page.locator('.card .badge', { hasText: 'Pharmacy Review' }).first().waitFor({ timeout: 5000 });
});

await check('6. find the same order in administration', async () => {
  await asUser('Riley Grant');
  await go('/admin/orders');
  await page.getByLabel('Order ID').fill(orderId);
  expect(await page.locator(`tr[data-order="${orderId}"]`).count() === 1, 'order not listed');
  expect(await page.locator('tbody tr').count() === 1, 'search should filter to one row');
  await page.locator(`tr[data-order="${orderId}"] a`).click();
  await page.getByRole('heading', { name: `Order ${orderId}` }).waitFor();
});

await check('7. update simulated status (accepted, processing, shipped)', async () => {
  for (const s of ['Accepted', 'Processing', 'Shipped']) {
    await page.getByLabel('New status').selectOption({ label: s });
    await page.getByRole('button', { name: 'Apply status' }).click();
    await page.locator('.card.row .badge', { hasText: s }).waitFor();
  }
  expect(await page.getByLabel('New status').locator('option').allTextContents().then((o) => o.includes('Delivered') && !o.includes('Accepted')), 'only Delivered should follow Shipped');
});

await check('8. clinic-side history matches', async () => {
  await asUser('Pat Example');
  await go(`/app/orders/${orderId}`);
  const statuses = await page.locator('.timeline li').evaluateAll((els) => els.map((e) => e.getAttribute('data-event-status')).filter(Boolean));
  const expected = ['shipped', 'processing', 'accepted', 'pharmacy_review', 'awaiting_clinician', 'submitted', 'draft'];
  expect(JSON.stringify(statuses) === JSON.stringify(expected), `history ${statuses.join(',')}`);
  await page.getByText(/Mock tracking/).first().waitFor();
});

await check('9. create, reply to and resolve a support ticket', async () => {
  await page.getByRole('link', { name: 'Ask about this order' }).click();
  await page.getByRole('button', { name: 'Open ticket' }).waitFor();
  await page.getByLabel('Question').fill('x');
  await page.getByRole('button', { name: 'Open ticket' }).click();
  await page.getByText('Describe the question in at least 10 characters.').waitFor();
  await page.getByLabel('Question').fill('When should we expect the shipment to arrive?');
  await page.getByRole('button', { name: 'Open ticket' }).click();
  await page.getByRole('heading', { name: /^T-\d+: Question about/ }).waitFor();
  ticketId = page.url().split('/').pop();
  await asUser('Riley Grant');
  await go(`/admin/tickets/${ticketId}`);
  await page.getByLabel('Reply to clinic').fill('The mock carrier shows it in transit.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await page.locator('.badge', { hasText: 'Awaiting clinic' }).first().waitFor();
  await page.getByLabel('Resolution summary').fill('Shared mock tracking status');
  await page.getByRole('button', { name: 'Mark resolved' }).click();
  await page.getByText('Resolution: Shared mock tracking status').waitFor();
  await asUser('Pat Example');
  await go(`/app/support/${ticketId}`);
  await page.getByText('The mock carrier shows it in transit.').waitFor();
  await page.locator('.badge', { hasText: 'Resolved' }).first().waitFor();
  await go('/app/notifications');
  await page.getByText('Simulated, not sent').first().waitFor();
});

await check('10. reload and verify persistence', async () => {
  await page.reload();
  await go(`/app/orders/${orderId}`);
  await page.locator('.card .badge', { hasText: 'Shipped' }).first().waitFor();
  await go(`/app/support/${ticketId}`);
  await page.locator('.badge', { hasText: 'Resolved' }).first().waitFor();
  await go('/app/catalog');
  await page.getByLabel('Favorites only').check();
  expect(await page.getByTestId('product-card').count() === 1, 'favorite not persisted');
});

await check('role restrictions and tenant scoping (client-side demo)', async () => {
  await asUser('Sam Patel');
  await go('/admin/financials');
  await page.getByRole('heading', { name: 'Not available for this role' }).waitFor();
  expect(await page.getByText('Contribution margin').count() === 0, 'staff saw margins');
  await go(`/app/orders/${orderId}`);
  await page.getByText('Order not found').waitFor();
  await go('/app/catalog/prd-001');
  expect(await page.getByText('Supplier notes').count() === 0, 'clinic saw supplier notes');
});

await check('reorder creates a fresh draft', async () => {
  await asUser('Pat Example');
  await go(`/app/orders/${orderId}`);
  await page.getByRole('button', { name: 'Create new draft from this order' }).click();
  await page.getByText(/Created from MG-/).waitFor();
  expect(page.url().split('/').pop() !== orderId, 'same id reused');
});

await check('mock failure handling and retry in admin', async () => {
  await asUser('Riley Grant');
  await go('/admin/integrations');
  await page.getByLabel('Simulate pharmacy endpoint failures').check();
  await page.getByLabel('Pharmacy status').fill('NOT_A_STATUS');
  await page.getByRole('button', { name: 'Send mock webhook' }).click();
  await page.getByText(/Unknown pharmacy status/).first().waitFor();
  await page.getByLabel('Simulate pharmacy endpoint failures').uncheck();
});

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const m = await mobile.newPage();
m.setDefaultTimeout(6000);
m.on('pageerror', (e) => errors.push(String(e)));
await check('mobile: first screen shows headline and main action at 390', async () => {
  await m.goto(base);
  const cta = await m.getByRole('link', { name: 'Request clinic access' }).first().boundingBox();
  const h1 = await m.locator('h1').boundingBox();
  expect(h1 && h1.y + h1.height < 844, 'headline below fold');
  expect(cta && cta.y + cta.height < 844, `CTA below fold at ${cta?.y}`);
});
await check('mobile: public menu navigation', async () => {
  await m.getByRole('button', { name: 'Menu' }).click();
  await m.getByRole('link', { name: 'How it works' }).click();
  await m.getByRole('heading', { name: 'How it works', level: 1 }).waitFor();
});
await check('mobile: portal sidebar opens, navigates and closes', async () => {
  await m.goto(base + '#/app');
  await m.getByRole('button', { name: 'Menu' }).click();
  await m.locator('#portal-nav').getByRole('link', { name: 'Support' }).click();
  await m.getByRole('heading', { name: 'Support', level: 1 }).waitFor();
  expect(!(await m.locator('#portal-nav').isVisible()), 'sidebar should close after navigation');
});
for (const w of [320, 390]) {
  await check(`no horizontal overflow at ${w}px on key routes`, async () => {
    await m.setViewportSize({ width: w, height: 800 });
    for (const r of ['/', '/how-it-works', '/request-access', '/app', '/app/catalog', '/app/orders', '/admin/orders', '/admin/financials']) {
      if (r === '/admin/orders') { await m.goto(base + '#/demo'); await m.getByRole('button', { name: 'Open administration' }).click(); }
      await m.goto(base + '#' + r); await m.reload(); await m.waitForTimeout(60);
      const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over <= 0, `${r} overflows by ${over}px`);
    }
  });
}
await check('no console errors, page errors or failed requests', async () => { expect(errors.length === 0, errors.join(' | ')); });

await browser.close(); server.close();
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, failures: failed }, null, 2));
process.exit(failed.length ? 1 : 0);
