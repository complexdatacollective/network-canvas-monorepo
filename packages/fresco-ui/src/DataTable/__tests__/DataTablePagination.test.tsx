import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';

import {
  ARABIC,
  arabicNumber as arabic,
  sourceTemplate,
} from '../../__tests__/catalogFixtures';
import { DataTablePagination } from '../DataTablePagination';

type Row = { name: string };

const PAGE_OF_ID = 'frescoUi.dataTablePagination.pageOf';

const CATALOG = { [PAGE_OF_ID]: sourceTemplate(PAGE_OF_ID) };

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
