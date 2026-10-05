import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import type { Variable } from '@codaco/protocol-validation';
import { ArchitectI18nProvider } from '~/i18n/ArchitectI18nProvider';

import Variables from './Variables';

const NAME = 'consentPreference';
const STORED_VALUE = 'preferNotToSay';

const variables = {
  'consent-preference': {
    name: NAME,
    type: 'categorical',
    options: [
      { value: STORED_VALUE, label: 'Prefer not to say' },
      { value: 'yes', label: 'Yes' },
    ],
  } as unknown as Variable,
};

const meta = {
  title: 'Protocol Summary/Variables',
  component: Variables,
  parameters: { layout: 'padded', chromatic: { disableSnapshot: true } },
  decorators: [
    (Story) => (
      <ArchitectI18nProvider>
        <Story />
      </ArchitectI18nProvider>
    ),
  ],
  args: { variables },
} satisfies Meta<typeof Variables>;

export default meta;

type Story = StoryObj<typeof meta>;

const cellHolding = (element: HTMLElement) => {
  const cell = element.closest('td');
  if (!cell) throw new Error(`"${element.textContent}" is not in a cell.`);
  return cell;
};

export const StoredValuesPrintVerbatim: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [, optionsTable] = canvas.getAllByRole('table');
    if (!optionsTable) throw new Error('The attribute has no options table.');

    const nameCell = getComputedStyle(cellHolding(canvas.getByText(NAME)));
    await expect(nameCell.hyphens).toBe('auto');
    await expect(nameCell.overflowWrap).toBe('break-word');

    const valueCell = getComputedStyle(
      cellHolding(within(optionsTable).getByText(STORED_VALUE)),
    );
    await expect(valueCell.hyphens).toBe('manual');
    await expect(valueCell.overflowWrap).toBe('normal');
  },
};
