import { expect, test, type Page } from '@playwright/test';

import {
  type ArabicPageAuditOptions,
  auditArabicPage,
} from '@codaco/e2e-helpers/arabic-page-audit';

/**
 * The audit `arabic.spec.ts` runs, checked on pages written out by hand. It
 * reads layout, so it is checked here in a real browser rather than in
 * `@codaco/e2e-helpers`'s jsdom tests, which have none.
 */

const audit = async (
  page: Page,
  body: string,
  options: ArabicPageAuditOptions = {},
  root = '<html lang="ar" dir="rtl">',
) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent(`<!doctype html>${root}<body>${body}</body></html>`);
  return page.evaluate(auditArabicPage, options);
};

test('accepts a page in Arabic', async ({ page }) => {
  expect(await audit(page, '<h1>البروتوكول</h1><p>المراحل</p>')).toEqual([]);
});

test('reports a page that is not marked Arabic or not right to left', async ({
  page,
}) => {
  const issues = await audit(
    page,
    '<p>المراحل</p>',
    {},
    '<html lang="en" dir="ltr">',
  );
  expect(issues).toContain(`the page's language is "en", not Arabic`);
  expect(issues).toContain('the page is not laid out right to left');
});

test('reports Latin text left loose in the interface', async ({ page }) => {
  const issues = await audit(page, '<p>المرحلة: Name Generator</p>');
  expect(issues).toHaveLength(1);
  expect(issues[0]).toContain('Name Generator');
});

test('accepts Latin text set apart in its own direction', async ({ page }) => {
  expect(
    await audit(
      page,
      [
        '<p>المرحلة: <span dir="auto">Name Generator</span></p>',
        '<p>المرحلة: <bdi>Roster</bdi></p>',
        '<p>المرحلة: <code>removeAfterConsideration</code></p>',
        '<p>المرحلة: <span style="unicode-bidi: isolate">Sociogram</span></p>',
        '<p style="unicode-bidi: plaintext">Family Pedigree</p>',
        '<p>المرحلة: ⁨Alter Form⁩</p>',
        '<p>اكتب «Ego» هنا</p>',
        '<p>اللغة: en-US، zh-Hans، es-419</p>',
        '<input value="typed text">',
      ].join(''),
    ),
  ).toEqual([]);
});

test('does not take an isolating block as setting its text apart', async ({
  page,
}) => {
  // Browsers isolate most blocks by default; a block's own text still takes
  // the paragraph's direction.
  const issues = await audit(
    page,
    '<div style="unicode-bidi: isolate">Name Generator</div>',
  );
  expect(issues).toHaveLength(1);
});

test('takes a lowercase hyphenated token for text, not a language tag', async ({
  page,
}) => {
  const issues = await audit(page, '<p>اللون: ord-color-seq-6</p>');
  expect(issues).toHaveLength(1);
  expect(issues[0]).toContain('ord color seq');
});

test('accepts the listed untranslated words, and only those', async ({
  page,
}) => {
  const body = '<p>مرحبًا بك في Architect</p><p>افتح Interviewer</p>';
  const issues = await audit(page, body, { untranslated: ['Architect'] });
  expect(issues).toHaveLength(1);
  expect(issues[0]).toContain('Interviewer');
});

test('ignores what nobody reads and what the caller excludes', async ({
  page,
}) => {
  expect(
    await audit(
      page,
      [
        '<p aria-hidden="true">Loading</p>',
        '<p hidden>Loading</p>',
        '<p style="display: none">Loading</p>',
        '<div style="display: none"><span>Loading</span></div>',
        '<div style="visibility: hidden"><span>Loading</span></div>',
        '<details><summary>التفاصيل</summary><span>Loading</span></details>',
        '<div style="display: none"><button aria-label="Close">×</button></div>',
        '<pre-rendered-preview><p>Preview</p></pre-rendered-preview>',
      ].join(''),
      { exclude: ['pre-rendered-preview'] },
    ),
  ).toEqual([]);
});

test('reports Arabic text marked as another language', async ({ page }) => {
  const issues = await audit(page, '<p lang="en">المراحل</p>');
  expect(issues).toHaveLength(1);
  expect(issues[0]).toContain('under lang="en"');
});

test('reports Latin text seen only on demand: a tooltip, alt text, an option', async ({
  page,
}) => {
  const issues = await audit(
    page,
    [
      '<img alt="Network icon" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">',
      '<button title="Close">×</button>',
      '<select><option>سارة</option><option>Other</option><option lang="es">Español</option></select>',
    ].join(''),
  );
  expect(issues).toHaveLength(3);
  expect(issues.join('\n')).toContain('alt “Network icon”');
  expect(issues.join('\n')).toContain('title “Close”');
  expect(issues.join('\n')).toContain('an option “Other”');
});

// Text only a screen reader reads is English in every language, names
// inserted into it included, and an element holding translated text cannot
// be marked English without marking that text too.
test('accepts English screen-reader text, names inserted in it included', async ({
  page,
}) => {
  const hidden =
    'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)';
  const issues = await audit(
    page,
    [
      '<ul aria-label="People"><li>سارة</li></ul>',
      '<button aria-label="file upload">رفع</button>',
      `<span style="${hidden}">Loading</span>`,
      `<span style="${hidden}">team-b! and سارة</span>`,
      `<div aria-live="polite" style="${hidden}">Choose where سارة belongs.</div>`,
    ].join(''),
  );
  expect(issues).toEqual([]);
});

test('accepts an attribute that repeats a name the page shows set apart', async ({
  page,
}) => {
  expect(
    await audit(
      page,
      '<bdi>Roster</bdi><button aria-label="⁨Roster⁩">فتح</button>',
    ),
  ).toEqual([]);
});

test('reports a box that runs past the window, unless clipped or hidden', async ({
  page,
}) => {
  const issues = await audit(
    page,
    [
      '<div id="wide" style="width: 1200px">عريض</div>',
      '<div style="overflow: hidden"><div style="width: 1200px">مقصوص</div></div>',
      // Decoration hidden from screen readers, like the celebration's
      // particles, is not part of the page anyone reads.
      '<div aria-hidden="true"><div style="width: 1200px">زينة</div></div>',
    ].join(''),
  );
  expect(issues).toHaveLength(1);
  expect(issues[0]).toMatch(
    /^<div#wide> “عريض” runs from -?\d+px to \d+px in a 800px window$/,
  );
});
