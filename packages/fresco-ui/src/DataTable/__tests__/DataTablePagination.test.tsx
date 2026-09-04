import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AppLocale } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

import { DataTablePagination } from '../DataTablePagination';

type Row = { name: string };

const PAGE_OF_ID = 'frescoUi.dataTablePagination.pageOf';

const srcDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/**
 * The extracted source template for one id, which `catalogs.test.ts` keeps
 * equal to the descriptor in the component. Standing in for a translation of
 * it is what makes this a test of the descriptor: a translator copies the
 * arguments as the source declares them, so a bare `{page}` in the source is a
 * bare `{page}` in every catalog derived from it.
 */
function sourceTemplate(id: string): string {
  const extracted = JSON.parse(
    readFileSync(join(srcDir, 'locales', 'en.json'), 'utf8'),
  ) as Record<string, { defaultMessage: string }>;
  const template = extracted[id]?.defaultMessage;
  if (template === undefined) {
    throw new Error(`no extracted message for "${id}"`);
  }
  return template;
}

// A locale whose digits are not the ones the source is written in, so a number
// that reached the screen without going through the app's formatter is visible
// as such. Its registry is local to this test: the shipped ecosystem list is
// English-only, and what is under test is the component, not the set of
// languages the apps currently offer.
const ARABIC: AppLocale = {
  locale: 'ar-EG',
  label: 'العربية',
  direction: 'rtl',
};

// react-intl formats an untranslated `defaultMessage` in the DEFAULT locale —
// English text gets English digits, which is the coherent fallback — so only a
// translated message can show whether the arguments carry a type.
const CATALOG = { [PAGE_OF_ID]: sourceTemplate(PAGE_OF_ID) };

const arabic = (value: number) => new Intl.NumberFormat('ar-EG').format(value);

const Harness = () => {
  const table = useReactTable<Row>({
    data: [{ name: 'Ada' }],
    columns: [{ accessorKey: 'name', header: 'Name' }],
    manualPagination: true,
    pageCount: 4567,
    state: { pagination: { pageIndex: 122, pageSize: 25 } },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <AppI18nProvider
      locale="ar-EG"
      locales={[ARABIC]}
      messages={CATALOG}
      manageDocument={false}
    >
      <DataTablePagination table={table} />
    </AppI18nProvider>
  );
};

describe('the pagination bar under a locale with its own digits', () => {
  it('writes the page position in the locale of the sentence holding it', () => {
    // Fixture guard: the assertion below only discriminates while ar-EG and
    // the runtime default really do write these numbers differently.
    expect(arabic(4567)).not.toBe('4567');

    render(<Harness />);

    // The translated catalog can only ask for a locale-formatted number if
    // the source it was translated from declared one: a translator copies the
    // argument, so a bare `{page}` in the source becomes a bare `{page}` in
    // every catalog and the digits stay Western in all of them.
    expect(
      screen.getByText(`Page ${arabic(123)} of ${arabic(4567)}`),
    ).toBeInTheDocument();
  });

  it('writes the page sizes in the app locale', () => {
    // Fixture guard: `toLocaleString()` reads the runtime's locale, which is
    // what this test needs to be able to tell apart from the app's.
    expect((100).toLocaleString()).toBe('100');

    const { container } = render(<Harness />);

    const select = container.querySelector('select[name="pageSize"]');
    expect(select).not.toBeNull();
    const labels = Array.from(select!.querySelectorAll('option')).map(
      (option) => option.textContent ?? '',
    );

    // These stand on their own rather than inside a sentence, so they follow
    // the reader's locale outright.
    expect(labels).toContain(arabic(100));
    expect(labels.join(' ')).not.toMatch(/[0-9]/);
  });
});
