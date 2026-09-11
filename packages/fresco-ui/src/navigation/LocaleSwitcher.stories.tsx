import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import type { AppLocale } from '@codaco/app-i18n/locales';

import LocaleSwitcher from './LocaleSwitcher';
import type { LocaleSwitcherProps } from './LocaleSwitcher';

const fewLocales: AppLocale[] = [
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'en-GB', label: 'English (UK)', direction: 'ltr' },
  { locale: 'es', label: 'Español', direction: 'ltr' },
  { locale: 'en-XA', label: 'Þséûðö Éñglîsh (en-XA)', direction: 'ltr' },
];

const manyLocales: AppLocale[] = [
  ...fewLocales,
  { locale: 'de', label: 'Deutsch', direction: 'ltr' },
  { locale: 'fr', label: 'Français', direction: 'ltr' },
  { locale: 'ar', label: 'العربية', direction: 'rtl' },
  { locale: 'ja', label: '日本語', direction: 'ltr' },
];

const documentation = `
The application language switcher shared by Architect, Interviewer and Studio:
a pill naming the current language, opening a popover that lists every
interface language under its own \`lang\`. Hosts own persistence and the note
about what the choice applies to; the chrome copy is shared and translated
once.

\`\`\`tsx
import LocaleSwitcher from '@codaco/fresco-ui/navigation/LocaleSwitcher';

<LocaleSwitcher
  options={appLocales}
  value={preference}
  automaticLocale={resolveDeviceLocale(null)}
  onChange={setPreference}
  description="Interface only, on this device."
/>
\`\`\`

- **\`options\`** — \`readonly AppLocale[]\`. Autonyms render under each
  entry's own \`lang\`, with the tag as an uppercase code beside them.
- **\`value\`** / **\`onChange\`** — controlled \`string | null\`. \`null\` is
  the automatic entry, which follows the browser.
- **\`automaticLocale\`** — the tag automatic resolves to right now, named on
  the automatic entry ("Automatic (English)") and in the trigger ("Auto · EN").
- **\`description\`** — host-supplied footer note.
- **\`side\`** / **\`align\`** — where the popover opens; the Interviewer
  status bar uses \`side="top"\`.
- A search box appears once the list is longer than six entries.
- The trigger is an outline \`Button\` in \`color="dynamic"\`, so it takes the
  colour of the bar it sits on.
`;

const meta = {
  title: 'Navigation/LocaleSwitcher',
  component: LocaleSwitcher,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: documentation } },
  },
  argTypes: {
    options: { control: false },
    value: { control: false },
    onChange: { control: false },
    description: { control: 'text' },
    side: { control: 'radio', options: ['top', 'bottom'] },
    align: { control: 'radio', options: ['start', 'center', 'end'] },
  },
  args: {
    options: fewLocales,
    value: null,
    automaticLocale: 'en',
    onChange: () => undefined,
    description:
      'Interface only, on this device. Protocol content and collected data are unaffected.',
  },
  render: (args) => <ControlledSwitcher {...args} />,
} satisfies Meta<typeof LocaleSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledSwitcher({
  value: initialValue,
  onChange,
  ...rest
}: LocaleSwitcherProps) {
  const [value, setValue] = useState<string | null>(initialValue);
  return (
    <LocaleSwitcher
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const openSwitcher = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const trigger = canvas.getByRole('combobox', {
    name: /^Interface language:/,
  });
  await userEvent.click(trigger);
  const popup = await screen.findByRole('dialog', {
    name: 'Interface language',
  });
  return { canvas, trigger, popup };
};

export const Default: Story = {};

/**
 * Past the threshold the popover gains a search box that filters by autonym
 * and code.
 */
export const WithSearch: Story = {
  args: { options: manyLocales },
  play: async ({ canvasElement }) => {
    const { popup } = await openSwitcher(canvasElement);
    const search = within(popup).getByRole('combobox', { name: 'Search' });
    await expect(search).toHaveFocus();
    await expect(within(popup).getAllByRole('option')).toHaveLength(
      manyLocales.length + 1,
    );

    await userEvent.type(search, 'esp');
    await waitFor(() =>
      expect(within(popup).getAllByRole('option')).toHaveLength(1),
    );
    await expect(
      within(popup).getByRole('option', { name: /^Español/ }),
    ).toBeVisible();

    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    await expect(
      await within(popup).findByText('No languages match your search.'),
    ).toBeVisible();
  },
};

/**
 * Choosing an entry reports the tag, updates the pill, closes the popover and
 * returns focus to the pill; reopening shows the check mark on the choice.
 */
export const OpensAndSelects: Story = {
  args: { value: 'en' },
  play: async ({ canvasElement }) => {
    const { trigger, popup } = await openSwitcher(canvasElement);
    await expect(trigger).toHaveTextContent('EN');

    await userEvent.click(
      within(popup).getByRole('option', { name: /^Español/ }),
    );
    await expect(trigger).toHaveTextContent('ES');
    await expect(trigger).toHaveAccessibleName('Interface language: Español');
    await waitFor(() => expect(popup).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();

    const { popup: reopened } = await openSwitcher(canvasElement);
    await expect(
      within(reopened).getByRole('option', { name: /^Español/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      within(reopened).getByRole('option', { name: 'English EN' }),
    ).toHaveAttribute('aria-selected', 'false');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(reopened).not.toBeInTheDocument());
  },
};

/**
 * Without a search box the list itself takes focus, so the arrow keys move
 * through the languages straight away.
 */
export const KeyboardWithoutSearch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('combobox', {
      name: /^Interface language:/,
    });
    await expect(
      within(canvasElement).queryByRole('textbox'),
    ).not.toBeInTheDocument();

    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    const popup = await screen.findByRole('dialog', {
      name: 'Interface language',
    });
    await expect(within(popup).queryByRole('textbox')).not.toBeInTheDocument();

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await expect(trigger).toHaveTextContent('EN-GB');
  },
};

/**
 * `null` is the automatic entry: the pill names the language the browser
 * resolves to, and the entry itself explains what it follows.
 */
export const AutomaticEntry: Story = {
  play: async ({ canvasElement }) => {
    const { trigger, popup } = await openSwitcher(canvasElement);
    await expect(trigger).toHaveTextContent('Auto · EN');
    await expect(trigger).toHaveAccessibleName(
      'Interface language: Automatic (English)',
    );

    const options = within(popup).getAllByRole('option');
    await expect(options[0]).toHaveTextContent('Automatic (English)');
    await expect(options[0]).toHaveTextContent('AUTO');
    await expect(options[0]).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(
      within(popup).getByRole('option', { name: /^Español/ }),
    );
    await expect(trigger).toHaveTextContent('ES');
    await expect(trigger).toHaveAccessibleName('Interface language: Español');
    await waitFor(() => expect(popup).not.toBeInTheDocument());

    const { popup: reopened } = await openSwitcher(canvasElement);
    await userEvent.click(
      within(reopened).getByRole('option', { name: /^Automatic/ }),
    );
    await expect(trigger).toHaveTextContent('Auto · EN');
    await expect(trigger).toHaveAccessibleName(
      'Interface language: Automatic (English)',
    );
  },
};

/**
 * In a right-to-left region the pill and the rows mirror, while each autonym
 * still renders in its own direction.
 */
export const RightToLeft: Story = {
  globals: { appDirection: 'rtl' },
  args: { options: manyLocales, value: 'ar' },
  play: async ({ canvasElement }) => {
    const { trigger, popup } = await openSwitcher(canvasElement);
    await expect(getComputedStyle(trigger).direction).toBe('rtl');
    await expect(trigger).toHaveTextContent('AR');
    const option = within(popup).getByRole('option', { name: /^العربية/ });
    await expect(option.querySelector('[lang="ar"]')).toBeTruthy();
  },
};
