import { useTable } from '@tanstack/react-table';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { DataTableColumnHeader } from '../ColumnHeader';
import { dataTableFeatures, type DataTableFeatures } from '../features';
import { type FilterConfig } from '../filters/types';

type Row = { value: number; name: string };

const rows: Row[] = [
  { value: 1, name: 'Ada' },
  { value: 5, name: 'Grace' },
];

const configs: FilterConfig[] = [
  { type: 'text' },
  { type: 'range', min: 0, max: 10 },
  { type: 'date' },
  { type: 'boolean', trueLabel: 'Yes', falseLabel: 'No' },
  { type: 'faceted', options: [{ value: 'Ada', label: 'Ada' }] },
  {
    type: 'operator',
    operators: ['eq', 'gt'],
    entitySelector: {
      label: 'Type',
      getOptions: () => [{ value: 'person', label: 'Person' }],
    },
  },
];

function Header({ config }: { config: FilterConfig }) {
  const table = useTable<DataTableFeatures, Row>({
    features: dataTableFeatures,
    data: rows,
    columns: [
      {
        accessorKey: 'value',
        header: 'Score',
        meta: { filterType: config.type, filterConfig: config },
      },
    ],
  });
  const column = table.getColumn('value')!;
  return <DataTableColumnHeader column={column} table={table} title="Score" />;
}

afterEach(cleanup);

// A column filter's controls are named by the column's title, so a screen
// reader user knows what each one filters.
describe('column filter names', () => {
  it.each(configs.map((config) => [config.type, config] as const))(
    'names every control in the %s filter',
    async (_type, config) => {
      render(<Header config={config} />);
      await userEvent.click(screen.getByRole('button', { name: /Score/ }));
      await userEvent.click(
        await screen.findByRole('menuitem', { name: 'Filter' }),
      );
      const panel = await screen.findByRole('dialog', { name: 'Filter' });
      const inPanel = within(panel);

      for (const role of [
        'textbox',
        'spinbutton',
        'slider',
        'combobox',
        'button',
        'checkbox',
        'group',
      ]) {
        expect(inPanel.queryAllByRole(role, { name: /^$/ })).toEqual([]);
      }
      // Base UI's form inputs are hidden from screen readers.
      for (const input of panel.querySelectorAll(
        'input:not([aria-hidden="true"])',
      )) {
        expect(input).not.toHaveAccessibleName('');
      }
    },
  );

  it('names a filter by its column title', async () => {
    render(<Header config={{ type: 'text' }} />);
    await userEvent.click(screen.getByRole('button', { name: /Score/ }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Filter' }),
    );
    const panel = await screen.findByRole('dialog', { name: 'Filter' });
    expect(within(panel).getByRole('textbox')).toHaveAccessibleName('Score');
  });

  it('names the parts of a condition', async () => {
    render(<Header config={configs.at(-1)!} />);
    await userEvent.click(screen.getByRole('button', { name: /Score/ }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Filter' }),
    );
    const panel = within(await screen.findByRole('dialog', { name: 'Filter' }));
    expect(panel.getByRole('group', { name: 'Score' })).toBeInTheDocument();
    expect(panel.getByRole('combobox', { name: 'Type' })).toBeInTheDocument();
    expect(
      panel.getByRole('combobox', { name: 'Comparison' }),
    ).toBeInTheDocument();
    expect(
      panel.getByRole('spinbutton', { name: 'Value' }),
    ).toBeInTheDocument();
  });
});
