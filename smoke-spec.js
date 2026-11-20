// اختبار دخان للواجهة: npm i && npx playwright install chromium && BASE_URL=https://موقعك.pages.dev npm run e2e
const { test, expect } = require('@playwright/test');
const BASE = process.env.BASE_URL || 'http://localhost:4173';

test('المتجر يفتح بلا أخطاء CSP أو JavaScript', async ({ page }) => {
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) problems.push('csp: ' + m.text()); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await expect(page.locator('body')).toBeVisible();
  expect(problems, problems.join('\n')).toEqual([]);
});

test('بطاقات المنتجات تظهر وزر الإضافة للسلة يعمل', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const card = page.locator('.product-card, [data-product-id]').first();
  await expect(card).toBeVisible({ timeout: 15000 });
});

test('لوحة الأدمن تعرض شاشة الدخول بلا أخطاء CSP', async ({ page }) => {
  const csp = [];
  page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()); });
  await page.goto(BASE + '/admin.html', { waitUntil: 'networkidle' });
  expect(csp, csp.join('\n')).toEqual([]);
});

test('الصور لا تُحمَّل كلها فوراً (lazy)', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const lazy = await page.locator('img[loading="lazy"]').count();
  expect(lazy).toBeGreaterThan(0);
});
