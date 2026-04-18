import { test, expect } from '@playwright/test';

test.describe('RasoiAI Production-Ready UI Tests', () => {

  test('E2E Full Flow Validation', async ({ page }) => {
    // 1. Open the app using baseURL
    await page.goto('/');

    // Wait until network is fully idle (all initial components loaded)
    await page.waitForLoadState('networkidle');

    // Screenshot 1: Home
    await page.screenshot({ path: 'screenshots/01-home.png', fullPage: true });

    // --- MAIN FLOW ---
    // 2. Enter ingredients
    await page.fill('#ingredients-input', 'potato, onion');

    // Click generate
    await page.getByRole('button', { name: /Generate Recipe/i }).click();

    // 3. Assert and wait for the response to render safely (backend AI limit padded to 45s)
    const recipeHeading = page.locator('h1').filter({ hasNotText: 'Recipe History' }).first();
    await expect(recipeHeading).toBeVisible({ timeout: 45000 });

    // Screenshot 2: Result
    await page.screenshot({ path: 'screenshots/02-result.png', fullPage: true });

    // --- EDGE CASE: Empty Input ---
    // Clear input
    await page.fill('#ingredients-input', '');

    // Click generate again
    await page.getByRole('button', { name: /Generate Recipe/i }).click();

    // Assert that the error toast appears and block
    const errorToast = page.getByText(/Please add ingredients or an image to start/i);
    await expect(errorToast).toBeVisible();

    // Screenshot 3: Error
    await page.screenshot({ path: 'screenshots/03-error.png' });
    
    // Give toast minimal time to clear out (optional, keeps UI context clean)
    await errorToast.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    // --- OPTIONAL / HISTORY FLOW ---
    // Navigate to History Page
    await page.getByRole('button', { name: /History/i }).click();
    
    // Validate routing to history view securely
    const historyHeading = page.getByRole('heading', { name: /Recipe History/i });
    await expect(historyHeading).toBeVisible();

    // Screenshot 4: History
    await page.screenshot({ path: 'screenshots/04-history.png', fullPage: true });
  });

});
