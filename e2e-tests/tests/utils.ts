import { Page, TestInfo, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Saves the video recorded for a page/context to a descriptive filename.
 * Should be called AFTER the context/page is closed to ensure the video file is flushed.
 */
export async function saveVideo(page: Page, name: string, testInfo: TestInfo) {
  if (!process.env.VIDEO) return;
  
  try {
    const video = page.video();
    if (!video) return;

    const newPath = testInfo.outputPath(`${name}.webm`);
    const dir = path.dirname(newPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // saveAs is a promise that waits for the video to be saved.
    // It works even if the context is already closed (and it SHOULD be closed).
    await video.saveAs(newPath);

    // Playwright keeps the original video file even after saveAs.
    // We try to delete the original one to avoid duplicates in the raw-videos folder.
    try {
      const originalPath = await video.path();
      if (originalPath && fs.existsSync(originalPath)) {
        fs.unlinkSync(originalPath);
      }
    } catch (unlinkErr) {
      // Ignore errors deleting the original file
    }
  } catch (err) {
    console.error(`Failed to save video ${name}:`, err);
  }
}

/**
 * Helper to accept a pending invitation on the home page.
 */
export async function acceptPendingInvitation(page: Page, orgName: string) {
  // Give the backend a moment to process everything
  await page.waitForTimeout(2000);
  await page.goto('/');
  
  // Wait and reload until the invitation card appears
  const inviteCard = page.getByTestId(`invitation-card-${orgName}`);
  
  await expect(async () => {
    if (!await inviteCard.isVisible()) {
      await page.reload();
      await page.waitForTimeout(1000);
    }
    await expect(inviteCard).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 20000 });
  
  // Click the accept button for THIS specific organization
  const acceptBtn = page.getByTestId(`accept-invitation-${orgName}`);
  await acceptBtn.click();
  
  // After accepting, the frontend refreshes the list on the home page.
  // We verify that the organization now appears in the Member Organizations list.
  await expect(async () => {
    const orgLink = page.getByRole('link', { name: orgName });
    if (!await orgLink.isVisible()) {
      await page.reload();
    }
    await expect(orgLink).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 20000 });
  
  // Click the link to proceed to the organization page
  await page.getByRole('link', { name: orgName }).click();
  await expect(page).toHaveURL(/\/organizations\/\d+/, { timeout: 15000 });
}

/** Team draw algorithms offered in the randomize dialog. */
export type DrawAlgorithm = 'classic' | 'gemini' | 'gpt';

/**
 * Draws the teams of a pelada from the detail page.
 *
 * Opens the randomize dialog, picks an algorithm (the dialog remembers the last
 * one, so it is always set explicitly), optionally turns chemistry off, and
 * confirms. The two new algorithms answer with a justification dialog, which is
 * closed here unless `keepReportOpen` is set — callers that assert on the
 * report need it left open.
 */
export async function randomizeTeams(
  page: Page,
  options: {
    algorithm?: DrawAlgorithm;
    useHistory?: boolean;
    keepReportOpen?: boolean;
  } = {},
) {
  const { algorithm = 'classic', useHistory = true, keepReportOpen = false } = options;

  await page.getByTestId('randomize-teams-button').click();
  await page.getByTestId(`draw-algorithm-${algorithm}`).click();

  if (algorithm !== 'classic') {
    const toggle = page.getByTestId('draw-use-history-toggle').locator('input');
    if ((await toggle.isChecked()) !== useHistory) {
      await toggle.click();
    }
  }

  await page.getByTestId('confirm-randomize-button').click();

  if (algorithm === 'classic') {
    await expect(page.getByTestId('confirm-randomize-button')).toBeHidden();
    return;
  }

  const report = page.getByTestId('close-draw-report-button');
  await expect(report).toBeVisible({ timeout: 30000 });
  if (!keepReportOpen) {
    await report.click();
    await expect(report).toBeHidden();
  }
}
