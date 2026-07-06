import { expect, test } from '@playwright/test';

test.describe('calculator happy path', () => {
  test('12 + 5 = shows 17, with the full expression visible while composing', async ({ page }) => {
    await page.goto('/');

    const display = page.getByTestId('display');
    await expect(display).toHaveText('0');

    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: '2', exact: true }).click();
    await expect(display).toHaveText('12');

    await page.getByRole('button', { name: '+', exact: true }).click();
    await expect(display).toHaveText('12 +');

    await page.getByRole('button', { name: '5', exact: true }).click();
    await expect(display).toHaveText('12 + 5');

    await page.getByRole('button', { name: '=', exact: true }).click();
    await expect(display).toHaveText('17');
  });

  test('chains from the last result: (previous answer) * 3 = shows 51', async ({ page }) => {
    await page.goto('/');

    const display = page.getByTestId('display');

    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: '2', exact: true }).click();
    await page.getByRole('button', { name: '+', exact: true }).click();
    await page.getByRole('button', { name: '5', exact: true }).click();
    await page.getByRole('button', { name: '=', exact: true }).click();
    await expect(display).toHaveText('17');

    // Pressing an operator right after a result reuses it as the first operand.
    await page.getByRole('button', { name: '*', exact: true }).click();
    await expect(display).toHaveText('17 *');

    await page.getByRole('button', { name: '3', exact: true }).click();
    await expect(display).toHaveText('17 * 3');

    await page.getByRole('button', { name: '=', exact: true }).click();
    await expect(display).toHaveText('51');
  });

  test('C clears back to a fresh zero', async ({ page }) => {
    await page.goto('/');

    const display = page.getByTestId('display');

    await page.getByRole('button', { name: '9', exact: true }).click();
    await page.getByRole('button', { name: '+', exact: true }).click();
    await page.getByRole('button', { name: '1', exact: true }).click();
    await expect(display).toHaveText('9 + 1');

    await page.getByRole('button', { name: 'C', exact: true }).click();
    await expect(display).toHaveText('0');
  });
});
