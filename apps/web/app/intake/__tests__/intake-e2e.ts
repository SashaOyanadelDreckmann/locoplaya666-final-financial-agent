import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'https://financieramente.up.railway.app';

/**
 * Helper: Click a chip button by visible text
 */
async function clickChip(page: Page, text: string) {
  const btn = page.locator(`button:has-text("${text}")`).first();
  await btn.click();
  await page.waitForTimeout(600);
}

/**
 * Helper: Click the → next arrow button
 */
async function clickNextArrow(page: Page) {
  const btn = page.locator('button.intake-qnav-next').first();
  await expect(btn).toBeVisible();
  await btn.click();
  await page.waitForTimeout(800);
}

/**
 * Helper: Set slider value using arrow keys
 * Reads current aria-valuenow and presses keys until reaching target
 */
async function setSliderByArrowKeys(page: Page, sliderTestId: string, targetValue: number) {
  const slider = page.locator(`[data-testid="${sliderTestId}"]`).first();
  await expect(slider).toBeVisible();

  // Focus the slider
  await slider.focus();

  // Get current value from aria-valuenow
  const currentStr = await slider.getAttribute('aria-valuenow');
  const currentValue = parseInt(currentStr || '5', 10);

  const diff = targetValue - currentValue;

  if (diff > 0) {
    // Increment with ArrowUp
    for (let i = 0; i < diff; i++) {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(150);
    }
  } else if (diff < 0) {
    // Decrement with ArrowDown
    for (let i = 0; i < Math.abs(diff); i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(150);
    }
  }

  // Wait and verify
  await page.waitForTimeout(400);
  const finalValue = await slider.getAttribute('aria-valuenow');
  expect(parseInt(finalValue || '5', 10)).toBe(targetValue);

  return finalValue;
}

test.describe('Intake Form Complete Flow', () => {
  test('User can complete entire intake form with sliders set correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

    // Login with test user
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    const testPassword = process.env.TEST_PASSWORD || 'TestPass123!';

    await page.fill('#login-email', testEmail);
    await page.fill('#login-password', testPassword);
    await page.click('button.auth-submit');

    // Wait for navigation to intake
    await page.waitForURL('**/intake**', { timeout: 20000 });
    await page.waitForTimeout(1000);

    // ── CONTEXT STEP ──
    // Q1: Age
    await page.fill('#age-exact', '28');
    await clickNextArrow(page);

    // Q2: City
    const cityInput = page.locator('input[id="city"], input[placeholder*="ciudad" i]').first();
    await cityInput.fill('Maipú');
    await clickNextArrow(page);

    // Q3: Employment
    await clickChip(page, 'Dependiente');

    // Q4: Profession
    const profInput = page.locator('#profession').first();
    await profInput.fill('Vendedora retail');
    await clickNextArrow(page);

    // ── CASHFLOW STEP ──
    await clickChip(page, '$300k – $600k');

    // Optional exact income
    const exactIncomeInput = page.locator('input[placeholder*="Monto exacto" i]').first();
    const exactIncomeVisible = await exactIncomeInput.isVisible().catch(() => false);
    if (exactIncomeVisible) {
      await exactIncomeInput.fill('620000');
    }

    await page.waitForTimeout(500);
    await clickChip(page, 'A veces no alcanza');

    await page.waitForTimeout(500);
    await clickChip(page, 'A veces');

    // ── SAVINGS STEP ──
    await page.waitForTimeout(600);
    await clickChip(page, 'Todavía no');

    await page.waitForTimeout(500);
    await clickChip(page, 'Sí, tengo deudas');

    // ── KNOWLEDGE STEP ──
    await page.waitForTimeout(600);

    // Knowledge Group 1: Check one item
    const knowledgeChip1 = page.locator('button.intake-chip-sm:has-text("Cómo se calculan los intereses")').first();
    const chip1Visible = await knowledgeChip1.isVisible().catch(() => false);
    if (chip1Visible) {
      await knowledgeChip1.click();
    }
    await clickNextArrow(page);

    // Knowledge Group 2
    await page.waitForTimeout(500);
    const knowledgeChip2 = page.locator('button.intake-chip-sm:has-text("Inflación y UF")').first();
    const chip2Visible = await knowledgeChip2.isVisible().catch(() => false);
    if (chip2Visible) {
      await knowledgeChip2.click();
    }
    await clickNextArrow(page);

    // Knowledge Group 3 (no selection)
    await page.waitForTimeout(500);
    await clickNextArrow(page);

    // Risk reaction
    await page.waitForTimeout(500);
    await clickChip(page, 'Vendo todo');

    // ── SLIDERS ──
    // Self-rated understanding → 3
    await page.waitForTimeout(500);
    const understandingValue = await setSliderByArrowKeys(page, 'slider-understanding-slider', 3);
    expect(parseInt(understandingValue, 10)).toBe(3);

    await clickNextArrow(page);

    // Stress level → 7
    await page.waitForTimeout(500);
    const stressValue = await setSliderByArrowKeys(page, 'slider-stress-slider', 7);
    expect(parseInt(stressValue, 10)).toBe(7);

    // ── SUBMIT ──
    await page.waitForTimeout(300);
    const submitBtn = page.locator('button.intake-qnav-next').first();
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Should navigate to /agent
    await page.waitForURL('**/agent**', { timeout: 20000 });
    await page.waitForTimeout(2000);

    // Verify we're on agent page with diagnosis
    const agentContent = await page.locator('body').innerText();
    expect(agentContent).toContain('Diagnóstico');
  });
});
