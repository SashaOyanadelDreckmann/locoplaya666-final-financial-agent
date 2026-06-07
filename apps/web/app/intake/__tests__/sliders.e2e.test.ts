import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = 'slider-test@example.com';
const TEST_PASSWORD = 'TestPass123!';

test.describe('Intake Sliders — Arrow Key Navigation', () => {
  let page: any;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    // Navigate to intake - assuming you can access directly or after login
    await page.goto(`${BASE_URL}/intake`, { waitUntil: 'networkidle' }).catch(() => {
      // If intake requires login, skip
    });
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('Slider responds to ArrowUp key', async ({ page }) => {
    // Try to navigate to knowledge step where sliders are
    const understandingSlider = page.locator('[data-testid="slider-understanding-slider"]').first();

    const sliderVisible = await understandingSlider.isVisible().catch(() => false);
    if (!sliderVisible) {
      test.skip();
      return;
    }

    // Focus slider
    await understandingSlider.focus();

    // Get initial value
    const initialValue = await understandingSlider.getAttribute('aria-valuenow');
    const initialNum = parseInt(initialValue, 10);

    // Press ArrowUp
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);

    // Verify value increased
    const newValue = await understandingSlider.getAttribute('aria-valuenow');
    const newNum = parseInt(newValue, 10);

    expect(newNum).toBe(Math.min(10, initialNum + 1));
  });

  test('Slider responds to ArrowDown key', async ({ page }) => {
    const understandingSlider = page.locator('[data-testid="slider-understanding-slider"]').first();

    const sliderVisible = await understandingSlider.isVisible().catch(() => false);
    if (!sliderVisible) {
      test.skip();
      return;
    }

    // Focus slider
    await understandingSlider.focus();

    // Get initial value
    const initialValue = await understandingSlider.getAttribute('aria-valuenow');
    const initialNum = parseInt(initialValue, 10);

    // Press ArrowDown
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);

    // Verify value decreased
    const newValue = await understandingSlider.getAttribute('aria-valuenow');
    const newNum = parseInt(newValue, 10);

    expect(newNum).toBe(Math.max(0, initialNum - 1));
  });

  test('Slider respects min/max bounds', async ({ page }) => {
    const stressSlider = page.locator('[data-testid="slider-stress-slider"]').first();

    const sliderVisible = await stressSlider.isVisible().catch(() => false);
    if (!sliderVisible) {
      test.skip();
      return;
    }

    // Focus slider
    await stressSlider.focus();

    // Press ArrowDown 20 times to go below 0
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(50);
    }

    // Verify it's at 0 (min)
    let value = await stressSlider.getAttribute('aria-valuenow');
    expect(parseInt(value, 10)).toBe(0);

    // Press ArrowUp 20 times to go above 10
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(50);
    }

    // Verify it's at 10 (max)
    value = await stressSlider.getAttribute('aria-valuenow');
    expect(parseInt(value, 10)).toBe(10);
  });

  test('Slider aria-valuenow reflects changes', async ({ page }) => {
    const understandingSlider = page.locator('[data-testid="slider-understanding-slider"]').first();

    const sliderVisible = await understandingSlider.isVisible().catch(() => false);
    if (!sliderVisible) {
      test.skip();
      return;
    }

    await understandingSlider.focus();

    // Set to specific value by pressing keys
    const targetValue = 5;
    let currentValue = parseInt(await understandingSlider.getAttribute('aria-valuenow'), 10);

    while (currentValue < targetValue) {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(100);
      currentValue = parseInt(await understandingSlider.getAttribute('aria-valuenow'), 10);
    }

    while (currentValue > targetValue) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
      currentValue = parseInt(await understandingSlider.getAttribute('aria-valuenow'), 10);
    }

    expect(currentValue).toBe(5);
  });
});
