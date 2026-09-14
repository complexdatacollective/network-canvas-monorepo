import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef, useState } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import type { AppLocale } from '@codaco/app-i18n/locales';

import LocaleSwitcher from './LocaleSwitcher';
import type {
  LocaleSwitcherProps,
  LocaleSwitcherSaveState,
} from './LocaleSwitcher';

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
a globe pill naming the current language in its own name, opening a popover
that lists every interface language under its own \`lang\`. Hosts own
persistence; the chrome copy is shared and translated once.

\`\`\`tsx
import LocaleSwitcher from '@codaco/fresco-ui/navigation/LocaleSwitcher';

<LocaleSwitcher
  options={appLocales}
  value={preference}
  automaticLocale={resolveDeviceLocale(null)}
  onChange={setPreference}
/>
\`\`\`

- **\`options\`** — \`readonly AppLocale[]\`. Each entry's autonym renders
  under its own \`lang\`; the tag is never shown.
- **\`value\`** / **\`onChange\`** — controlled \`string | null\`. \`null\` is
  the automatic entry, which follows the browser.
- **\`automaticLocale\`** — the tag automatic resolves to right now, named on
  the automatic entry ("Automatic (English)") and in the pill ("Auto ·
  English").
- **\`display\`** — what the pill shows beside the globe. \`label\` always
  names the current language, \`icon\` never does (an \`IconButton\`), and
  \`responsive\` (the default) names it only while the nearest \`@container\`
  ancestor is at least 36em wide, so a host bar declares \`@container\` to
  let the pill collapse.
- **\`searchable\`** — puts a search box above the list that filters by
  autonym or tag. Off by default; for hosts that offer many languages.
- **\`saveState\`** / **\`persistence\`** — the host's persistence outcome,
  shown in a footer: a spinner while \`saving\`, a check mark for \`saved\`
  ("Saved on this device." or "Saved to your account.") that goes away after
  a moment, and a retry button for \`failed\`. Choosing keeps the popover open
  so the outcome is read where the choice was made; Escape closes it.
- **\`side\`** / **\`align\`** — where the popover opens; the Interviewer
  status bar uses \`side="top"\`. An arrow points back at the pill.
- The pill is an outline \`Button\` in \`color="dynamic"\`, so it takes the
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
    display: { control: 'radio', options: ['responsive', 'label', 'icon'] },
    searchable: { control: 'boolean' },
    persistence: { control: 'radio', options: ['device', 'account'] },
    side: { control: 'radio', options: ['top', 'bottom'] },
    align: { control: 'radio', options: ['start', 'center', 'end'] },
  },
  args: {
    options: fewLocales,
    value: null,
    automaticLocale: 'en',
    onChange: () => undefined,
    display: 'responsive',
    searchable: false,
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
 * `searchable` puts a search box above the list. It filters by autonym, and
 * by the tag even though the tag is not shown, so "de" still finds Deutsch.
 */
export const WithSearch: Story = {
  args: { options: manyLocales, searchable: true },
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
      within(popup).getByRole('option', { name: 'Español' }),
    ).toBeVisible();

    await userEvent.clear(search);
    await userEvent.type(search, 'de');
    await waitFor(() =>
      expect(within(popup).getAllByRole('option')).toHaveLength(1),
    );
    await expect(
      within(popup).getByRole('option', { name: 'Deutsch' }),
    ).toBeVisible();

    // An autonym sets its own base direction: Arabic reads right-to-left
    // inside this left-to-right list.
    await userEvent.clear(search);
    const arabic = within(popup)
      .getByRole('option', { name: 'العربية' })
      .querySelector('[lang="ar"]');
    await expect(arabic).not.toBeNull();
    await expect(getComputedStyle(arabic!).direction).toBe('rtl');

    await userEvent.type(search, 'zzz');
    await expect(
      await within(popup).findByText('No languages match your search.'),
    ).toBeVisible();
  },
};

/**
 * Choosing an entry reports the tag, moves the check mark and renames the
 * pill while the popover stays open; Escape closes it and returns focus to
 * the pill.
 */
export const OpensAndSelects: Story = {
  args: { value: 'en' },
  play: async ({ canvasElement }) => {
    const { trigger, popup } = await openSwitcher(canvasElement);
    await expect(trigger).toHaveTextContent('English');

    await userEvent.click(
      within(popup).getByRole('option', { name: 'Español' }),
    );
    await expect(trigger).toHaveTextContent('Español');
    await expect(trigger).toHaveAccessibleName('Interface language: Español');
    await expect(popup).toBeVisible();
    await expect(
      within(popup).getByRole('option', { name: 'Español' }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      within(popup).getByRole('option', { name: 'English' }),
    ).toHaveAttribute('aria-selected', 'false');
    await expect(within(popup).queryByText('ES')).not.toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(popup).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
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
    await expect(trigger).toHaveTextContent('English (UK)');
  },
};

/**
 * `null` is the automatic entry: the pill names the language the browser
 * resolves to, and the entry itself explains what it follows.
 */
export const AutomaticEntry: Story = {
  play: async ({ canvasElement }) => {
    const { trigger, popup } = await openSwitcher(canvasElement);
    await expect(trigger).toHaveTextContent('Auto · English');
    await expect(trigger).toHaveAccessibleName(
      'Interface language: Automatic (English)',
    );

    const options = within(popup).getAllByRole('option');
    await expect(options[0]).toHaveTextContent('Automatic (English)');
    await expect(options[0]).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(
      within(popup).getByRole('option', { name: 'Español' }),
    );
    await expect(trigger).toHaveTextContent('Español');
    await expect(trigger).toHaveAccessibleName('Interface language: Español');

    await userEvent.click(
      within(popup).getByRole('option', { name: /^Automatic/ }),
    );
    await expect(trigger).toHaveTextContent('Auto · English');
    await expect(trigger).toHaveAccessibleName(
      'Interface language: Automatic (English)',
    );
  },
};

/** `display="label"`: the pill always names the language, however narrow its bar. */
export const AlwaysLabelled: Story = {
  args: { display: 'label', value: 'es' },
  render: (args) => (
    <div className="@container w-60">
      <ControlledSwitcher {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('combobox');
    await expect(within(trigger).getByText('Español')).toBeVisible();
  },
};

/**
 * `display="icon"`: an `IconButton` showing the globe alone. The accessible
 * name still says which language is current.
 */
export const IconOnly: Story = {
  args: { display: 'icon', value: 'es' },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('combobox');
    await expect(trigger).toHaveAccessibleName('Interface language: Español');
    await expect(trigger).not.toHaveTextContent('Español');

    await userEvent.click(trigger);
    const popup = await screen.findByRole('dialog', {
      name: 'Interface language',
    });
    await userEvent.click(
      within(popup).getByRole('option', { name: 'English' }),
    );
    await expect(trigger).toHaveAccessibleName('Interface language: English');
  },
};

/**
 * `display="responsive"` (the default) reads the nearest `@container`: a bar
 * at least 36em wide shows the name, a narrower one shows the globe alone.
 */
export const Responsive: Story = {
  args: { display: 'responsive', value: 'es' },
  render: (args) => (
    <div className="flex flex-col items-start gap-6">
      <div
        data-testid="wide"
        className="border-outline @container flex w-[40rem] max-w-full justify-end rounded-full border p-2"
      >
        <ControlledSwitcher {...args} />
      </div>
      <div
        data-testid="narrow"
        className="border-outline @container flex w-80 justify-end rounded-full border p-2"
      >
        <ControlledSwitcher {...args} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const wide = within(canvas.getByTestId('wide')).getByRole('combobox');
    const narrow = within(canvas.getByTestId('narrow')).getByRole('combobox');
    await expect(within(wide).getByText('Español')).toBeVisible();
    await expect(within(narrow).getByText('Español')).not.toBeVisible();
    await expect(narrow).toHaveAccessibleName('Interface language: Español');
  },
};

/**
 * In a right-to-left region the pill and the rows mirror; the autonyms keep
 * their own direction here as everywhere.
 */
export const RightToLeft: Story = {
  globals: { appDirection: 'rtl' },
  args: { options: manyLocales, value: 'ar' },
  play: async ({ canvasElement }) => {
    const { trigger, popup } = await openSwitcher(canvasElement);
    await expect(getComputedStyle(trigger).direction).toBe('rtl');
    await expect(trigger).toHaveTextContent('العربية');
    const option = within(popup).getByRole('option', { name: 'العربية' });
    await expect(option.querySelector('[lang="ar"]')).toBeTruthy();
  },
};

/**
 * A host whose persistence behaves as the scenario says. Device storage is
 * synchronous; the account and failure scenarios answer after a short delay,
 * and a failure succeeds on retry.
 */
type SaveScenario = 'device' | 'account' | 'saving' | 'failed';

function SavingHost({
  scenario,
  ...rest
}: Omit<LocaleSwitcherProps, 'value' | 'onChange' | 'saveState'> & {
  scenario: SaveScenario;
}) {
  const [value, setValue] = useState<string | null>('en');
  const [saveState, setSaveState] = useState<LocaleSwitcherSaveState>('idle');
  const attempts = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onChange = (next: string | null) => {
    setValue(next);
    attempts.current += 1;
    clearTimeout(timer.current);
    if (scenario === 'device') {
      setSaveState('saved');
      return;
    }
    setSaveState('saving');
    if (scenario === 'saving') return;
    const outcome: LocaleSwitcherSaveState =
      scenario === 'failed' && attempts.current === 1 ? 'failed' : 'saved';
    timer.current = setTimeout(() => setSaveState(outcome), 600);
  };

  return (
    <LocaleSwitcher
      {...rest}
      value={value}
      onChange={onChange}
      saveState={saveState}
      persistence={scenario === 'account' ? 'account' : 'device'}
    />
  );
}

/**
 * Device storage answers at once: the check mark and "Saved on this device."
 * appear in the footer, then the footer goes away.
 */
export const SavesOnDevice: Story = {
  render: (args) => <SavingHost {...args} scenario="device" />,
  play: async ({ canvasElement }) => {
    const { popup } = await openSwitcher(canvasElement);
    await userEvent.click(
      within(popup).getByRole('option', { name: 'Español' }),
    );
    const status = within(popup).getByRole('status');
    await expect(status).toHaveTextContent('Saved on this device.');
    await expect(status).toBeVisible();
    await waitFor(() => expect(status).toBeEmptyDOMElement(), {
      timeout: 5000,
    });
  },
};

/**
 * An account write crosses the network: a spinner and "Saving…" first, then
 * the check mark and "Saved to your account."
 */
export const SavesToAccount: Story = {
  render: (args) => <SavingHost {...args} scenario="account" />,
  play: async ({ canvasElement }) => {
    const { popup } = await openSwitcher(canvasElement);
    await userEvent.click(
      within(popup).getByRole('option', { name: 'Español' }),
    );
    const status = within(popup).getByRole('status');
    await expect(status).toHaveTextContent('Saving…');
    await waitFor(() =>
      expect(status).toHaveTextContent('Saved to your account.'),
    );
  },
};

/** The write never answers: the spinner stays. */
export const Saving: Story = {
  render: (args) => <SavingHost {...args} scenario="saving" />,
  play: async ({ canvasElement }) => {
    const { popup } = await openSwitcher(canvasElement);
    await userEvent.click(
      within(popup).getByRole('option', { name: 'Español' }),
    );
    await expect(within(popup).getByRole('status')).toHaveTextContent(
      'Saving…',
    );
  },
};

/**
 * The write fails: the language still applies, the footer says the choice
 * could not be saved, and "Try again" repeats the same choice — which
 * succeeds this time.
 */
export const SaveFails: Story = {
  render: (args) => <SavingHost {...args} scenario="failed" />,
  play: async ({ canvasElement }) => {
    const { trigger, popup } = await openSwitcher(canvasElement);
    await userEvent.click(
      within(popup).getByRole('option', { name: 'Español' }),
    );
    await expect(trigger).toHaveTextContent('Español');
    const status = within(popup).getByRole('status');
    await waitFor(() =>
      expect(status).toHaveTextContent(
        'Couldn’t save. The language applies for now.',
      ),
    );

    await userEvent.click(
      within(status).getByRole('button', { name: 'Try again' }),
    );
    await expect(status).toHaveTextContent('Saving…');
    await waitFor(() =>
      expect(status).toHaveTextContent('Saved on this device.'),
    );
    await expect(
      within(status).queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
  },
};

/**
 * Every footer status at once, each popover open from the start. The two
 * "saved" instances are re-triggered every few seconds, since a saved status
 * goes away after a moment.
 */
function PinnedStatus({
  saveState,
  persistence,
}: {
  saveState: Exclude<LocaleSwitcherSaveState, 'idle'>;
  persistence: 'device' | 'account';
}) {
  const [state, setState] = useState<LocaleSwitcherSaveState>(saveState);
  useEffect(() => {
    if (saveState !== 'saved') return;
    const interval = setInterval(() => {
      setState('idle');
      setTimeout(() => setState('saved'), 50);
    }, 2500);
    return () => clearInterval(interval);
  }, [saveState]);
  return (
    <LocaleSwitcher
      options={fewLocales}
      value="es"
      automaticLocale="en"
      onChange={() => undefined}
      saveState={state}
      persistence={persistence}
      display="label"
      defaultOpen
    />
  );
}

export const AllStatuses: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className="grid grid-cols-2 gap-6 p-6 [&>div]:h-[26rem]">
      <div>
        <PinnedStatus saveState="saving" persistence="device" />
      </div>
      <div>
        <PinnedStatus saveState="failed" persistence="device" />
      </div>
      <div>
        <PinnedStatus saveState="saved" persistence="device" />
      </div>
      <div>
        <PinnedStatus saveState="saved" persistence="account" />
      </div>
    </div>
  ),
};
