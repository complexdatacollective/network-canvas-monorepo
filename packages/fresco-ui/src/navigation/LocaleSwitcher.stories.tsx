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
- **\`saveState\`** / **\`persistence\`** — the host's persistence outcome,
  shown in the footer in place of the note: a spinner while \`saving\`, a
  check mark for \`saved\` ("Saved on this device." or "Saved to your
  account.") that gives way to the note after a moment, and a retry button
  for \`failed\`. Choosing keeps the popover open so the outcome is read
  where the choice was made; Escape closes it.
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

    // An autonym sets its own base direction: Arabic reads right-to-left
    // inside this left-to-right list.
    await userEvent.clear(search);
    const arabic = within(popup)
      .getByRole('option', { name: /^العربية/ })
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
 * Choosing an entry reports the tag, moves the check mark and updates the
 * pill while the popover stays open; Escape closes it and returns focus to
 * the pill.
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
    await expect(popup).toBeVisible();
    await expect(
      within(popup).getByRole('option', { name: /^Español/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      within(popup).getByRole('option', { name: 'English EN' }),
    ).toHaveAttribute('aria-selected', 'false');

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

    await userEvent.click(
      within(popup).getByRole('option', { name: /^Automatic/ }),
    );
    await expect(trigger).toHaveTextContent('Auto · EN');
    await expect(trigger).toHaveAccessibleName(
      'Interface language: Automatic (English)',
    );
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
    await expect(trigger).toHaveTextContent('AR');
    const option = within(popup).getByRole('option', { name: /^العربية/ });
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
    timer.current = setTimeout(() => setSaveState(outcome), 800);
  };

  return (
    <LocaleSwitcher
      {...rest}
      persistence={scenario === 'account' ? 'account' : 'device'}
      value={value}
      onChange={onChange}
      saveState={saveState}
    />
  );
}

/**
 * Device storage answers at once: the check mark and "Saved on this device."
 * replace the note, then the note returns.
 */
export const SavesOnDevice: Story = {
  render: (args) => <SavingHost {...args} scenario="device" />,
  play: async ({ canvasElement }) => {
    const { popup } = await openSwitcher(canvasElement);
    await userEvent.click(
      within(popup).getByRole('option', { name: /^Español/ }),
    );
    const status = within(popup).getByRole('status');
    await expect(status).toHaveTextContent('Saved on this device.');
    await expect(popup).not.toHaveTextContent(
      'Interface only, on this device.',
    );
    await waitFor(
      () => expect(popup).toHaveTextContent('Interface only, on this device.'),
      { timeout: 5000 },
    );
    await expect(status).toBeEmptyDOMElement();
  },
};

/**
 * An account write crosses the network: a spinner and "Saving…" first, then
 * the check mark and "Saved to your account."
 */
export const SavesToAccount: Story = {
  args: {
    description:
      'Interface only. Your choice follows your account to your other devices.',
  },
  render: (args) => <SavingHost {...args} scenario="account" />,
  play: async ({ canvasElement }) => {
    const { popup } = await openSwitcher(canvasElement);
    await userEvent.click(
      within(popup).getByRole('option', { name: /^Español/ }),
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
      within(popup).getByRole('option', { name: /^Español/ }),
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
      within(popup).getByRole('option', { name: /^Español/ }),
    );
    await expect(trigger).toHaveTextContent('ES');
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
 * gives way to the note after a moment.
 */
function PinnedStatus({
  saveState,
  persistence,
  description,
}: {
  saveState: Exclude<LocaleSwitcherSaveState, 'idle'>;
  persistence: 'device' | 'account';
  description: string;
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
      description={description}
      defaultOpen
    />
  );
}

export const AllStatuses: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className="grid grid-cols-2 gap-6 p-6 [&>div]:h-[26rem]">
      <div>
        <PinnedStatus
          saveState="saving"
          persistence="device"
          description="Interface only, on this device."
        />
      </div>
      <div>
        <PinnedStatus
          saveState="failed"
          persistence="device"
          description="Interface only, on this device."
        />
      </div>
      <div>
        <PinnedStatus
          saveState="saved"
          persistence="device"
          description="Interface only, on this device."
        />
      </div>
      <div>
        <PinnedStatus
          saveState="saved"
          persistence="account"
          description="Interface only. Your choice follows your account."
        />
      </div>
    </div>
  ),
};
