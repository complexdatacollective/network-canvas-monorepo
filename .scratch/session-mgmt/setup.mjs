import { createRequire } from 'node:module';
const require = createRequire('/Users/jmh629/Projects/network-canvas-monorepo/.claude/worktrees/eager-driscoll-7fe927/apps/interviewer/package.json');
const { chromium } = require('@playwright/test');

const ART = '/var/folders/q7/ql25mp590n194x2v36dzcnh00000gp/T/interviewer-release-test.XXXXXX.uyjCh116hK/session-management';

async function waitStable(locator, frames = 20) {
  let last = null;
  let stableCount = 0;
  for (let i = 0; i < 300; i++) {
    const box = await locator.boundingBox();
    if (box && last && Math.abs(box.x - last.x) < 0.5 && Math.abs(box.y - last.y) < 0.5) {
      stableCount++;
      if (stableCount >= frames) return box;
    } else {
      stableCount = 0;
    }
    last = box;
    await new Promise((r) => setTimeout(r, 16));
  }
  return last;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.route('**://ph-relay.networkcanvas.com/**', (r) => r.abort());
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  console.log('goto...');
  await page.goto('https://interviewer.networkcanvas.dev', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${ART}/setup-00-load.png` });

  // Click "Go to card 1" pagination dot
  const goToCard1 = page.getByRole('button', { name: /Go to card 1/i });
  await goToCard1.waitFor({ state: 'visible', timeout: 15000 });
  await goToCard1.click();
  console.log('clicked go to card 1');

  // wait for install button to settle
  const installBtn = page.getByRole('button', { name: /Install sample protocol/i });
  await installBtn.waitFor({ state: 'visible', timeout: 15000 });
  await waitStable(installBtn);
  await installBtn.click();
  console.log('clicked install sample protocol');

  // wait for "Protocol imported" toast
  await page.getByText(/Protocol imported/i).waitFor({ state: 'visible', timeout: 20000 });
  console.log('PASS: Protocol imported toast seen');
  await page.screenshot({ path: `${ART}/setup-01-installed.png` });

  // Open settings (global settings gear = data-testid "settings-trigger")
  const settingsBtn = page.getByTestId('settings-trigger');
  await settingsBtn.waitFor({ state: 'visible', timeout: 15000 });
  await settingsBtn.click();
  console.log('opened settings');
  await page.screenshot({ path: `${ART}/setup-02-settings.png` });

  // Click "Synthetic data" tab
  const synthTab = page.getByRole('tab', { name: /Synthetic data/i });
  await synthTab.waitFor({ state: 'visible', timeout: 10000 });
  await synthTab.click();
  console.log('clicked synthetic data tab');
  await page.screenshot({ path: `${ART}/setup-03-synthetic-tab.png` });

  const countInput = page.getByTestId('synthetic-count');
  await countInput.waitFor({ state: 'visible', timeout: 10000 });
  await countInput.fill('30');
  console.log('filled count 30');

  const genBtn = page.getByTestId('synthetic-generate');
  await genBtn.click();
  console.log('clicked generate');

  await page.getByText(/Generated 30 synthetic sessions/i).waitFor({ state: 'visible', timeout: 30000 });
  console.log('PASS: Generated 30 synthetic sessions toast seen');
  await page.screenshot({ path: `${ART}/setup-04-generated.png` });

  // Close settings
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${ART}/setup-05-closed.png` });

  console.log('CONSOLE_ERRORS_COUNT:', consoleErrors.length);
  for (const e of consoleErrors) console.log('CONSOLE_ERROR:', e);

  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
