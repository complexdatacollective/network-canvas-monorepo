import { createRequire } from 'node:module';
const require = createRequire('/Users/jmh629/Projects/network-canvas-monorepo/.claude/worktrees/eager-driscoll-7fe927/apps/interviewer/package.json');
const { chromium, expect } = require('@playwright/test');

const ART = '/var/folders/q7/ql25mp590n194x2v36dzcnh00000gp/T/interviewer-release-test.XXXXXX.uyjCh116hK/session-management';
const BASE = 'https://interviewer.networkcanvas.dev';

const results = []; // { name, status, detail }
function record(name, status, detail) {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail ? ' :: ' + detail : ''}`);
}

async function shot(page, name) {
  await page.screenshot({ path: `${ART}/${name}.png` });
}

// The DataView table fades/slides in via motion (opacity 0 -> 1); Playwright's
// visibility check ignores opacity, so a screenshot taken right after a DOM
// read can capture a still-transparent table. Settle before capturing.
async function stableShot(page, name) {
  await page.waitForTimeout(700);
  await shot(page, name);
}

async function waitStable(locator, frames = 20, maxMs = 6000) {
  let last = null;
  let stableCount = 0;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const box = await locator.boundingBox().catch(() => null);
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

async function clickWhenDeckSettles(locator) {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  await waitStable(locator);
  await locator.click();
}

// ---------- IndexedDB helper ----------
async function getSessionRow(page, sessionId) {
  return page.evaluate((id) => {
    return new Promise((resolve) => {
      const req = indexedDB.open('interviewer');
      req.onsuccess = () => {
        const get = req.result.transaction('sessions', 'readonly').objectStore('sessions').get(id);
        get.onsuccess = () => resolve(get.result ?? null);
        get.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  }, sessionId);
}

// ---------- Setup ----------
async function setup(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await shot(page, 'setup-00-load');

  await clickWhenDeckSettles(page.getByRole('button', { name: /Go to card 1/i }));
  const installBtn = page.getByRole('button', { name: /Install sample protocol/i });
  await clickWhenDeckSettles(installBtn);
  await page.getByText(/Protocol imported/i).waitFor({ state: 'visible', timeout: 20000 });
  console.log('setup: protocol imported');

  await page.getByTestId('settings-trigger').click();
  await page.getByRole('tab', { name: /Synthetic data/i }).click();
  const countInput = page.getByTestId('synthetic-count');
  await countInput.waitFor({ state: 'visible', timeout: 10000 });
  await countInput.fill('30');
  await page.getByTestId('synthetic-generate').click();
  await page.getByText(/Generated 30 synthetic sessions/i).waitFor({ state: 'visible', timeout: 30000 });
  console.log('setup: generated 30 synthetic sessions');
  await shot(page, 'setup-generated');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}

async function gotoData(page) {
  if (!/\/data/.test(page.url())) {
    await page.locator('[aria-label="Home view"]').getByRole('button', { name: /^Data$/ }).click();
    await page.waitForURL(/\/data/, { timeout: 10000 });
  }
  await page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 10000 });
}

function tableRows(page) {
  return page.locator('table tbody tr');
}

async function getCaseIdsOnPage(page) {
  const rows = tableRows(page);
  const count = await rows.count();
  const ids = [];
  for (let i = 0; i < count; i++) {
    const text = await rows.nth(i).locator('td').nth(1).innerText();
    ids.push(text.trim());
  }
  return ids;
}

// ---------- Check 1 ----------
async function check1(page) {
  const name = '1. Data view table + pagination';
  try {
    await gotoData(page);
    const headers = await page.locator('table thead th').allInnerTexts();
    const headerText = headers.join(' | ');
    console.log('check1 headers:', headerText);
    for (const col of ['Case ID', 'Protocol', 'Started', 'Updated', 'Progress', 'Export status']) {
      if (!headers.some((h) => h.includes(col))) {
        throw new Error(`Missing column header "${col}"; headers were: ${headerText}`);
      }
    }
    // default page size 25
    const pageSizeSelect = page.locator('select[name="pageSize"]');
    const pageSizeVal = await pageSizeSelect.inputValue().catch(() => null);
    if (pageSizeVal !== '25') {
      throw new Error(`Default page size expected 25, got ${pageSizeVal}`);
    }
    const rowsPage1 = tableRows(page);
    const rowCount1 = await rowsPage1.count();
    if (rowCount1 !== 25) throw new Error(`Expected 25 rows on page 1, got ${rowCount1}`);
    const page1Ids = await getCaseIdsOnPage(page);
    await stableShot(page, 'check1-page1');

    const nextBtn = page.getByRole('button', { name: 'Go to next page' });
    await nextBtn.click();
    await page.waitForTimeout(500);
    const page2Ids = await getCaseIdsOnPage(page);
    await stableShot(page, 'check1-page2');

    if (page2Ids.length === 0) throw new Error('Page 2 has no rows');
    const overlap = page2Ids.filter((id) => page1Ids.includes(id));
    if (overlap.length > 0) {
      throw new Error(`Page 2 overlaps page 1 by ${overlap.length} rows: ${overlap.join(',')}`);
    }
    console.log(`check1: page1=${page1Ids.length} rows, page2=${page2Ids.length} rows, no overlap`);
    // go back to page 1 for subsequent checks
    await page.getByRole('button', { name: 'Go to first page' }).click();
    await page.waitForTimeout(300);
    record(name, 'pass', `page1=${page1Ids.length}, page2=${page2Ids.length}, no overlap`);
  } catch (e) {
    await shot(page, 'check1-FAIL');
    record(name, 'fail', e.message);
  }
}

// ---------- Check 2 ----------
async function check2(page) {
  const name = '2. Status chip filters';
  try {
    await gotoData(page);
    const statusGroup = page.locator('[aria-label="Status filter"]');
    await statusGroup.waitFor({ state: 'visible', timeout: 10000 });
    const allBtn = statusGroup.getByRole('button', { name: /^All ·/ });
    const inProgBtn = statusGroup.getByRole('button', { name: /^In progress ·/ });
    const completeBtn = statusGroup.getByRole('button', { name: /^Complete ·/ });

    const allText = (await allBtn.innerText()).trim();
    const inProgText = (await inProgBtn.innerText()).trim();
    const completeText = (await completeBtn.innerText()).trim();
    const parseCount = (t) => Number(t.split('·')[1].trim());
    const allCount = parseCount(allText);
    const inProgCount = parseCount(inProgText);
    const completeCount = parseCount(completeText);
    console.log(`check2 counts: all=${allCount} inProgress=${inProgCount} complete=${completeCount}`);
    if (inProgCount + completeCount !== allCount) {
      throw new Error(`Counts inconsistent: ${inProgCount} + ${completeCount} != ${allCount}`);
    }

    await inProgBtn.click();
    await page.waitForURL(/status=in-progress/, { timeout: 10000 });
    await page.waitForTimeout(300);
    const inProgRows = await tableRows(page).count();
    const visibleInProg = Math.min(inProgCount, 25);
    if (inProgRows !== visibleInProg) {
      throw new Error(`In-progress filter row count mismatch: expected ${visibleInProg}, got ${inProgRows}`);
    }
    await stableShot(page, 'check2-in-progress');

    await completeBtn.click();
    await page.waitForURL(/status=complete/, { timeout: 10000 });
    await page.waitForTimeout(300);
    const completeRows = await tableRows(page).count();
    const visibleComplete = Math.min(completeCount, 25);
    if (completeRows !== visibleComplete) {
      throw new Error(`Complete filter row count mismatch: expected ${visibleComplete}, got ${completeRows}`);
    }
    await stableShot(page, 'check2-complete');

    record(name, 'pass', `all=${allCount} inProgress=${inProgCount} complete=${completeCount}`);
  } catch (e) {
    await shot(page, 'check2-FAIL');
    record(name, 'fail', e.message);
  }
}

// ---------- Check 3 ----------
async function check3(page) {
  const name = '3. Search by case-ID substring';
  try {
    await gotoData(page);
    // reset status filter to All first (leftover from check2)
    const allBtn = page.locator('[aria-label="Status filter"]').getByRole('button', { name: /^All ·/ });
    await allBtn.click();
    await page.waitForTimeout(300);

    const firstCaseId = (await tableRows(page).first().locator('td').nth(1).innerText()).trim();
    const substring = firstCaseId.slice(0, 14); // "synthetic-XXXX" prefix chunk
    console.log('check3: searching substring', substring);

    const search = page.getByTestId('data-search');
    await search.fill(substring);
    await page.waitForURL(new RegExp(`q=${encodeURIComponent(substring)}`), { timeout: 10000 }).catch(async () => {
      // URL encoding may differ; fall back to generic q= check
      await page.waitForURL(/[?&]q=/, { timeout: 5000 });
    });
    await page.waitForTimeout(400);
    const rows = tableRows(page);
    const rowCount = await rows.count();
    if (rowCount === 0) throw new Error('Search produced zero rows');
    for (let i = 0; i < rowCount; i++) {
      const text = (await rows.nth(i).locator('td').nth(1).innerText()).trim();
      if (!text.includes(substring)) {
        throw new Error(`Row caseId "${text}" does not include search substring "${substring}"`);
      }
    }
    const url = page.url();
    if (!/[?&]q=/.test(url)) throw new Error(`URL missing ?q= param: ${url}`);
    await stableShot(page, 'check3-search');
    record(name, 'pass', `substring="${substring}" matched ${rowCount} rows, url has ?q=`);
  } catch (e) {
    await shot(page, 'check3-FAIL');
    record(name, 'fail', e.message);
  }
}

// ---------- Check 4 ----------
async function check4(page) {
  const name = '4. Clear filters + sort by Case ID';
  try {
    await gotoData(page);
    // Clear status (select All) and search
    const allBtn = page.locator('[aria-label="Status filter"]').getByRole('button', { name: /^All ·/ });
    await allBtn.click();
    const search = page.getByTestId('data-search');
    await search.fill('');
    await page.waitForTimeout(400);

    let url = new URL(page.url());
    if (url.searchParams.has('status')) throw new Error(`?status= still present: ${url.search}`);
    if (url.searchParams.has('q')) throw new Error(`?q= still present: ${url.search}`);
    const rowCount = await tableRows(page).count();
    if (rowCount !== 25) throw new Error(`Expected 25 rows after clearing filters, got ${rowCount}`);
    await stableShot(page, 'check4-cleared');

    // Sort by Case ID - first click ascending
    const caseIdHeader = page.locator('table thead').getByRole('button', { name: /Case ID/i });
    await caseIdHeader.click();
    await page.waitForURL(/sort=caseId/, { timeout: 10000 });
    await page.waitForTimeout(300);
    const ascIds = await getCaseIdsOnPage(page);
    const sortedAsc = [...ascIds].sort((a, b) => a.localeCompare(b));
    if (JSON.stringify(ascIds) !== JSON.stringify(sortedAsc)) {
      throw new Error(`Rows not ascending after first click: ${ascIds.slice(0, 5).join(',')}...`);
    }
    let u1 = new URL(page.url());
    if (u1.searchParams.get('sort') !== 'caseId') throw new Error(`?sort=caseId missing after click 1: ${u1.search}`);
    await stableShot(page, 'check4-sort-asc');

    await caseIdHeader.click();
    await page.waitForTimeout(400);
    const descIds = await getCaseIdsOnPage(page);
    const sortedDesc = [...descIds].sort((a, b) => b.localeCompare(a));
    if (JSON.stringify(descIds) !== JSON.stringify(sortedDesc)) {
      throw new Error(`Rows not descending after second click: ${descIds.slice(0, 5).join(',')}...`);
    }
    let u2 = new URL(page.url());
    if (u2.searchParams.get('sort') !== 'caseId') throw new Error(`?sort=caseId missing after click 2: ${u2.search}`);
    await stableShot(page, 'check4-sort-desc');

    record(name, 'pass', 'filters cleared (25 rows), asc+desc sort verified by row order and URL');
  } catch (e) {
    await shot(page, 'check4-FAIL');
    record(name, 'fail', e.message);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.route('**://ph-relay.networkcanvas.com/**', (r) => r.abort());
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await setup(page);
  await check1(page);
  await check2(page);
  await check3(page);
  await check4(page);

  console.log('CONSOLE_ERRORS_COUNT:', consoleErrors.length);
  for (const e of consoleErrors) console.log('CONSOLE_ERROR:', e);

  console.log('RESULTS_JSON:', JSON.stringify(results));
  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
