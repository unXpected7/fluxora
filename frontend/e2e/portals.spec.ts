import { expect, test } from '@playwright/test';

test('customer discovers an event, reserves a ticket, and creates a pending order', async ({ page }) => {
  await page.goto('http://localhost:5174/tickets');
  await expect(page.getByRole('heading', { name: 'Find your next concert' })).toBeVisible();

  const eventLink = page.getByRole('link', { name: /Fluxora Demo Live/ });
  await expect(eventLink).toBeVisible();
  await eventLink.click();
  await expect(page.getByRole('heading', { name: 'Fluxora Demo Live' })).toBeVisible();

  await page.getByRole('spinbutton', { name: 'Quantity for Regular', exact: true }).fill('1');
  await page.getByLabel('Email').fill(`playwright-${Date.now()}@example.test`);
  await page.getByLabel('First name').fill('Browser');
  await page.getByRole('button', { name: 'Reserve tickets and get total' }).click();
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
  await expect(page.getByText('Order total:')).toBeVisible();

  await page.getByRole('button', { name: 'Create order and continue to payment' }).click();
  await expect(page.getByRole('heading', { name: /^Order FLX-/ })).toBeVisible();
  await expect(page.getByText('Order status: PENDING · Payment: PENDING')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('not available');
  await expect(page.getByRole('heading', { name: 'Your tickets' })).toHaveCount(0);
  const recovery = await page.evaluate(() => sessionStorage.getItem('fluxora-ticket-checkout-v1'));
  expect(recovery).not.toContain('qrToken');
});

for (const portal of [
  { name: 'admin', origin: 'http://admin.localhost:5174', heading: 'Admin sign in' },
  { name: 'partner', origin: 'http://partner.localhost:5174', heading: 'Partner sign in' },
]) {
  test(`${portal.name} portal rejects invalid credentials without creating a session`, async ({ page }) => {
    await page.goto(portal.origin);
    await expect(page.getByRole('heading', { name: portal.heading })).toBeVisible();
    await page.getByLabel('Email').fill('invalid-user@example.test');
    await page.getByLabel('Password').fill('invalid-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
    await expect(page.getByRole('heading', { name: portal.heading })).toBeVisible();
  });
}
