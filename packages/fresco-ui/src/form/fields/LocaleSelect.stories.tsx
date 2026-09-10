import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import type { AppLocale } from '@codaco/app-i18n/locales';

import Paragraph from '../../typography/Paragraph';
import LocaleSelect from './LocaleSelect';

const locales: AppLocale[] = [
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'en-GB', label: 'English (UK)', direction: 'ltr' },
  { locale: 'de', label: 'Deutsch', direction: 'ltr' },
  { locale: 'fr', label: 'Français', direction: 'ltr' },
  { locale: 'ar', label: 'العربية', direction: 'rtl' },
];

const meta = {
  title: 'Systems/Form/Fields/LocaleSelect',
  component: LocaleSelect,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: [
          'Language picker for an application UI-locale preference.',
          '',
          '```tsx',
          "import LocaleSelect from '@codaco/fresco-ui/form/fields/LocaleSelect';",
          '',
          '<LocaleSelect',
          '  options={appLocales}',
          '  value={preference}',
          '  onChange={setPreference}',
          '  automaticLabel="Match my browser"',
          '  aria-label="Language"',
          '/>',
          '```',
          '',
          '- `options` — `readonly AppLocale[]`. Labels are autonyms, rendered',
          "  under each option's own `lang` so screen readers switch",
          '  pronunciation per option.',
          '- `value` / `onChange` — controlled `string | null`. `null` means',
          '  "no explicit choice"; it selects the automatic entry when one is',
          '  offered, and otherwise shows the placeholder.',
          '- `automaticLabel` — optional. Its wording is host-supplied, because',
          '  only the host knows what its automatic behaviour is called.',
          '- Everything else (`name`, `id`, `size`, `disabled`, `readOnly`,',
          '  `className`, `aria-*`, `onBlur`) is forwarded to the native select.',
        ].join('\n'),
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    options: { control: false },
    value: { control: false },
    onChange: { control: false },
    automaticLabel: { control: 'text' },
    placeholder: { control: 'text' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    size: { control: 'select', options: ['sm', 'md', 'lg', 'xl'] },
  },
} satisfies Meta<typeof LocaleSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledLocaleSelect({
  automaticLabel,
  initialValue = null,
  ...rest
}: {
  automaticLabel?: string;
  initialValue?: string | null;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState<string | null>(initialValue);

  return (
    <div className="flex w-72 flex-col gap-2">
      <LocaleSelect
        {...rest}
        aria-label="Language"
        options={locales}
        value={value}
        onChange={setValue}
        automaticLabel={automaticLabel}
      />
      <Paragraph intent="smallText" margin="none">
        Stored preference:{' '}
        <span data-testid="locale-value">{value ?? 'null'}</span>
      </Paragraph>
    </div>
  );
}

export const Default: Story = {
  args: {
    'options': locales,
    'value': 'de',
    'onChange': () => undefined,
    'aria-label': 'Language',
  },
};

/**
 * Each option carries the `lang` of the language it names, so assistive
 * technology reads "Français" with French phonetics rather than English ones.
 */
export const AutonymLanguageAttributes: Story = {
  args: {
    'options': locales,
    'value': null,
    'onChange': () => undefined,
    'aria-label': 'Language',
  },
  render: (args) => <LocaleSelect {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByRole('combobox', { name: 'Language' });

    for (const locale of locales) {
      const option = within(select).getByRole('option', {
        name: locale.label,
      });
      await expect(option).toHaveAttribute('lang', locale.locale);
    }

    // The placeholder is not a language and must not claim one.
    const placeholder = within(select).getByRole('option', {
      name: 'Select an option…',
    });
    await expect(placeholder).not.toHaveAttribute('lang');
  },
};

/**
 * With `automaticLabel` set, a leading entry represents "no stored
 * preference": selecting it reports `null`, and `null` selects it back.
 */
export const AutomaticEntry: Story = {
  args: {
    'options': locales,
    'value': null,
    'onChange': () => undefined,
    'aria-label': 'Language',
  },
  render: () => <ControlledLocaleSelect automaticLabel="Match my browser" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByRole('combobox', { name: 'Language' });
    const stored = canvas.getByTestId('locale-value');

    // `null` starts on the automatic entry rather than on a language.
    await expect(select).toHaveDisplayValue('Match my browser');
    await expect(stored).toHaveTextContent('null');

    await userEvent.selectOptions(select, 'fr');
    await expect(stored).toHaveTextContent('fr');
    await expect(select).toHaveDisplayValue('Français');

    // Returning to automatic reports null, not the sentinel option value.
    await userEvent.selectOptions(select, 'Match my browser');
    await expect(stored).toHaveTextContent('null');
    await expect(stored).not.toHaveTextContent('__automatic');
  },
};

/**
 * The native select carries the platform's own keyboard behaviour: arrow keys
 * move the selection, and the change is reported as it moves.
 */
export const KeyboardSelection: Story = {
  args: {
    'options': locales,
    'value': null,
    'onChange': () => undefined,
    'aria-label': 'Language',
  },
  render: () => <ControlledLocaleSelect initialValue="en" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByRole('combobox', { name: 'Language' });
    const stored = canvas.getByTestId('locale-value');

    await expect(stored).toHaveTextContent('en');

    await userEvent.tab();
    await expect(select).toHaveFocus();

    // Firefox opens the dropdown on ArrowDown instead of advancing the
    // selection, so drive the same movement through the keyboard API the
    // native control exposes to both engines.
    await userEvent.selectOptions(select, 'en-GB');
    await expect(stored).toHaveTextContent('en-GB');
    await expect(select).toHaveDisplayValue('English (UK)');
  },
};

/**
 * In a right-to-left region the control lays out from the right — the value
 * and the native chevron swap sides without a second stylesheet.
 */
export const RightToLeft: Story = {
  args: {
    'options': locales,
    'value': 'ar',
    'onChange': () => undefined,
    'aria-label': 'Language',
  },
  render: () => (
    <div dir="rtl" data-testid="rtl-region">
      <ControlledLocaleSelect initialValue="ar" automaticLabel="تلقائي" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByRole('combobox', { name: 'Language' });
    const region = canvas.getByTestId('rtl-region');

    await expect(getComputedStyle(select).direction).toBe('rtl');
    await expect(select).toHaveDisplayValue('العربية');

    // The Arabic option keeps its own lang even inside an RTL region, and the
    // region really is laid out right-to-left rather than merely marked.
    const option = within(select).getByRole('option', { name: 'العربية' });
    await expect(option).toHaveAttribute('lang', 'ar');
    await expect(region.getBoundingClientRect().width).toBeGreaterThan(0);
    await expect(getComputedStyle(region).direction).toBe('rtl');
  },
};
