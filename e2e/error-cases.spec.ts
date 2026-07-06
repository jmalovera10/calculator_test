import { expect, test } from '@playwright/test';

test.describe('calculator error cases', () => {
  test('division by zero surfaces the real backend error message', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: '5', exact: true }).click();
    await page.getByRole('button', { name: '/', exact: true }).click();
    await page.getByRole('button', { name: '0', exact: true }).click();
    await page.getByRole('button', { name: '=', exact: true }).click();

    const error = page.getByRole('alert');
    await expect(error).toBeVisible();
    await expect(error).toContainText(/division by zero/i);

    // The regular numeric display is not showing while an error is active.
    await expect(page.getByTestId('display')).toHaveCount(0);
  });

  test('pressing a digit after an error clears it and starts a fresh entry', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: '5', exact: true }).click();
    await page.getByRole('button', { name: '/', exact: true }).click();
    await page.getByRole('button', { name: '0', exact: true }).click();
    await page.getByRole('button', { name: '=', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    await page.getByRole('button', { name: '7', exact: true }).click();

    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('display')).toHaveText('7');
  });
});
