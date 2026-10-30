// Real-browser walkthrough of the GHT pilot workflow: owner activation with
// MFA → invitations → Guinea sales quotation → acceptance → project → task →
// employee progress, plus denied-access and responsive/accessibility checks.
import { test, expect } from '@playwright/test';
import { emailLink, state, totp, watchPage } from './support.mjs';

test.describe.configure({ mode: 'serial' });

const env = state();
const pw = (who) => `Browser-${who}-${env.run}-passphrase`;
const people = {
  owner: { email: env.ownerEmail, password: pw('owner') },
  sales: { email: `sales.${env.run}@browser.test`, password: pw('sales') },
  employee: { email: `employee.${env.run}@browser.test`, password: pw('employee') },
};
const problems = [];
const nav = (page) => page.getByRole('navigation', { name: 'Main navigation' });
const pages = {};

async function open(browser, who, viewport) {
  const context = await browser.newContext({ baseURL: env.web, ...(viewport ? { viewport } : {}) });
  const page = await context.newPage();
  watchPage(page, problems);
  pages[who] = page;
  return page;
}
async function acceptInvite(page, who, first) {
  await page.goto(await emailLink(people[who].email, 'accept-invite'));
  await expect(page.getByRole('heading', { name: 'Activate your Operix account' })).toBeVisible();
  await page.getByLabel('First name').fill(first);
  await page.getByLabel('Last name').fill('Pilot');
  await page.getByLabel('New password', { exact: true }).fill(people[who].password);
  await page.getByLabel('Confirm password').fill(people[who].password);
  await page.getByRole('button', { name: 'Activate account' }).click();
  await expect(page.getByText('Your account is active. Sign in to continue.')).toBeVisible();
}
async function signIn(page, who) {
  await page.getByLabel('Work email').fill(people[who].email);
  await page.getByLabel('Password').fill(people[who].password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  if (people[who].secret) {
    await page.getByLabel('Authentication code').fill(totp(people[who].secret));
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
  }
}

test('public landing leads to sign-in; no public registration exists', async ({ browser }) => {
  const page = await open(browser, 'visitor', { width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Manage everything\.\s*Grow everywhere\./);
  await expect(page.getByText('Invitation-only accounts')).toBeVisible();
  await expect(page.getByText('Demo data', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'e2e/evidence/00a-landing-desktop.png', fullPage: true });

  const noRegistration = async () => {
    for (const name of [/sign ?up/i, /register/i, /create (an )?account/i, /get started/i, /google|microsoft/i])
      await expect(page.getByRole('link', { name }).or(page.getByRole('button', { name }))).toHaveCount(0);
  };
  await noRegistration();

  // "Explore modules" stays on the landing page and moves focus.
  await page.getByRole('button', { name: 'Explore modules' }).click();
  await expect(page.locator('#px-lp-modules')).toBeFocused();
  await expect(page).toHaveURL(/\/$/);

  // Keyboard: the header Login action is reachable with Tab and activates with Enter.
  await page.goto('/');
  let reached = false;
  for (let i = 0; i < 8 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Login');
  }
  expect(reached).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Sign in to Operix' })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await noRegistration();
  await page.screenshot({ path: 'e2e/evidence/00b-login-desktop.png', fullPage: true });

  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Operix' })).toBeVisible();
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Manage everything/);

  // Hash links from earlier builds still land on sign-in.
  await page.goto('/#/login');
  await expect(page.getByRole('heading', { name: 'Sign in to Operix' })).toBeVisible();
  // Signed-out deep links ask to sign in rather than showing the landing page.
  await page.goto('/customers');
  await expect(page.getByRole('heading', { name: 'Sign in to Operix' })).toBeVisible();

  for (const width of [1440, 1024, 768, 390, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/login']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, `${route} at ${width}px`).toBeLessThanOrEqual(width);
    }
  }
  await page.goto('/');
  await page.screenshot({ path: 'e2e/evidence/00c-landing-mobile.png', fullPage: true });
  await page.goto('/login');
  await page.screenshot({ path: 'e2e/evidence/00d-login-mobile.png' });
});

test('owner activates from the emailed link and must enroll MFA before using Operix', async ({ browser }) => {
  const page = await open(browser, 'owner');
  await acceptInvite(page, 'owner', 'Mariama');
  await signIn(page, 'owner');
  await expect(page.getByText('Your role requires two-step sign-in')).toBeVisible();
  // Business navigation is withheld until MFA is on.
  await expect(nav(page).getByRole('link', { name: 'Customers', exact: true })).toHaveCount(0);
  await page.getByLabel('Password').fill(people.owner.password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible();
  people.owner.secret = (await page.locator('.px-qr code').innerText()).replace(/\s/g, '');
  await page.getByLabel('6-digit code').fill(totp(people.owner.secret));
  await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
  await expect(page.getByText('Two-step sign-in is on.')).toBeVisible();
  await nav(page).getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Mariama' })).toBeVisible();
  await expect(page.getByText(/Invoicing, payments, inventory and HR are not enabled/)).toBeVisible();
  await page.screenshot({ path: 'e2e/evidence/01-owner-dashboard.png', fullPage: true });
});

test('owner invites Guinea staff through the Team screen (email only, no links shown)', async () => {
  const page = pages.owner;
  await nav(page).getByRole('link', { name: 'Team & access', exact: true }).click();
  for (const [who, role] of [['sales', 'Sales Representative'], ['employee', 'Employee']]) {
    await page.getByRole('button', { name: 'Invite staff' }).click();
    const dialog = page.getByRole('dialog', { name: 'Invite a staff member' });
    await dialog.getByLabel('Work email').fill(people[who].email);
    await dialog.getByLabel('Role').selectOption({ label: role });
    await dialog.getByLabel('GHT Guinea').check();
    await dialog.getByRole('button', { name: 'Send invitation' }).click();
    await expect(dialog.getByText(`Invitation emailed to ${people[who].email}`)).toBeVisible();
    await expect(dialog.getByText('Activation link (non-production only)')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  const pending = page.locator('section', { hasText: 'Pending invitations' });
  await expect(pending.getByText(people.sales.email)).toBeVisible();
  await expect(pending.getByText(people.employee.email)).toBeVisible();
  await page.screenshot({ path: 'e2e/evidence/02-team-invitations.png', fullPage: true });
});

test('Guinea sales rep creates a customer and a GNF quotation with server-computed totals', async ({ browser }) => {
  const page = await open(browser, 'sales');
  await acceptInvite(page, 'sales', 'Ousmane');
  await signIn(page, 'sales');
  await expect(page.getByRole('heading', { name: 'Welcome, Ousmane' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Team & access', exact: true })).toHaveCount(0);
  await expect(nav(page).getByRole('link', { name: 'Projects', exact: true })).toHaveCount(0);

  await nav(page).getByRole('link', { name: 'Customers', exact: true }).click();
  await expect(page.getByText('No customers yet.')).toBeVisible();
  await page.getByRole('button', { name: 'New customer' }).click();
  const dialog = page.getByRole('dialog', { name: 'New customer' });
  await dialog.getByLabel('Name', { exact: true }).fill('Kaloum Printing SARL');
  await dialog.getByLabel('Contact person').fill('Fatou Camara');
  await dialog.getByLabel('Email').fill('contact@kaloum.example');
  await dialog.getByLabel('Phone').fill('+224 620 00 00 00');
  await dialog.getByLabel('City').fill('Conakry');
  // Financial fields are not offered to a role without customer financial access.
  await expect(dialog.getByLabel('Tax / registration number')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Kaloum Printing SARL' })).toBeVisible();
  await expect(page.getByText('CUS-00001 · GHT Guinea')).toBeVisible();
  await expect(page.getByRole('status').getByText('Customer CUS-00001 created.')).toBeVisible();

  await page.getByRole('link', { name: 'New quotation' }).click();
  await page.getByLabel('Title').fill('Storefront signage');
  await expect(page.getByLabel('Currency')).toHaveValue('GNF');
  await page.getByLabel('Tax rate (%)').fill('18');
  await page.getByLabel('Description').first().fill('Vinyl banner 3m × 1m');
  await page.getByLabel('Quantity').first().fill('3');
  await page.getByLabel(/Unit price/).first().fill('150000');
  await page.getByRole('button', { name: 'Add line' }).click();
  await page.getByLabel('Description').nth(1).fill('Installation');
  await page.getByLabel('Quantity').nth(1).fill('1.5');
  await page.getByLabel(/Unit price/).nth(1).fill('2000');
  await expect(page.locator('.px-totals .px-total')).toHaveText('534,540 GNF');
  await page.screenshot({ path: 'e2e/evidence/03-quotation-editor.png', fullPage: true });
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('heading', { name: /QUO-\d{4}-0001 · Storefront signage/ })).toBeVisible();
  await expect(page.locator('.px-totals .px-total')).toHaveText('534,540 GNF');
  // A sales rep can send but not record the customer decision.
  await expect(page.getByRole('button', { name: 'Record acceptance' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mark as sent' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mark as sent' }).click();
  await expect(page.getByText('Sent — awaiting decision')).toBeVisible();
  await page.screenshot({ path: 'e2e/evidence/04-quotation-sent.png', fullPage: true });
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
});

test('owner records acceptance, opens the project from the quotation and assigns a task', async () => {
  const page = pages.owner;
  await nav(page).getByRole('link', { name: 'Quotations', exact: true }).click();
  await page.getByRole('link', { name: /QUO-\d{4}-0001/ }).click();
  await page.getByRole('button', { name: 'Record acceptance' }).click();
  const confirm = page.getByRole('dialog');
  await confirm.getByLabel('Reason').fill('Signed quotation received');
  await confirm.getByRole('button', { name: 'Record acceptance' }).click();
  await expect(page.getByText('Accepted', { exact: true }).first()).toBeVisible();

  await page.getByRole('link', { name: 'Create project' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Kaloum storefront signage');
  await expect(page.getByLabel('Accepted quotation')).not.toHaveValue('');
  await page.getByLabel('Service').fill('Printing & installation');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: /PRJ-\d{4}-0001 · Kaloum storefront signage/ })).toBeVisible();

  await page.getByRole('button', { name: 'Start project' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start project' }).click();
  await expect(page.getByText('In progress', { exact: true }).first()).toBeVisible();

  // The invited employee has not activated yet, so they cannot be assigned work.
  await page.getByRole('button', { name: 'New task' }).click();
  const task = page.getByRole('dialog', { name: 'New task' });
  await expect(task.getByLabel('Assigned to').locator('option', { hasText: '— Employee' })).toHaveCount(0);
  await task.getByRole('button', { name: 'Cancel' }).click();
});

test('employee activates and only sees their own task, which they can progress', async ({ browser }) => {
  const page = await open(browser, 'employee');
  await acceptInvite(page, 'employee', 'Ibrahima');
  await signIn(page, 'employee');
  await expect(page.getByRole('heading', { name: 'Welcome, Ibrahima' })).toBeVisible();

  // The owner can now assign the task to the activated employee.
  const owner = pages.owner;
  await owner.getByRole('button', { name: 'New task' }).click();
  const task = owner.getByRole('dialog', { name: 'New task' });
  await task.getByLabel('Name').fill('Print the banners');
  await task.getByLabel('Assigned to').selectOption({ label: 'Ibrahima Pilot — Employee' });
  await task.getByLabel('Priority').selectOption('high');
  await task.getByRole('button', { name: 'Save' }).click();
  await expect(owner.locator('.px-list b', { hasText: 'Print the banners' })).toBeVisible();
  await owner.screenshot({ path: 'e2e/evidence/05-project-with-task.png', fullPage: true });

  const menu = nav(page);
  await expect(menu.getByRole('link')).toHaveText(['Dashboard', 'Tasks', 'My account']);
  await page.goto('/customers');
  await expect(page.getByText('This page does not exist or is not available to you.')).toBeVisible();

  await nav(page).getByRole('link', { name: 'Tasks', exact: true }).click();
  const row = page.getByRole('row', { name: /Print the banners/ });
  await expect(row).toBeVisible();
  await page.screenshot({ path: 'e2e/evidence/06-employee-tasks.png', fullPage: true });
  await row.getByRole('combobox').selectOption('IN_PROGRESS');
  await expect(page.getByText('“Print the banners” updated.')).toBeVisible();
  await row.getByRole('combobox').selectOption('COMPLETED');
  await expect(page.getByText('No tasks are assigned to you.')).toBeVisible();
  // Cancelling is a planner decision, not offered to the assignee.
  await page.getByLabel('Status').selectOption('COMPLETED');
  await expect(page.getByRole('row', { name: /Print the banners/ }).getByRole('combobox').locator('option')).toHaveText(['To do', 'In progress', 'Done']);
});

test('sales rep cannot reach team management or other people’s records', async () => {
  const page = pages.sales;
  await page.goto('/team');
  await expect(page.getByText('This page does not exist or is not available to you.')).toBeVisible();
  await page.goto('/projects');
  await expect(page.getByText('This page does not exist or is not available to you.')).toBeVisible();
});

test('dialogs trap focus and close with Escape; French is available', async () => {
  const page = pages.owner;
  await nav(page).getByRole('link', { name: 'Customers', exact: true }).click();
  await page.getByRole('button', { name: 'New customer' }).click();
  const dialog = page.getByRole('dialog', { name: 'New customer' });
  await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New customer' })).toBeFocused();
  await page.getByLabel('Language').selectOption('fr');
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();
  await page.screenshot({ path: 'e2e/evidence/07-french-customers.png', fullPage: true });
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await page.getByLabel('Langue').selectOption('en');
});

test('phone layout: navigation drawer and readable task cards', async ({ browser }) => {
  const page = await open(browser, 'employee-mobile', { width: 390, height: 844 });
  await page.goto('/login');
  await signIn(page, 'employee');
  await expect(page.getByRole('heading', { name: 'Welcome, Ibrahima' })).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'e2e/evidence/08-mobile-dashboard.png' });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.waitForTimeout(400); // drawer transition, for the evidence screenshot only
  await page.screenshot({ path: 'e2e/evidence/09-mobile-menu.png' });
  await nav(page).getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  // Navigating closes the drawer; a closed drawer is hidden from assistive tech and focus.
  await expect(nav(page)).toBeHidden();
  await page.getByLabel('Status', { exact: true }).selectOption('COMPLETED');
  await expect(page.getByRole('row', { name: /Print the banners/ })).toBeVisible();
  await page.screenshot({ path: 'e2e/evidence/10-mobile-task-cards.png', fullPage: true });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Operix' })).toBeVisible();
});

test('no script errors or failed requests occurred during the walkthrough', () => {
  // Expected authorization denials surface as HTTP statuses, never as script errors.
  const unexpected = problems.filter((p) => !/status of 40[134]/.test(p));
  expect(unexpected).toEqual([]);
});
