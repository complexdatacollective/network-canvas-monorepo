# NetworkCanvas.com Internationalisation and CSV Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Statically generate complete English and Spanish versions of
NetworkCanvas.com with `next-intl`, browser-language redirects, and build-time
CSV content for Latest News, Publications, Grants, and Core Team.

**Architecture:** Every content route is emitted under `/en` and `/es`; `/`
redirects at Netlify's CDN edge according to browser language and defaults to
English elsewhere. A server-only Zod-validated CSV loader selects paired
English/Spanish fields at build time and passes serializable records into the
existing section components. All remaining UI copy lives in typed `next-intl`
message catalogs.

**Tech Stack:** Next.js 16 static export, React 19, `next-intl` 4.13,
`csvtojson` 2, Zod 4, Vitest, Testing Library, TypeScript 6, Netlify redirects,
Turbo, oxlint, and oxfmt.

## Global Constraints

- Keep `output: 'export'`; do not add middleware, functions, runtime content
  fetching, or browser-only translations.
- Generate exactly `/en`, `/es`, `/en/download`, and `/es/download`.
- Use `en` as the source and default locale; use neutral international Spanish.
- Preserve the current page structure, section markup, animation behavior,
  styling, CSV row order, and the first-four publication limit.
- Add a compact `English / Español` selector to desktop navigation, mobile
  navigation, and footer; switching locale preserves the current page.
- Store Latest News, Publications, Grants, and Core Team in four CSV files with
  stable IDs, shared structural fields, and paired `_en`/`_es` fields.
- Missing files, empty datasets, duplicate IDs, blank translations, invalid
  HTTPS URLs, invalid `/images/...` paths, or missing message keys must fail the
  build without locale fallback.
- Error messages for invalid CSV cells include the filename, one-based data-row
  number, and field name.
- Keep complete externalizable messages; use `t.rich` instead of concatenated
  sentence fragments.
- Preserve keyboard operation, focus treatment, accessible names, and reduced
  motion.
- Do not introduce `any`, TypeScript assertions, ignore rules, barrel files, or
  convenience re-exports.
- Run oxlint with `--fix` and oxfmt on every touched code/config/content file.
- Application-only changes do not require a changeset.

---

## File Structure

### New files

- `apps/networkcanvas.com/app/[locale]/layout.tsx` — validates a locale, loads
  messages, renders locale-aware metadata and the document shell.
- `apps/networkcanvas.com/app/[locale]/page.tsx` — statically renders localized
  home content and supplies CSV records.
- `apps/networkcanvas.com/app/[locale]/download/page.tsx` — localized download
  page and metadata.
- `apps/networkcanvas.com/lib/i18n/locales.ts` — supported locale constants,
  type, and static params.
- `apps/networkcanvas.com/lib/i18n/routing.ts` — `next-intl` routing settings.
- `apps/networkcanvas.com/lib/i18n/request.ts` — message loading for each locale.
- `apps/networkcanvas.com/lib/i18n/navigation.ts` — locale-aware `Link`,
  `usePathname`, and `useRouter` exports from their original next-intl API.
- `apps/networkcanvas.com/messages/en.json` — complete source messages.
- `apps/networkcanvas.com/messages/es.json` — complete Spanish messages with the
  same nested keys.
- `apps/networkcanvas.com/content/latest-news.csv` — localized news records.
- `apps/networkcanvas.com/content/publications.csv` — localized publication
  records.
- `apps/networkcanvas.com/content/grants.csv` — localized grant records.
- `apps/networkcanvas.com/content/core-team.csv` — localized core team records.
- `apps/networkcanvas.com/lib/siteContent.ts` — CSV schemas, validation,
  localization, and `loadSiteContent`.
- `apps/networkcanvas.com/lib/__tests__/siteContent.test.ts` — filesystem-backed
  loader behavior tests.
- `apps/networkcanvas.com/lib/__tests__/messages.test.ts` — catalog key parity and
  non-empty value tests.
- `apps/networkcanvas.com/components/layout/LanguageSelector.tsx` — route-
  preserving locale selection and Netlify preference cookie.
- `apps/networkcanvas.com/components/layout/__tests__/LanguageSelector.test.tsx`
  — locale switch, current state, and preference persistence tests.
- `apps/networkcanvas.com/test/renderWithIntl.tsx` — shared test renderer with a
  real `NextIntlClientProvider`.
- `apps/networkcanvas.com/netlify.toml` — ordered Spanish and English root
  redirects.

### Removed paths

- `apps/networkcanvas.com/app/download/page.tsx` — replaced by the locale route.
- The current home implementation in `apps/networkcanvas.com/app/page.tsx` —
  replaced with a static English redirect fallback.

### Modified files

- `apps/networkcanvas.com/package.json`, `pnpm-lock.yaml`,
  `apps/networkcanvas.com/next.config.ts`, `apps/networkcanvas.com/types.d.ts`,
  and `turbo.json`.
- `apps/networkcanvas.com/lib/content.ts` becomes locale-neutral configuration;
  the four dynamic arrays and rendered labels leave this file.
- `Header.tsx`, `ProjectsMenu.tsx`, `Footer.tsx`, `ButtonLink.tsx`, and
  `PillLink.tsx` use localized copy/navigation.
- `HeroIntro.tsx`, `Hero.tsx`, `NewsTicker.tsx`, `Tools.tsx`,
  `VideoSection.tsx`, `DesignPrinciples.tsx`, `Grants.tsx`,
  `Publications.tsx`, `CoreTeam.tsx`, `Contractors.tsx`, `Institutions.tsx`,
  `WhatNext.tsx`, and `MailingListForm.tsx` consume messages and/or CSV props.
- `DeviceMockup.tsx` localizes the three descriptive screenshot alternatives
  without changing screenshot paths or framing.
- Existing component tests receive message providers and explicit content
  fixtures.

---

### Task 1: Establish Static Locale Routing and Typed Messages

**Files:**

- Create: `apps/networkcanvas.com/lib/i18n/locales.ts`
- Create: `apps/networkcanvas.com/lib/i18n/routing.ts`
- Create: `apps/networkcanvas.com/lib/i18n/request.ts`
- Create: `apps/networkcanvas.com/lib/i18n/navigation.ts`
- Create: `apps/networkcanvas.com/messages/en.json`
- Create: `apps/networkcanvas.com/messages/es.json`
- Create: `apps/networkcanvas.com/app/[locale]/layout.tsx`
- Create: `apps/networkcanvas.com/app/[locale]/page.tsx`
- Move: `apps/networkcanvas.com/app/download/page.tsx` to
  `apps/networkcanvas.com/app/[locale]/download/page.tsx`
- Modify: `apps/networkcanvas.com/app/layout.tsx`
- Modify: `apps/networkcanvas.com/app/page.tsx`
- Modify: `apps/networkcanvas.com/next.config.ts`
- Modify: `apps/networkcanvas.com/types.d.ts`
- Modify: `apps/networkcanvas.com/package.json`
- Modify: `pnpm-lock.yaml`
- Test: `apps/networkcanvas.com/lib/__tests__/messages.test.ts`
- Test: `apps/networkcanvas.com/app/__tests__/localeRouting.test.ts`

**Interfaces:**

- Produces: `locales: readonly ['en', 'es']`.
- Produces: `type Locale = 'en' | 'es'`.
- Produces: `getStaticLocaleParams(): Array<{locale: Locale}>`.
- Produces: `routing` with `defaultLocale: 'en'` and
  `localePrefix: 'always'`.
- Produces: locale-aware `Link`, `usePathname`, and `useRouter` from
  `~/lib/i18n/navigation`.
- Produces: typed `Metadata`, `LanguageSelector`, and placeholder namespaces in
  both catalogs. Later tasks expand the catalogs without changing these keys.

- [ ] **Step 1: Add failing locale and catalog tests**

Create `localeRouting.test.ts` with these assertions:

```ts
import { describe, expect, it } from 'vitest';

import { getStaticLocaleParams, locales } from '~/lib/i18n/locales';
import { routing } from '~/lib/i18n/routing';

describe('locale routing', () => {
  it('generates English and Spanish static params', () => {
    expect(locales).toEqual(['en', 'es']);
    expect(getStaticLocaleParams()).toEqual([
      { locale: 'en' },
      { locale: 'es' },
    ]);
  });

  it('always prefixes routes and defaults to English', () => {
    expect(routing.defaultLocale).toBe('en');
    expect(routing.localePrefix).toBe('always');
  });
});
```

Create `messages.test.ts` with a recursive key collector and assert that English
and Spanish have identical leaf keys and no blank strings:

```ts
import { describe, expect, it } from 'vitest';

import en from '~/messages/en.json';
import es from '~/messages/es.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messageLeaves(value: unknown, prefix = ''): Array<[string, string]> {
  if (!isRecord(value)) throw new Error(`Invalid message object at ${prefix}`);
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') return [[path, child]];
    if (isRecord(child)) return messageLeaves(child, path);
    throw new Error(`Invalid message value at ${path}`);
  });
}

describe('message catalogs', () => {
  it('keeps Spanish keys in parity with English', () => {
    expect(messageLeaves(es).map(([key]) => key)).toEqual(
      messageLeaves(en).map(([key]) => key),
    );
  });

  it.each([
    ['en', en],
    ['es', es],
  ])('contains no blank %s messages', (_locale, messages) => {
    expect(
      messageLeaves(messages).every(([, text]) => text.trim().length > 0),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm --filter networkcanvas.com test -- lib/__tests__/messages.test.ts app/__tests__/localeRouting.test.ts
```

Expected: FAIL because the locale modules and message catalogs do not exist.

- [ ] **Step 3: Add dependencies and the locale modules**

Add `next-intl: ^4.13.0` to website dependencies and run
`pnpm install --lockfile-only`. Implement:

```ts
// lib/i18n/locales.ts
export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];

export function getStaticLocaleParams(): Array<{ locale: Locale }> {
  return locales.map((locale) => ({ locale }));
}
```

```ts
// lib/i18n/routing.ts
import { defineRouting } from 'next-intl/routing';
import { locales } from './locales';

export const routing = defineRouting({
  locales,
  defaultLocale: 'en',
  localePrefix: 'always',
});
```

```ts
// lib/i18n/navigation.ts
import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

export const { Link, usePathname, useRouter } = createNavigation(routing);
```

```ts
// lib/i18n/request.ts
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  if (!hasLocale(routing.locales, requested)) notFound();
  return {
    locale: requested,
    timeZone: 'UTC',
    messages: (await import(`../../messages/${requested}.json`)).default,
  };
});
```

Wrap the existing Next config with
`createNextIntl('./lib/i18n/request.ts')` while retaining static export,
unoptimized images, strict mode, and the pinned Turbopack root.

- [ ] **Step 4: Add the initial typed catalogs and type augmentation**

Create both catalogs with identical namespaces and localized values:

```json
{
  "Metadata": {
    "siteTitle": "Network Canvas",
    "siteDescription": "Network Canvas provides free and open-source software for surveying networks, designed around the needs of both researchers and their participants.",
    "downloadTitle": "Download",
    "downloadDescription": "Download links for the current Network Canvas software."
  },
  "LanguageSelector": {
    "label": "Language",
    "english": "English",
    "spanish": "Español"
  }
}
```

Spanish uses `Idioma`, `Inglés`, `Español`, `Descargar`, and a faithful Spanish
translation of both descriptions. Augment `next-intl` in `types.d.ts`:

```ts
import type { Locale } from '~/lib/i18n/locales';
import type messages from '~/messages/en.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
```

Keep the existing font module declarations.

- [ ] **Step 5: Move pages under the locale segment**

Change the top-level layout to a typed pass-through. Change root `page.tsx` to:

```tsx
import { permanentRedirect } from 'next/navigation';

export default function RootPage() {
  permanentRedirect('/en');
}
```

In `[locale]/layout.tsx`, validate with `hasLocale`, call
`setRequestLocale(locale)`, retrieve the matching catalog with
`getMessages({locale})`, render
`<html lang={locale}>`, and wrap children in `NextIntlClientProvider`. Export
`generateStaticParams = getStaticLocaleParams`. Generate localized site
metadata with `getTranslations({locale, namespace: 'Metadata'})`, including
canonical `https://networkcanvas.com/${locale}` and language alternates for
`en` and `es`.

Move the current home component body unchanged to `[locale]/page.tsx`, await
`params`, call `setRequestLocale(locale)`, and retain every current section. Move
the current download page unchanged to `[locale]/download/page.tsx`; Task 6
localizes it.

- [ ] **Step 6: Run tests, typecheck, lint, and format**

Run:

```bash
pnpm --filter networkcanvas.com test -- lib/__tests__/messages.test.ts app/__tests__/localeRouting.test.ts
pnpm --filter networkcanvas.com typecheck
pnpm exec oxlint --fix apps/networkcanvas.com
pnpm exec oxfmt apps/networkcanvas.com
```

Expected: focused tests PASS, typecheck PASS, lint PASS, formatter PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add apps/networkcanvas.com pnpm-lock.yaml
git commit -m "feat(website): add static locale routing"
```

---

### Task 2: Build and Validate the CSV Content Loader

**Files:**

- Create: `apps/networkcanvas.com/content/latest-news.csv`
- Create: `apps/networkcanvas.com/content/publications.csv`
- Create: `apps/networkcanvas.com/content/grants.csv`
- Create: `apps/networkcanvas.com/content/core-team.csv`
- Create: `apps/networkcanvas.com/lib/siteContent.ts`
- Create: `apps/networkcanvas.com/lib/__tests__/siteContent.test.ts`
- Modify: `apps/networkcanvas.com/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: `NewsItem`, `Publication`, `Grant`, `TeamMember`, and `SiteContent`.
- Produces:
  `loadSiteContent(locale: Locale, contentDirectory?: string): Promise<SiteContent>`.
- `SiteContent.publications` contains no more than the first four source rows.
- All arrays retain source row order and every record contains its stable `id`.

- [ ] **Step 1: Write filesystem-backed failing loader tests**

Use `mkdtemp`, `writeFile`, and `rm` from `node:fs/promises` plus `tmpdir()` to
create all four CSVs for each test. Cover:

```ts
it('selects Spanish fields and preserves CSV row order', async () => {
  const content = await loadSiteContent('es', directory);
  expect(content.newsItems.map(({ id, title }) => ({ id, title }))).toEqual([
    { id: 'second', title: 'Segunda noticia' },
    { id: 'first', title: 'Primera noticia' },
  ]);
});

it('limits publications to the first four rows', async () => {
  const content = await loadSiteContent('en', directory);
  expect(content.publications.map(({ id }) => id)).toEqual([
    'p1',
    'p2',
    'p3',
    'p4',
  ]);
});

it('parses quoted commas and embedded newlines', async () => {
  const content = await loadSiteContent('en', directory);
  expect(content.grants[0]?.description).toBe('Line one, with comma\nLine two');
});

it.each([
  ['duplicate id', 'latest-news.csv', 'row 3', 'id'],
  ['blank translation', 'grants.csv', 'row 2', 'description_es'],
  ['invalid URL', 'publications.csv', 'row 2', 'href'],
  ['invalid image', 'core-team.csv', 'row 2', 'photo'],
])('reports %s with file, row, and field', async (_case, file, row, field) => {
  await expect(loadSiteContent('es', directory)).rejects.toThrow(
    `${file}: ${row}: ${field}`,
  );
});
```

Also test a missing file and a header-only file; both reject with the filename
and `dataset must contain at least one row`.

- [ ] **Step 2: Run loader tests and verify RED**

Run:

```bash
pnpm --filter networkcanvas.com test -- lib/__tests__/siteContent.test.ts
```

Expected: FAIL because `loadSiteContent` does not exist.

- [ ] **Step 3: Add the CSV dependency and production types**

Add `csvtojson: catalog:` to website dependencies and update the lockfile.
Create these exported serializable types:

```ts
export type NewsItem = { id: string; title: string; href: string };
export type Publication = {
  id: string;
  title: string;
  source: string;
  authors: string;
  href: string;
};
export type Grant = {
  id: string;
  title: string;
  pis: string;
  description: string;
  logo: string;
  logoAlt: string;
  href: string;
};
export type TeamMember = {
  id: string;
  name: string;
  institution: string;
  photo: string;
};
export type SiteContent = {
  newsItems: NewsItem[];
  publications: Publication[];
  grants: Grant[];
  coreTeam: TeamMember[];
};
```

- [ ] **Step 4: Implement row-aware validation and localization**

In `siteContent.ts`, define strict Zod schemas with the exact columns from the
design. Parse `csvtojson().fromString(source)` into `unknown`, then validate it
as `z.array(z.record(z.string(), z.string()))` before row validation. Validate:

```ts
const id = z.string().trim().min(1);
const requiredText = z.string().trim().min(1);
const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), 'must use HTTPS');
const publicImage = z
  .string()
  .regex(/^\/images\/.+/, 'must start with /images/');
```

Validate each data row independently so Zod issues can be reformatted as
`<filename>: row <CSV data row + 1>: <field>: <message>`. After row validation,
scan IDs with a `Set`; report a duplicate against the later row. Reject an empty
array before localization.

Implement `loadSiteContent` with a default directory of
`join(process.cwd(), 'content')`, load all four files with `Promise.all`, map the
selected locale without assertions, and `slice(0, 4)` only for publications.

- [ ] **Step 5: Migrate current content into the four CSVs**

Use the exact approved headers:

```csv
id,title_en,title_es,href
id,title_en,title_es,source_en,source_es,authors,href
id,title_en,title_es,pis_en,pis_es,description_en,description_es,logo,logo_alt_en,logo_alt_es,href
id,name,institution_en,institution_es,photo
```

Migrate every current record from `newsItems`, `publications`, `grants`, and
`coreTeam` without reordering. Use lowercase kebab-case stable IDs. Preserve
official publication titles and author strings when no official Spanish title
exists; translate publication sources, news titles, grant prose, PI labels,
logo alternative text, and institution names into neutral Spanish. Quote cells
containing commas, quotes, or line breaks according to RFC 4180.

- [ ] **Step 6: Verify GREEN and quality checks**

Run:

```bash
pnpm --filter networkcanvas.com test -- lib/__tests__/siteContent.test.ts
pnpm --filter networkcanvas.com typecheck
pnpm exec oxlint --fix apps/networkcanvas.com/lib/siteContent.ts apps/networkcanvas.com/lib/__tests__/siteContent.test.ts
pnpm exec oxfmt apps/networkcanvas.com/lib/siteContent.ts apps/networkcanvas.com/lib/__tests__/siteContent.test.ts apps/networkcanvas.com/content
```

Expected: loader tests PASS, typecheck PASS, lint PASS, formatter PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add apps/networkcanvas.com/content apps/networkcanvas.com/lib/siteContent.ts apps/networkcanvas.com/lib/__tests__/siteContent.test.ts apps/networkcanvas.com/package.json pnpm-lock.yaml
git commit -m "feat(website): load localized CSV content"
```

---

### Task 3: Supply CSV Records to the Existing Sections

**Files:**

- Modify: `apps/networkcanvas.com/app/[locale]/page.tsx`
- Modify: `apps/networkcanvas.com/components/sections/HeroIntro.tsx`
- Modify: `apps/networkcanvas.com/components/sections/Hero.tsx`
- Modify: `apps/networkcanvas.com/components/sections/NewsTicker.tsx`
- Modify: `apps/networkcanvas.com/components/sections/Publications.tsx`
- Modify: `apps/networkcanvas.com/components/sections/Grants.tsx`
- Modify: `apps/networkcanvas.com/components/sections/CoreTeam.tsx`
- Modify: corresponding tests in `components/sections/__tests__`
- Modify: `apps/networkcanvas.com/lib/content.ts`

**Interfaces:**

- `HeroIntro({newsItems}: {newsItems: readonly NewsItem[]})`.
- `Hero` adds the same required prop and forwards it to `NewsTicker`.
- `NewsTicker({newsItems}: {newsItems: readonly NewsItem[]})`.
- `Publications({publications}: {publications: readonly Publication[]})`.
- `Grants({grants}: {grants: readonly Grant[]})`.
- `CoreTeam({members}: {members: readonly TeamMember[]})`.

- [ ] **Step 1: Change tests first to require explicit records**

Define local fixture arrays in each test and render the new prop APIs. Add
assertions that a fixture-only English title/name appears and a former hardcoded
record does not. Update NewsTicker's layout test to pass at least one record.
Update Grants tests to pass two grants and preserve the existing shadow viewport
assertions.

- [ ] **Step 2: Run section tests and verify RED**

Run:

```bash
pnpm --filter networkcanvas.com test -- components/sections/__tests__/NewsTicker.test.tsx components/sections/__tests__/Grants.test.tsx components/sections/__tests__/Hero.test.tsx components/sections/__tests__/HeroIntro.test.tsx
```

Expected: FAIL because the components do not accept the required props and still
read `lib/content.ts`.

- [ ] **Step 3: Implement prop-driven sections without visual changes**

Import types from `~/lib/siteContent` with `import type`. Use stable IDs for
React keys. For Grants, safely guard an empty prop even though the build loader
rejects it:

```tsx
const activeIndex = ((index % grants.length) + grants.length) % grants.length;
const active = grants[activeIndex];
if (!active) return null;
```

Do not change classes, transitions, markup hierarchy, controls, or displayed
counts. Thread `newsItems` through HeroIntro and Hero. In the localized home
page:

```tsx
const content = await loadSiteContent(locale);

<HeroIntro newsItems={content.newsItems} />
<Grants grants={content.grants} />
<Publications publications={content.publications} />
<CoreTeam members={content.coreTeam} />
```

Remove only the four migrated arrays and their now-unused types from
`lib/content.ts`.

- [ ] **Step 4: Verify GREEN and quality checks**

Run the focused tests from Step 2, then:

```bash
pnpm --filter networkcanvas.com test
pnpm --filter networkcanvas.com typecheck
pnpm exec oxlint --fix apps/networkcanvas.com/app apps/networkcanvas.com/components apps/networkcanvas.com/lib
pnpm exec oxfmt apps/networkcanvas.com/app apps/networkcanvas.com/components apps/networkcanvas.com/lib
```

Expected: all website tests PASS, typecheck PASS, lint PASS, formatter PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/networkcanvas.com/app apps/networkcanvas.com/components/sections apps/networkcanvas.com/lib/content.ts
git commit -m "refactor(website): render sections from CSV content"
```

---

### Task 4: Internationalise the Home Page Completely

**Files:**

- Modify: `apps/networkcanvas.com/messages/en.json`
- Modify: `apps/networkcanvas.com/messages/es.json`
- Create: `apps/networkcanvas.com/test/renderWithIntl.tsx`
- Modify: all home section components listed in File Structure
- Modify: `apps/networkcanvas.com/components/ui/DeviceMockup.tsx`
- Modify: `apps/networkcanvas.com/components/ui/__tests__/DeviceMockup.test.tsx`
- Modify: `apps/networkcanvas.com/lib/content.ts`
- Modify: all affected home section tests

**Interfaces:**

- `renderWithIntl(ui, locale?: Locale)` renders with the real catalog and
  `NextIntlClientProvider`.
- Message namespaces are exactly: `Metadata`, `LanguageSelector`, `Navigation`,
  `Hero`, `News`, `Tools`, `Video`, `Principles`, `Grants`, `Publications`,
  `Team`, `Contractors`, `Institutions`, `WhatNext`, `MailingList`, `Footer`, and
  `Download`.
- `lib/content.ts` retains IDs, product/proper names, links, colors, images, and
  variants; descriptions, labels, notes, periods, and body copy move to messages.

- [ ] **Step 1: Add the real intl test renderer and failing Spanish tests**

Implement the test helper API only in the test first:

```tsx
export function renderWithIntl(ui: ReactElement, locale: Locale = 'en') {
  const messages = locale === 'en' ? en : es;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
}
```

Update tests to use this helper. Add Spanish assertions for representative
server/client and rich-text copy:

```ts
expect(
  screen.getByRole('heading', {
    name: 'Simplificando la recopilación de datos de redes complejas.',
  }),
).toBeInTheDocument();
expect(screen.getByText('Últimas noticias:')).toBeInTheDocument();
expect(
  screen.getByRole('heading', { name: 'Principios de diseño' }),
).toBeInTheDocument();
expect(
  screen.getByRole('heading', { name: 'Equipo principal' }),
).toBeInTheDocument();
expect(
  screen.getByRole('button', { name: 'Unirse a la lista' }),
).toBeInTheDocument();
expect(
  screen.getByAltText(
    'Editor de protocolos de Architect que muestra el diseño de una entrevista',
  ),
).toBeInTheDocument();
```

- [ ] **Step 2: Run affected tests and verify RED**

Run:

```bash
pnpm --filter networkcanvas.com test -- components/sections
```

Expected: FAIL because components still contain English literals and no
complete catalogs exist.

- [ ] **Step 3: Complete both catalogs with key parity**

Use the exact namespace responsibilities below:

| Namespace      | Required nested keys                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Hero`         | `headline`, `description` rich text, `download`, `keepScrolling`                                                                 |
| `News`         | `label`, `fullStory`                                                                                                             |
| `Tools`        | `heading`, `introduction`, and `architect/interviewer/fresco.{description,action,screenshotAlt}`                                 |
| `Video`        | `heading`, `description` rich text, `channel`, `title`, `watchLabel`                                                             |
| `Principles`   | `heading`, `introduction`, and five IDs each with `title`, `paragraph1`, `paragraph2`                                            |
| `Grants`       | `heading`, `introduction`, `previous`, `next`, `show` with `{number}`                                                            |
| `Publications` | `heading`, `introduction` rich text, `submission` rich text, `article`, `thread`                                                 |
| `Team`         | `heading`, `introduction`                                                                                                        |
| `Contractors`  | section copy, previous heading, eight contractor notes, advisors heading, interns heading/introduction, two intern periods/notes |
| `Institutions` | `heading`, two rich paragraphs, `prior`, `ongoing`                                                                               |
| `WhatNext`     | `heading`, four card IDs each with `title`, `body`, and action where present                                                     |
| `MailingList`  | `placeholder`, `emailLabel`, `submit`, `success`                                                                                 |

Copy English values verbatim from the components and the corresponding rendered
fields in `lib/content.ts`. Provide complete neutral Spanish translations. Keep
official names and software product names unchanged. Preserve placeholders
`{number}` and rich tags such as `<strong>`, `<article>`, `<thread>`, `<prior>`,
and `<ongoing>` identically in both catalogs. Run `messages.test.ts` after every
catalog edit so no nested key or placeholder can diverge.

- [ ] **Step 4: Replace home literals with typed translations**

Use `useTranslations('<Namespace>')` in synchronous components and client
components. Use `t.rich` for complete sentences containing inline elements:

```tsx
{
  t.rich('description', {
    strong: (chunks) => <strong className="text-cyber-grape">{chunks}</strong>,
  });
}
```

For arrays in `lib/content.ts`, replace rendered text with stable IDs. Examples:

```ts
export const tools = [
  {
    id: 'architect',
    name: 'Architect',
    href: externalLinks.architectApp,
    color: 'sea-green',
    variant: 'architect',
  },
  {
    id: 'interviewer',
    name: 'Interviewer',
    href: externalLinks.interviewerApp,
    color: 'neon-coral',
    variant: 'interviewer',
  },
  {
    id: 'fresco',
    name: 'Fresco',
    href: externalLinks.frescoApp,
    color: 'slate-blue',
    variant: 'fresco',
  },
] as const;
```

Use the ID union to build typed message keys. Move `WhatNext` card React nodes
inside the component so translated hooks are legal; retain the same card order,
icons, tones, URLs, and markup. Translate every aria-label, including grant
controls, video labels, and the descriptive Architect, Interviewer, and Fresco
screenshot alternatives. Do not translate people or product names.

- [ ] **Step 5: Verify all localized section tests and message parity**

Run:

```bash
pnpm --filter networkcanvas.com test -- lib/__tests__/messages.test.ts components/sections
pnpm --filter networkcanvas.com typecheck
pnpm exec oxlint --fix apps/networkcanvas.com/components/sections apps/networkcanvas.com/components/ui/DeviceMockup.tsx apps/networkcanvas.com/lib/content.ts apps/networkcanvas.com/test
pnpm exec oxfmt apps/networkcanvas.com/components/sections apps/networkcanvas.com/components/ui/DeviceMockup.tsx apps/networkcanvas.com/lib/content.ts apps/networkcanvas.com/test apps/networkcanvas.com/messages
```

Expected: all focused tests PASS, catalogs have identical non-empty keys,
typecheck PASS, lint PASS, formatter PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add apps/networkcanvas.com/components/sections apps/networkcanvas.com/components/ui/DeviceMockup.tsx apps/networkcanvas.com/components/ui/__tests__/DeviceMockup.test.tsx apps/networkcanvas.com/lib/content.ts apps/networkcanvas.com/messages apps/networkcanvas.com/test apps/networkcanvas.com/lib/__tests__/messages.test.ts
git commit -m "feat(website): translate home page content"
```

---

### Task 5: Add Locale-Aware Navigation and Language Selection

**Files:**

- Create: `apps/networkcanvas.com/components/layout/LanguageSelector.tsx`
- Create: `apps/networkcanvas.com/components/layout/__tests__/LanguageSelector.test.tsx`
- Modify: `apps/networkcanvas.com/components/layout/Header.tsx`
- Modify: `apps/networkcanvas.com/components/layout/ProjectsMenu.tsx`
- Modify: `apps/networkcanvas.com/components/layout/Footer.tsx`
- Modify: `apps/networkcanvas.com/components/layout/__tests__/Header.test.tsx`
- Modify: `apps/networkcanvas.com/components/ui/ButtonLink.tsx`
- Modify: `apps/networkcanvas.com/components/ui/PillLink.tsx`
- Modify: `apps/networkcanvas.com/messages/en.json`
- Modify: `apps/networkcanvas.com/messages/es.json`
- Modify: `apps/networkcanvas.com/lib/content.ts`

**Interfaces:**

- `LanguageSelector({onNavigate?}: {onNavigate?: () => void})`.
- Selecting a locale navigates to the equivalent pathname and writes Netlify's
  `nf_lang` cookie for one year.
- Internal ButtonLink/PillLink links use `~/lib/i18n/navigation`; external links
  remain normal anchors.

- [ ] **Step 1: Write failing selector and localized header tests**

Mock `usePathname` to `/download` and `useRouter().replace`. Render in Spanish,
click English, and assert:

```ts
expect(router.replace).toHaveBeenCalledWith('/download', { locale: 'en' });
expect(document.cookie).toContain('nf_lang=en');
expect(onNavigate).toHaveBeenCalledOnce();
```

Also assert the active locale has `aria-current="true"`, both controls are
keyboard-focusable links or buttons, and the group name is localized. Update
Header tests to expect `Comunidad`, `Documentación`, `Proyectos`, `Descargar`,
and the Spanish menu toggle label.

- [ ] **Step 2: Run layout tests and verify RED**

Run:

```bash
pnpm --filter networkcanvas.com test -- components/layout
```

Expected: FAIL because LanguageSelector and localized navigation do not exist.

- [ ] **Step 3: Implement the selector**

Use `useLocale`, `useTranslations('LanguageSelector')`, `usePathname`, and
`useRouter`. Render a compact labelled group with English and Spanish buttons.
On activation:

```ts
document.cookie = `nf_lang=${targetLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
router.replace(pathname, { locale: targetLocale });
onNavigate?.();
```

Use `aria-current={locale === targetLocale ? 'true' : undefined}` and the
existing `focusable` utility. Do not use a select that hides both language names.

- [ ] **Step 4: Localize and preserve navigation**

Add `Navigation` keys for `home`, `community`, `documentation`, `projects`,
`download`, `toggleMenu`, `openMenu`, `closeMenu`, and each project description
and action. Add `Footer` keys for `terms`, `privacy`, `copyright`, and social
labels. English values match the current UI; Spanish uses `Inicio`, `Comunidad`,
`Documentación`, `Proyectos`, `Descargar`, `Términos de uso`, and `Política de
privacidad` with complete translated descriptions and menu labels.

Change config arrays to carry IDs and shared hrefs. Use the locale-aware Link for
home and download, ordinary anchors for external destinations, and translated
labels for keys and display. Add LanguageSelector to desktop nav, mobile nav
with `onNavigate={() => setOpen(false)}`, and footer. Replace the current single
toggle label with locale-specific open/close labels based on state.

Update ButtonLink and PillLink to import the locale-aware `Link` from the source
module, not through a new barrel.

- [ ] **Step 5: Verify GREEN and quality checks**

Run:

```bash
pnpm --filter networkcanvas.com test -- components/layout components/sections/__tests__/Hero.test.tsx
pnpm --filter networkcanvas.com typecheck
pnpm exec oxlint --fix apps/networkcanvas.com/components/layout apps/networkcanvas.com/components/ui apps/networkcanvas.com/lib/content.ts
pnpm exec oxfmt apps/networkcanvas.com/components/layout apps/networkcanvas.com/components/ui apps/networkcanvas.com/lib/content.ts apps/networkcanvas.com/messages
```

Expected: layout tests PASS, hero internal download link retains locale behavior,
typecheck PASS, lint PASS, formatter PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add apps/networkcanvas.com/components/layout apps/networkcanvas.com/components/ui/ButtonLink.tsx apps/networkcanvas.com/components/ui/PillLink.tsx apps/networkcanvas.com/lib/content.ts apps/networkcanvas.com/messages
git commit -m "feat(website): add locale-aware navigation"
```

---

### Task 6: Internationalise the Download Page and Page Metadata

**Files:**

- Modify: `apps/networkcanvas.com/app/[locale]/download/page.tsx`
- Create: `apps/networkcanvas.com/app/[locale]/download/__tests__/page.test.tsx`
- Modify: `apps/networkcanvas.com/app/[locale]/layout.tsx`
- Modify: `apps/networkcanvas.com/messages/en.json`
- Modify: `apps/networkcanvas.com/messages/es.json`

**Interfaces:**

- `generateMetadata({params})` emits localized download title, description,
  canonical URL, and `en`/`es` alternates.
- Download binary URLs, icons, platform names, product names, pills, and card
  order remain unchanged.

- [ ] **Step 1: Write failing Spanish download tests**

Render the page with a Spanish provider and assert:

```ts
expect(
  screen.getByRole('heading', { name: 'Descargar Network Canvas' }),
).toBeInTheDocument();
expect(
  screen.getByText(
    'A continuación encontrará enlaces para descargar nuestro software actual.',
  ),
).toBeInTheDocument();
expect(
  screen.getByRole('heading', { name: 'Más información' }),
).toBeInTheDocument();
expect(
  screen.getByRole('button', { name: 'Requisitos del sistema' }),
).toBeInTheDocument();
expect(
  screen.getByRole('link', { name: 'Obtener en Google Play' }),
).toHaveAttribute('href', expect.stringContaining('play.google.com'));
```

Call `generateMetadata` for `es` and assert canonical
`https://networkcanvas.com/es/download`, Spanish title/description, and both
language alternates.

- [ ] **Step 2: Run the page test and verify RED**

Run:

```bash
pnpm --filter networkcanvas.com test -- app/'[locale]'/download/__tests__/page.test.tsx
```

Expected: FAIL because the page and metadata still contain English literals.

- [ ] **Step 3: Complete the Download namespace**

Add keys for metadata, page heading/introduction, Interviewer and Architect
descriptions, Google Play label, Server heading and both paragraphs, More
Information heading, System Requirements heading/body/link, Apple App Store
heading/body/link, and platform labels. English values are copied verbatim from
the current page. Spanish uses the exact tested headings above and complete
neutral translations; software/platform names and URLs remain unchanged.

- [ ] **Step 4: Replace literals and generate localized metadata**

Await and validate `params.locale`, call `setRequestLocale`, and use
`getTranslations({locale, namespace: 'Download'})`. Use `t.rich` for both
documentation paragraphs so link placement can vary. Keep the Accordion,
download data, classes, card order, and external link behavior unchanged.

Generate:

```ts
alternates: {
  canonical: `https://networkcanvas.com/${locale}/download`,
  languages: {
    en: 'https://networkcanvas.com/en/download',
    es: 'https://networkcanvas.com/es/download',
  },
}
```

- [ ] **Step 5: Verify GREEN and quality checks**

Run the focused test, message parity test, complete website suite, typecheck,
oxlint `--fix`, and oxfmt.

Expected: all PASS with no warnings or missing-message errors.

- [ ] **Step 6: Commit Task 6**

```bash
git add apps/networkcanvas.com/app/'[locale]'/download apps/networkcanvas.com/app/'[locale]'/layout.tsx apps/networkcanvas.com/messages
git commit -m "feat(website): translate download page"
```

---

### Task 7: Add CDN Redirects, Cache Inputs, and Static Export Verification

**Files:**

- Create: `apps/networkcanvas.com/netlify.toml`
- Create: `apps/networkcanvas.com/lib/__tests__/redirectConfig.test.ts`
- Modify: `turbo.json`
- Modify: any tests that reveal final integration gaps

**Interfaces:**

- Spanish browser language at `/` receives `302 /es`.
- Every other root request receives `302 /en`.
- `content/**`, `messages/**`, and `netlify.toml` invalidate website build and
  typecheck cache entries.

- [ ] **Step 1: Write a failing ordered redirect-config test**

Read `netlify.toml` as text and assert the Spanish rule appears before the
fallback, both use status 302 and force, only the Spanish rule has a Language
condition, and destinations are `/es` then `/en`. Also read `turbo.json` and
assert both website input arrays include `content/**` and `messages/**`, while
the build inputs also include `netlify.toml`.

- [ ] **Step 2: Run the config test and verify RED**

Run:

```bash
pnpm --filter networkcanvas.com test -- lib/__tests__/redirectConfig.test.ts
```

Expected: FAIL because the redirect file and cache inputs do not exist.

- [ ] **Step 3: Add exact Netlify redirect rules**

Create:

```toml
[[redirects]]
from = "/"
to = "/es"
status = 302
force = true
conditions = {Language = ["es"]}

[[redirects]]
from = "/"
to = "/en"
status = 302
force = true
```

Keep the conditional rule first. The fallback root page remains `/en` for local
development; Netlify's forced rules override generated `out/index.html`.

- [ ] **Step 4: Add Turbo inputs**

Add `content/**`, `messages/**`, and `netlify.toml` to
`networkcanvas.com#build.inputs`. Add `content/**` and `messages/**` to
`networkcanvas.com#typecheck.inputs`.

- [ ] **Step 5: Run final automated verification**

Run in this order:

```bash
pnpm --filter networkcanvas.com test
pnpm --filter networkcanvas.com typecheck
pnpm exec oxlint --fix apps/networkcanvas.com turbo.json
pnpm exec oxfmt apps/networkcanvas.com turbo.json
pnpm knip
pnpm --filter networkcanvas.com build
git diff --check
```

Inspect export routes and HTML:

```bash
find apps/networkcanvas.com/out -maxdepth 3 -type f -name '*.html' | sort
rg -n '<html lang="(en|es)"' apps/networkcanvas.com/out/en.html apps/networkcanvas.com/out/es.html apps/networkcanvas.com/out/en/download.html apps/networkcanvas.com/out/es/download.html
```

Expected: all tests/typecheck/lint/format/knip/build checks PASS; output contains
English and Spanish home/download HTML with matching `lang` attributes.

- [ ] **Step 6: Perform browser verification without redesigning**

Keep the existing dev server open. Verify `/en`, `/es`, `/en/download`, and
`/es/download` at desktop and mobile widths. Confirm:

- every visible string and interactive accessible name uses the active locale;
- Latest News, Publications, Grants, and Core Team match CSV order;
- locale switching preserves home versus download;
- the selector appears in desktop header, mobile menu, and footer;
- keyboard focus is visible and the mobile menu closes after switching;
- the current layout, entrance animation, carousel, video, and reduced-motion
  behavior remain unchanged; and
- there are no console errors or hydration warnings.

- [ ] **Step 7: Commit Task 7**

```bash
git add apps/networkcanvas.com/netlify.toml apps/networkcanvas.com/lib/__tests__/redirectConfig.test.ts turbo.json apps/networkcanvas.com
git commit -m "feat(website): add static language redirects"
```

---

## Final Review and Delivery

- [ ] Generate a review package from the implementation base to HEAD and
      dispatch a whole-branch reviewer using the approved design and this plan.
- [ ] Resolve every Critical or Important finding with covering tests and repeat
      review.
- [ ] Re-run the full Task 7 verification commands after review fixes.
- [ ] Decide changeset status with the `creating-a-changeset` skill; record that
      this private website app does not need one unless a library package changed.
- [ ] Push the existing feature branch and update the existing pull request.
- [ ] Leave the local development server running and provide the `/en` and `/es`
      review URLs.
