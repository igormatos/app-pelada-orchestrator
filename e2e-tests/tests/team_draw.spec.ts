import { test, expect } from '@playwright/test';
import { saveVideo, randomizeTeams } from './utils';

test.describe('Feature: Team Draw Algorithms', () => {
  const timestamp = Date.now();
  const user = {
    name: `Draw Admin ${timestamp}`,
    username: `draw_admin_${timestamp}`,
    email: `draw-admin-${timestamp}@example.com`,
    password: 'password123',
  };
  const orgName = `Draw Club ${timestamp}`;

  test('should draw teams with each algorithm and justify the result', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();
    page.on('dialog', dialog => dialog.accept());

    try {
      await test.step('Setup: Register and Create Organization', async () => {
        await page.goto('/register');
        await page.getByTestId('register-name').fill(user.name);
        await page.getByTestId('register-username').fill(user.username);
        await page.getByTestId('register-email').fill(user.email);
        await page.getByTestId('register-password').fill(user.password);
        await page.getByTestId('register-submit').click();
        await expect(page).toHaveURL('/');

        await page.getByTestId('create-org-open-dialog').click();
        await page.getByTestId('org-name-input').fill(orgName);
        await page.getByTestId('org-submit-button').click();

        const orgLink = page.getByTestId(`org-link-${orgName}`);
        await expect(orgLink).toBeVisible();
        await orgLink.click();
      });

      await test.step('Create Pelada and Close Attendance', async () => {
        await page.getByTestId('create-pelada-submit').scrollIntoViewIfNeeded();
        await page.getByTestId('create-pelada-submit').click();
        await expect(page).toHaveURL(/\/peladas\/\d+\/attendance/);

        await page.getByRole('button', { name: /I'm In/i }).click();
        await page.getByRole('button', { name: /Close List and Create Teams/i }).click();
        await expect(page).toHaveURL(/\/peladas\/\d+$/);

        await page.getByTestId('create-team-button').click();
        await page.getByTestId('create-team-button').click();
      });

      await test.step('Classic draw keeps working and shows no report', async () => {
        await randomizeTeams(page, { algorithm: 'classic' });

        await expect(page.getByTestId('team-card-name').first()).toBeVisible();
        await expect(page.getByTestId('close-draw-report-button')).toBeHidden();
      });

      await test.step('Chemistry draw explains itself', async () => {
        await randomizeTeams(page, {
          algorithm: 'gemini',
          useHistory: true,
          keepReportOpen: true,
        });

        await expect(page.getByTestId('draw-report-team-0')).toBeVisible();
        await expect(page.getByTestId('draw-report-team-1')).toBeVisible();

        await page.getByTestId('close-draw-report-button').click();
        await expect(page.getByTestId('close-draw-report-button')).toBeHidden();
        await expect(page.getByTestId('team-card-name').first()).toBeVisible();
      });

      await test.step('Tactical draw explains itself', async () => {
        await randomizeTeams(page, {
          algorithm: 'gpt',
          useHistory: true,
          keepReportOpen: true,
        });

        const firstTeam = page.getByTestId('draw-report-team-0');
        await expect(firstTeam).toBeVisible();

        // The panel opens to the players and the evidence behind the division.
        await firstTeam.click();
        await expect(firstTeam.getByText(user.name)).toBeVisible();

        await page.getByTestId('close-draw-report-button').click();
      });

      await test.step('Chemistry can be turned off', async () => {
        await randomizeTeams(page, {
          algorithm: 'gemini',
          useHistory: false,
          keepReportOpen: true,
        });

        await expect(page.getByTestId('draw-report-team-0')).toBeVisible();
        await page.getByTestId('close-draw-report-button').click();
      });

      await test.step('The drawn teams survive a reload', async () => {
        await page.reload();
        await expect(page.getByTestId('team-card-name').first()).toBeVisible();
        // The report belongs to the draw that just ran, not to the page.
        await expect(page.getByTestId('close-draw-report-button')).toBeHidden();
      });
    } finally {
      await context.close();
      await saveVideo(page, 'team-draw-algorithms', testInfo);
    }
  });
});
