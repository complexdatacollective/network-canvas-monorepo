import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactElement } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import EverythingBar, {
  type EverythingBarLabels,
  type EverythingBarLinkRenderProps,
  type EverythingBarProps,
} from './EverythingBar';
import type {
  EverythingBarGroup,
  EverythingBarItem,
  EverythingBarProvider,
  EverythingBarSearchPage,
} from './everythingBarModel';

const labels: EverythingBarLabels = {
  triggerPlaceholder: 'Search Studio',
  triggerMac: 'Search and commands (Command K)',
  triggerOther: 'Search and commands (Control K)',
  dialog: 'Search and commands',
  searchLabel: 'Search destinations, commands and documentation',
  searchPlaceholder: 'Find a place, a thing, an action, or an answer',
  results: 'Results',
  recents: 'Recent',
  groups: {
    'go-to': 'Go to',
    'commands': 'Commands',
    'documentation': 'Documentation',
  },
  showMore: 'Show more',
  pending: 'Searching…',
  error: 'These results could not be loaded. Press Enter to try again.',
  noResults: 'Nothing matches that search.',
  resultCount: (count) => (count === 1 ? '1 result' : `${count} results`),
  footerNavigate: 'Navigate',
  footerSelect: 'Select',
  footerClose: 'Close',
};

const RECENTS_KEY = 'fresco-ui:everything-bar:stories';

type RecentRef = { providerId: string; itemId: string };

const clearRecents = () => window.localStorage.removeItem(RECENTS_KEY);

const storedRecents = () =>
  JSON.parse(
    window.localStorage.getItem(RECENTS_KEY) ?? '[]',
  ) as unknown as RecentRef[];

// ─── Mock providers ──────────────────────────────────────────────────────────

const destination = (
  id: string,
  label: string,
  context: string,
  tier: number,
  position: number,
  href: string,
  chordHint?: string[],
): EverythingBarItem => ({
  id,
  group: 'go-to',
  label,
  context,
  rank: { tier, position },
  chordHint,
  activate: { kind: 'navigate', href },
});

const STUDY = 'Study · Community Recovery Panel 2027';
const TEAM = 'Team · Field Research Lab';

const destinationItems: EverythingBarItem[] = [
  destination('study:st_42:overview', 'Overview', STUDY, 0, 0, '/study/st_42', [
    'G',
    'O',
  ]),
  destination(
    'study:st_42:participants',
    'Participants',
    STUDY,
    0,
    1,
    '/study/st_42/participants',
    ['G', 'P'],
  ),
  destination(
    'study:st_42:protocols',
    'Protocols',
    STUDY,
    0,
    2,
    '/study/st_42/protocols',
  ),
  destination(
    'team:tm_7:members',
    'Team members',
    TEAM,
    1,
    0,
    '/team/tm_7/members',
    ['G', 'M'],
  ),
  destination(
    'team:tm_7:activity',
    'Activity log',
    TEAM,
    1,
    1,
    '/team/tm_7/activity',
    ['G', 'A'],
  ),
  destination(
    'platform:gallery',
    'Protocol gallery',
    'Platform',
    3,
    0,
    '/gallery',
  ),
];

const destinations: EverythingBarProvider = {
  id: 'destinations',
  local: true,
  persistence: 'recents',
  items: () => destinationItems,
  resolve: (id) =>
    Promise.resolve(destinationItems.find((item) => item.id === id) ?? null),
};

const commandItems: EverythingBarItem[] = [
  {
    id: 'participants.import',
    group: 'commands',
    label: 'Import a participant list',
    context: 'Study',
    rank: { tier: 0, position: 0 },
    activate: {
      kind: 'open',
      href: '/study/st_42/participants',
      surface: 'participants.import',
    },
  },
  {
    id: 'members.invite',
    group: 'commands',
    label: 'Invite a team member',
    context: 'Team',
    rank: { tier: 1, position: 0 },
    activate: {
      kind: 'open',
      href: '/team/tm_7/members',
      surface: 'members.invite',
    },
  },
  {
    id: 'studies.create',
    group: 'commands',
    label: 'Create a study',
    context: 'Platform',
    rank: { tier: 2, position: 0 },
    activate: { kind: 'open', href: '/studies', surface: 'studies.create' },
  },
  {
    id: 'account.signOut',
    group: 'commands',
    label: 'Sign out',
    context: 'Account',
    rank: { tier: 2, position: 1 },
    activate: { kind: 'open', href: '/account', surface: 'account.signOut' },
  },
];

const commands: EverythingBarProvider = {
  id: 'commands',
  local: true,
  persistence: 'recents',
  items: () => commandItems,
  resolve: (id) =>
    Promise.resolve(commandItems.find((item) => item.id === id) ?? null),
};

const entityItems: EverythingBarItem[] = [
  {
    id: 'study:st_58',
    group: 'go-to',
    label: 'Participant wellbeing pilot',
    context: 'Study · Field Research Lab',
    rank: { tier: 1, recency: '2026-08-02T11:00:00.000Z' },
    activate: { kind: 'navigate', href: '/study/st_58' },
  },
  {
    id: 'study:st_63',
    group: 'go-to',
    label: 'Participation barriers study',
    context: 'Study · Northside Health',
    rank: { tier: 2, recency: '2026-05-19T16:40:00.000Z' },
    activate: { kind: 'navigate', href: '/study/st_63' },
  },
];

const entities: EverythingBarProvider = {
  id: 'entities',
  local: false,
  groups: ['go-to'],
  persistence: 'recents',
  search: (query) =>
    Promise.resolve({
      items: entityItems.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase()),
      ),
    }),
  resolve: (id) =>
    Promise.resolve(entityItems.find((item) => item.id === id) ?? null),
};

const documentationItems: EverythingBarItem[] = [
  {
    id: 'docs:managing-participants',
    group: 'documentation',
    label: 'Managing participants',
    context: 'Studio · Manage your study',
    rank: { tier: 0, position: 0 },
    activate: {
      kind: 'external',
      href: 'https://documentation.networkcanvas.com/en/studio/participants',
    },
  },
  {
    id: 'docs:participant-identifiers',
    group: 'documentation',
    label: 'Participant identifiers',
    context: 'Design protocols',
    rank: { tier: 0, position: 1 },
    activate: {
      kind: 'external',
      href: 'https://documentation.networkcanvas.com/en/design-protocols/identifiers',
    },
  },
];

const documentation: EverythingBarProvider = {
  id: 'documentation',
  local: false,
  groups: ['documentation'],
  persistence: 'never',
  search: (query) =>
    Promise.resolve({
      items: documentationItems.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase()),
      ),
    }),
};

const defaultProviders = [destinations, commands, entities, documentation];

// ─── Test harness ────────────────────────────────────────────────────────────

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type SearchCall = {
  query: string;
  cursor: string | undefined;
} & Deferred<EverythingBarSearchPage>;

/**
 * A remote provider whose every response the play function resolves by hand.
 * That is what makes a late arrival, a superseded response, and a rejection
 * observable facts rather than races.
 */
function createControlledProvider(
  id: string,
  groups: readonly EverythingBarGroup[],
) {
  const calls: SearchCall[] = [];
  const provider: EverythingBarProvider = {
    id,
    local: false,
    groups,
    persistence: 'never',
    search: (query, _signal, cursor) => {
      const deferred = createDeferred<EverythingBarSearchPage>();
      calls.push({ query, cursor, ...deferred });
      return deferred.promise;
    },
  };

  return { provider, calls };
}

function Harness({
  providers,
  ...props
}: Partial<EverythingBarProps> & { providers: EverythingBarProvider[] }) {
  const [open, setOpen] = useState(false);
  const [activations, setActivations] = useState<string[]>([]);
  const [surfaces, setSurfaces] = useState<string[]>([]);

  const renderLink = (
    linkProps: EverythingBarLinkRenderProps,
  ): ReactElement => {
    const { onClick, children, ...rest } = linkProps;
    return (
      <a
        {...rest}
        onClick={(event) => {
          // Stands in for the app's router: a story must never navigate the
          // test page, and the recorded href is what proves a row activated.
          event.preventDefault();
          onClick(event);
          setActivations((current) => [...current, rest.href]);
        }}
      >
        {children}
      </a>
    );
  };

  return (
    <div className="w-[28rem]">
      <EverythingBar
        labels={labels}
        debounceMs={0}
        platform="mac"
        {...props}
        providers={providers}
        open={open}
        onOpenChange={setOpen}
        renderLink={renderLink}
        onOpenSurface={({ href, surface }) =>
          setSurfaces((current) => [...current, `${href}#${surface}`])
        }
        recentsStorageKey={RECENTS_KEY}
      />
      <pre data-testid="activation-log" className="sr-only">
        {activations.join('\n')}
      </pre>
      <pre data-testid="surface-log" className="sr-only">
        {surfaces.join('\n')}
      </pre>
    </div>
  );
}

// ─── Play helpers ────────────────────────────────────────────────────────────

const openBar = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const trigger = canvas.getByRole('button', { name: labels.triggerMac });
  await userEvent.click(trigger);
  const dialog = await within(document.body).findByRole('dialog', {
    name: labels.dialog,
  });
  return { trigger, dialog, input: within(dialog).getByRole('combobox') };
};

const optionLabels = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('option')
    .map((option) => option.textContent ?? '');

const highlightedOption = (dialog: HTMLElement) => {
  const id = within(dialog)
    .getByRole('combobox')
    .getAttribute('aria-activedescendant');
  return id === null ? null : dialog.ownerDocument.getElementById(id);
};

const groupOptionLabels = (dialog: HTMLElement, name: string) =>
  within(within(dialog).getByRole('group', { name }))
    .getAllByRole('option')
    .map((option) => option.textContent ?? '');

const marksIn = (option: HTMLElement) =>
  [...option.querySelectorAll('mark')].map((mark) => mark.textContent);

const meta = {
  title: 'Navigation/EverythingBar',
  component: EverythingBar,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `A single search-and-command surface: one dialog holding the ARIA combobox pattern over a bounded, grouped result list.

\`\`\`tsx
import EverythingBar from '@codaco/fresco-ui/navigation/EverythingBar';

<EverythingBar
  providers={[destinations, commands, entities, documentation]}
  labels={labels}
  renderLink={(props) => <Link {...props} />}
  onOpenSurface={({ href, surface }) => openSurfaceOnArrival(href, surface)}
  open={open}
  onOpenChange={setOpen}
/>;
\`\`\`

### The provider seam

Providers own what exists and whether the person may see it. The component owns matching, the fixed group order (Go to, Commands, Documentation), per-group bounds and pagination, error containment, the keyboard model, and recents.

| Prop | Responsibility |
| --- | --- |
| \`providers\` | Local inventories (\`local: true\`, filtered on every keystroke) and remote searches (\`local: false\`, debounced, abortable, paged). \`persistence\` decides whether an activation may be written to local recents at all. |
| \`labels\` | Every rendered string, already translated. Whole strings only; the keyboard keys the footer and chord hints render are keys, not prose. |
| \`renderLink\` | Renders one result row as the app's router link, exactly as \`SiteNavigation\` does. The pointer and \`Enter\` both go through it, so navigation takes one path. |
| \`onOpenSurface\` | Receives \`{ href, surface }\` for an \`open\` activation. The bar reports it; the destination screen performs it. |
| \`open\` / \`onOpenChange\` | Controlled, because an app's shortcut registry owns the \`⌘K\` binding and every chord the rows hint at. |

### Behaviour worth knowing

- The highlighted row is tracked by its provider-qualified identity (\`providerId:itemId\`), never by list position, so a late remote result inserting above it cannot move it — and when an insertion would push it past a group's bound, the window extends rather than unmounting it.
- Each group renders at most \`groupBound\` rows plus one "show more" row, which is part of the arrow-key sequence. Revealing the next slice fetches a remote continuation only when that slice would read past what the provider has already delivered.
- A rejected provider search renders a retryable error row in its group; a response that resolves after its query was superseded is discarded.
- Activations from a provider declaring \`persistence: 'recents'\` are stored as references and re-resolved through the provider on open; a provider declaring \`'never'\` has nothing written for it at all.`,
      },
    },
  },
  tags: ['autodocs'],
  args: {
    providers: defaultProviders,
    labels,
    renderLink: ({ children, ...props }: EverythingBarLinkRenderProps) => (
      <a {...props}>{children}</a>
    ),
    platform: 'mac',
  },
  argTypes: {
    providers: { control: false },
    renderLink: { control: false },
    labels: { control: false },
    onOpenSurface: { control: false },
    platform: { control: 'inline-radio', options: ['mac', 'other'] },
    groupBound: { control: { type: 'number', min: 1, max: 10 } },
    debounceMs: { control: { type: 'number', min: 0, max: 500 } },
  },
} satisfies Meta<typeof EverythingBar>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The whole anatomy over mock providers: destinations carrying their area and
 * chord hints, entities from other teams, commands that open a surface on the
 * screen that owns it, and documentation results that leave for a new tab.
 */
export const Default: Story = {
  beforeEach: () => {
    clearRecents();
  },
  render: ({ providers, ...args }) => (
    <Harness {...args} providers={providers} />
  ),
  play: async ({ canvasElement }) => {
    const { dialog, input } = await openBar(canvasElement);
    await userEvent.type(input, 'parti');

    await waitFor(() =>
      expect(
        within(dialog).getByRole('option', { name: /Managing participants/ }),
      ).toBeVisible(),
    );
    await expect(
      within(dialog).getByRole('group', { name: labels.groups['go-to'] }),
    ).toBeVisible();
    await expect(
      within(dialog).getByRole('group', { name: labels.groups.commands }),
    ).toBeVisible();
  },
};

/** The header affordance on its own, naming the platform's actual binding. */
export const Trigger: Story = {
  render: ({ providers, ...args }) => (
    <Harness {...args} providers={providers} />
  ),
};

/**
 * Roles, the active-descendant relationship, group names, the polite count
 * announcement, and the focus contract on open and on close.
 */
export const ComboboxSemantics: Story = {
  beforeEach: () => {
    clearRecents();
  },
  render: ({ providers, ...args }) => (
    <Harness {...args} providers={providers} />
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement)
        .getByRole('button', { name: labels.triggerMac })
        .closest('[inert]'),
    ).toBeNull();

    const { trigger, dialog, input } = await openBar(canvasElement);

    await expect(input).toHaveFocus();
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await expect(input).toHaveAccessibleName(labels.searchLabel);

    const listbox = within(dialog).getByRole('listbox', {
      name: labels.results,
    });
    await expect(input).toHaveAttribute('aria-controls', listbox.id);

    // Everything outside the dialog is inert while it is open, so Tab cannot
    // walk out of it and into the page behind.
    await expect(trigger.closest('[inert]')).not.toBeNull();

    await userEvent.type(input, 'parti');

    await waitFor(() => {
      const active = highlightedOption(dialog);
      expect(active).not.toBeNull();
      expect(active).toHaveAttribute('aria-selected', 'true');
      expect(active?.textContent).toContain('Participants');
    });

    // Announced once the query settles, not once per arriving provider.
    await waitFor(() =>
      expect(within(dialog).getByRole('status')).toHaveTextContent('6 results'),
    );

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        within(document.body).queryByRole('dialog', { name: labels.dialog }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

const stabilityDestinations: EverythingBarProvider = {
  id: 'destinations',
  local: true,
  persistence: 'never',
  items: () =>
    ['one', 'two', 'three', 'four', 'five'].map((word, index) => ({
      id: `local-${word}`,
      group: 'go-to' as const,
      label: `Local ${word}`,
      // Tier 1: every one of these ranks below a tier-0 remote result.
      rank: { tier: 1, position: index },
      activate: { kind: 'navigate' as const, href: `/local/${word}` },
    })),
};

const stability = createControlledProvider('entities', ['go-to']);

/**
 * A late result inserting ABOVE the highlighted row must not move the
 * highlight, and when the insertion pushes that row past the group's bound the
 * window extends, so `aria-activedescendant` still names a rendered option.
 */
export const SelectionStability: Story = {
  beforeEach: () => {
    clearRecents();
    stability.calls.length = 0;
  },
  render: ({ providers: _providers, ...args }) => (
    <Harness
      {...args}
      providers={[stabilityDestinations, stability.provider]}
    />
  ),
  play: async ({ canvasElement }) => {
    const { dialog, input } = await openBar(canvasElement);
    await userEvent.type(input, 'local');

    // Five local matches fill the group's bound of five exactly.
    await waitFor(() => expect(optionLabels(dialog)).toHaveLength(5));
    await userEvent.keyboard('{ArrowDown>4/}');

    const before = highlightedOption(dialog);
    const beforeId = before?.id;
    await expect(before?.textContent).toContain('Local five');

    const call = stability.calls.at(-1);
    if (!call) throw new Error('the remote provider was never asked');
    call.resolve({
      items: [
        {
          id: 'study:st_42',
          group: 'go-to',
          label: 'Community Recovery Panel 2027',
          context: 'Study · Field Research Lab',
          rank: { tier: 0, recency: '2026-08-28T09:15:00.000Z' },
          activate: { kind: 'navigate', href: '/study/st_42' },
        },
      ],
    });

    await waitFor(() =>
      expect(
        within(dialog).getByRole('option', {
          name: /Community Recovery Panel 2027/,
        }),
      ).toBeVisible(),
    );

    // Same item, by identity, and still mounted: the window extended past the
    // bound of five rather than unmounting the highlighted option.
    const after = highlightedOption(dialog);
    await expect(after).not.toBeNull();
    await expect(after?.id).toBe(beforeId);
    await expect(after?.textContent).toContain('Local five');
    await expect(optionLabels(dialog)).toHaveLength(6);

    // The late result landed in rank order, not appended below.
    await expect(optionLabels(dialog)[0]).toContain(
      'Community Recovery Panel 2027',
    );
  },
};

const mergingDestinations: EverythingBarProvider = {
  id: 'destinations',
  local: true,
  persistence: 'never',
  items: () => [
    {
      id: 'alpha',
      group: 'go-to',
      label: 'Alpha destination',
      rank: { tier: 1, position: 0 },
      activate: { kind: 'navigate', href: '/alpha' },
    },
    {
      id: 'beta',
      group: 'go-to',
      label: 'Beta destination',
      rank: { tier: 1, position: 1 },
      activate: { kind: 'navigate', href: '/beta' },
    },
  ],
};

const positionedDocumentation: EverythingBarProvider = {
  id: 'documentation',
  local: false,
  groups: ['documentation'],
  persistence: 'never',
  search: () =>
    Promise.resolve({
      items: [
        {
          id: 'zebra',
          group: 'documentation',
          label: 'Zebra crossings and consent',
          rank: { tier: 0, position: 0 },
          activate: { kind: 'external', href: 'https://example.org/zebra' },
        },
        {
          id: 'anon',
          group: 'documentation',
          label: 'Anonymising exports',
          rank: { tier: 0, position: 1 },
          activate: { kind: 'external', href: 'https://example.org/anon' },
        },
        {
          id: 'dated',
          group: 'documentation',
          label: 'Aardvarks, dated but unpositioned',
          rank: { tier: 0, recency: '2026-01-01T00:00:00.000Z' },
          activate: { kind: 'external', href: 'https://example.org/aardvark' },
        },
        {
          id: 'undated',
          group: 'documentation',
          label: 'Abacus, neither dated nor positioned',
          rank: { tier: 0 },
          activate: { kind: 'external', href: 'https://example.org/abacus' },
        },
      ],
    }),
};

const merging = createControlledProvider('entities', ['go-to']);

/**
 * Items from different providers merge into one order per group: tier, then
 * position, then recency, then label, then the provider-qualified key.
 */
export const RankMerging: Story = {
  beforeEach: () => {
    clearRecents();
    merging.calls.length = 0;
  },
  render: ({ providers: _providers, ...args }) => (
    <Harness
      {...args}
      providers={[
        mergingDestinations,
        merging.provider,
        positionedDocumentation,
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const { dialog, input } = await openBar(canvasElement);
    await userEvent.type(input, 'a');

    await waitFor(() =>
      expect(groupOptionLabels(dialog, labels.groups['go-to'])).toHaveLength(2),
    );

    const call = merging.calls.at(-1);
    if (!call) throw new Error('the remote provider was never asked');
    call.resolve({
      items: [
        {
          id: 'study:st_42',
          group: 'go-to',
          label: 'Zebra recovery panel',
          context: 'Study · Field Research Lab',
          rank: { tier: 0, recency: '2026-08-28T09:15:00.000Z' },
          activate: { kind: 'navigate', href: '/study/st_42' },
        },
      ],
    });

    // A tier-0 remote item outranks the tier-1 local rows that rendered first,
    // in spite of sorting last alphabetically.
    await waitFor(() =>
      expect(groupOptionLabels(dialog, labels.groups['go-to'])[0]).toContain(
        'Zebra recovery panel',
      ),
    );

    // A server-ranked page keeps its own order: `position` beats the label, so
    // a component that alphabetised would fail here.
    const documentationLabels = groupOptionLabels(
      dialog,
      labels.groups.documentation,
    );
    await expect(documentationLabels[0]).toContain('Zebra crossings');
    await expect(documentationLabels[1]).toContain('Anonymising exports');
    // Defined null placement: positioned rows first, then a dated row, then an
    // undated one — identically on every run.
    await expect(documentationLabels[2]).toContain('Aardvarks');
    await expect(documentationLabels[3]).toContain('Abacus');
  },
};

const collidingDestinations: EverythingBarProvider = {
  id: 'destinations',
  local: true,
  persistence: 'never',
  items: () => [
    {
      id: 'settings',
      group: 'go-to',
      label: 'Settings screen',
      rank: { tier: 0, position: 0 },
      activate: { kind: 'navigate', href: '/study/st_42/settings' },
    },
  ],
};

const collidingCommands: EverythingBarProvider = {
  id: 'commands',
  local: true,
  persistence: 'never',
  items: () => [
    {
      id: 'settings',
      group: 'go-to',
      label: 'Settings command',
      rank: { tier: 0, position: 1 },
      activate: { kind: 'navigate', href: '/account/settings' },
    },
  ],
};

/**
 * Two providers returning the same natural id stay distinct rows, because
 * identity is `providerId:itemId` everywhere it matters.
 */
export const CrossProviderIdCollision: Story = {
  beforeEach: () => {
    clearRecents();
  },
  render: ({ providers: _providers, ...args }) => (
    <Harness {...args} providers={[collidingDestinations, collidingCommands]} />
  ),
  play: async ({ canvasElement }) => {
    const { dialog, input } = await openBar(canvasElement);
    await userEvent.type(input, 'settings');

    await waitFor(() => expect(optionLabels(dialog)).toHaveLength(2));
    const [first, second] = within(dialog).getAllByRole('option');
    await expect(first?.id).not.toBe(second?.id);

    await expect(highlightedOption(dialog)?.id).toBe(first?.id);
    await userEvent.keyboard('{ArrowDown}');
    await expect(highlightedOption(dialog)?.id).toBe(second?.id);

    await userEvent.keyboard('{Enter}');
    const log = within(canvasElement).getByTestId('activation-log');
    await waitFor(() => expect(log.textContent).toContain('/account/settings'));
    await expect(log.textContent).not.toContain('/study/st_42/settings');
  },
};

const pagedLocalDestinations: EverythingBarProvider = {
  id: 'destinations',
  local: true,
  persistence: 'never',
  items: () =>
    [
      { id: 'l1', label: 'Panel one', position: 2 },
      { id: 'l2', label: 'Panel two', position: 3 },
      { id: 'l3', label: 'Panel three', position: 4 },
      { id: 'l4', label: 'Panel four', position: 7 },
      { id: 'l5', label: 'Panel five', position: 8 },
    ].map(({ id, label, position }) => ({
      id,
      group: 'go-to' as const,
      label,
      rank: { tier: 0, position },
      activate: { kind: 'navigate' as const, href: `/${id}` },
    })),
};

const paging = createControlledProvider('entities', ['go-to']);

/**
 * A group holding local rows beyond its bound AND a remote continuation
 * fetches the outstanding cursor before revealing, then reveals exactly one
 * bounded slice of the merged order, with neither source stranded.
 */
export const MixedGroupPagination: Story = {
  beforeEach: () => {
    clearRecents();
    paging.calls.length = 0;
  },
  render: ({ providers: _providers, ...args }) => (
    <Harness {...args} providers={[pagedLocalDestinations, paging.provider]} />
  ),
  play: async ({ canvasElement }) => {
    const { dialog, input } = await openBar(canvasElement);
    await userEvent.type(input, 'panel');

    await waitFor(() => expect(paging.calls.at(-1)?.query).toBe('panel'));
    paging.calls.at(-1)?.resolve({
      items: [
        {
          id: 'r1',
          group: 'go-to',
          label: 'Panel remote one',
          rank: { tier: 0, position: 0 },
          activate: { kind: 'navigate', href: '/r1' },
        },
        {
          id: 'r2',
          group: 'go-to',
          label: 'Panel remote two',
          rank: { tier: 0, position: 1 },
          activate: { kind: 'navigate', href: '/r2' },
        },
      ],
      next: 'cursor-2',
    });

    await waitFor(() =>
      expect(optionLabels(dialog)).toEqual([
        expect.stringContaining('Panel remote one'),
        expect.stringContaining('Panel remote two'),
        expect.stringContaining('Panel one'),
        expect.stringContaining('Panel two'),
        expect.stringContaining('Panel three'),
        labels.showMore,
      ]),
    );

    const callsBefore = paging.calls.length;
    await userEvent.click(
      within(dialog).getByRole('option', { name: labels.showMore }),
    );

    // The held local rows are NOT revealed yet: the outstanding cursor could
    // still deliver rows that outrank them.
    await waitFor(() => expect(paging.calls).toHaveLength(callsBefore + 1));
    await expect(paging.calls.at(-1)?.cursor).toBe('cursor-2');
    await expect(optionLabels(dialog)).not.toEqual(
      expect.arrayContaining([expect.stringContaining('Panel four')]),
    );

    paging.calls.at(-1)?.resolve({
      items: [
        {
          id: 'r3',
          group: 'go-to',
          label: 'Panel remote three',
          rank: { tier: 0, position: 5 },
          activate: { kind: 'navigate', href: '/r3' },
        },
        {
          id: 'r4',
          group: 'go-to',
          label: 'Panel remote four',
          rank: { tier: 0, position: 6 },
          activate: { kind: 'navigate', href: '/r4' },
        },
      ],
    });

    // Exactly one bounded slice, in merged order, with the highlight on the
    // first revealed row.
    await waitFor(() =>
      expect(optionLabels(dialog)).toEqual([
        expect.stringContaining('Panel remote one'),
        expect.stringContaining('Panel remote two'),
        expect.stringContaining('Panel one'),
        expect.stringContaining('Panel two'),
        expect.stringContaining('Panel three'),
        expect.stringContaining('Panel remote three'),
        expect.stringContaining('Panel remote four'),
        expect.stringContaining('Panel four'),
        expect.stringContaining('Panel five'),
      ]),
    );
    await expect(highlightedOption(dialog)?.textContent).toContain(
      'Panel remote three',
    );
  },
};

const localOnlyPaging: EverythingBarProvider = {
  id: 'destinations',
  local: true,
  persistence: 'never',
  items: () =>
    Array.from({ length: 7 }, (_, index) => ({
      id: `d${index}`,
      group: 'go-to' as const,
      label: `Destination ${String(index + 1).padStart(2, '0')}`,
      rank: { tier: 0, position: index },
      activate: { kind: 'navigate' as const, href: `/d${index}` },
    })),
};

/**
 * Arrow keys traverse the flat sequence, including each group's "show more"
 * row; `Enter` there reveals the next slice with the highlight on the first
 * revealed row, and `Enter` on a result activates it.
 */
export const KeyboardTraversal: Story = {
  beforeEach: () => {
    clearRecents();
  },
  render: ({ providers: _providers, ...args }) => (
    <Harness {...args} providers={[localOnlyPaging]} />
  ),
  play: async ({ canvasElement }) => {
    const { dialog, input } = await openBar(canvasElement);
    await userEvent.type(input, 'destination');

    await waitFor(() => expect(optionLabels(dialog)).toHaveLength(6));
    await expect(optionLabels(dialog).at(-1)).toBe(labels.showMore);

    // Five results, then the "show more" row: arrowing past the last result
    // reaches it rather than stopping at the bound.
    await userEvent.keyboard('{ArrowDown>5/}');
    await expect(highlightedOption(dialog)?.textContent).toBe(labels.showMore);

    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(optionLabels(dialog)).toHaveLength(7));
    await expect(highlightedOption(dialog)?.textContent).toContain(
      'Destination 06',
    );

    await userEvent.keyboard('{Enter}');
    const log = within(canvasElement).getByTestId('activation-log');
    await waitFor(() => expect(log.textContent).toContain('/d5'));
    await waitFor(() =>
      expect(
        within(document.body).queryByRole('dialog', { name: labels.dialog }),
      ).not.toBeInTheDocument(),
    );
  },
};

const superseded = createControlledProvider('entities', ['go-to']);

/**
 * A response that resolves after its query was superseded is discarded, even
 * though the network fulfilled it before the abort landed.
 */
export const SupersededQuery: Story = {
  beforeEach: () => {
    clearRecents();
    superseded.calls.length = 0;
  },
  render: ({ providers: _providers, ...args }) => (
    <Harness {...args} providers={[superseded.provider]} />
  ),
  play: async ({ canvasElement }) => {
    const { dialog, input } = await openBar(canvasElement);

    await userEvent.type(input, 'pa');
    await waitFor(() => expect(superseded.calls.at(-1)?.query).toBe('pa'));
    const stale = superseded.calls.at(-1);

    await userEvent.type(input, 'r');
    await waitFor(() => expect(superseded.calls.at(-1)?.query).toBe('par'));
    const current = superseded.calls.at(-1);
    if (!stale || !current) throw new Error('the provider was never asked');

    current.resolve({
      items: [
        {
          id: 'fresh',
          group: 'go-to',
          label: 'Answer to the newer query',
          rank: { tier: 0 },
          activate: { kind: 'navigate', href: '/fresh' },
        },
      ],
    });
    await waitFor(() =>
      expect(
        within(dialog).getByRole('option', {
          name: /Answer to the newer query/,
        }),
      ).toBeVisible(),
    );

    // Deliberately late: the superseded request resolves after its successor.
    stale.resolve({
      items: [
        {
          id: 'stale',
          group: 'go-to',
          label: 'Answer to the superseded query',
          rank: { tier: 0 },
          activate: { kind: 'navigate', href: '/stale' },
        },
      ],
    });

    await waitFor(() =>
      expect(
        within(dialog).queryByRole('option', {
          name: /Answer to the superseded query/,
        }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      within(dialog).getByRole('option', { name: /Answer to the newer query/ }),
    ).toBeVisible();
  },
};

const failing = createControlledProvider('documentation', ['documentation']);

/**
 * A rejected search clears the group's pending state and renders a retryable
 * error row — never an indefinite spinner, and never a false "no matches".
 */
export const ErrorContainment: Story = {
  beforeEach: () => {
    clearRecents();
    failing.calls.length = 0;
  },
  render: ({ providers: _providers, ...args }) => (
    <Harness {...args} providers={[destinations, failing.provider]} />
  ),
  play: async ({ canvasElement }) => {
    const { dialog, input } = await openBar(canvasElement);
    await userEvent.type(input, 'participants');

    await waitFor(() =>
      expect(failing.calls.at(-1)?.query).toBe('participants'),
    );
    await expect(within(dialog).getByText(labels.pending)).toBeVisible();

    failing.calls.at(-1)?.reject(new Error('rpc unavailable'));

    await waitFor(() =>
      expect(
        within(dialog).getByRole('option', { name: labels.error }),
      ).toBeVisible(),
    );
    await expect(within(dialog).queryByText(labels.pending)).toBeNull();
    // The rest of the bar is unaffected: local results are still listed.
    await expect(
      within(dialog).getByRole('option', { name: /Participants/ }),
    ).toBeVisible();
    await expect(within(dialog).queryByText(labels.noResults)).toBeNull();

    const callsBefore = failing.calls.length;
    await userEvent.click(
      within(dialog).getByRole('option', { name: labels.error }),
    );
    await waitFor(() => expect(failing.calls).toHaveLength(callsBefore + 1));
    failing.calls.at(-1)?.resolve({
      items: [
        {
          id: 'docs:participants',
          group: 'documentation',
          label: 'Managing participants',
          context: 'Studio',
          rank: { tier: 0, position: 0 },
          activate: { kind: 'external', href: 'https://example.org/docs' },
        },
      ],
    });

    await waitFor(() =>
      expect(
        within(dialog).getByRole('option', { name: /Managing participants/ }),
      ).toBeVisible(),
    );
    await expect(
      within(dialog).queryByRole('option', { name: labels.error }),
    ).toBeNull();
  },
};

const accentedDestinations: EverythingBarProvider = {
  id: 'destinations',
  local: true,
  persistence: 'never',
  items: () => [
    {
      id: 'catalan',
      group: 'go-to',
      label: 'Anàlisi de xarxes',
      rank: { tier: 0, position: 0 },
      activate: { kind: 'navigate', href: '/analisi' },
    },
    {
      id: 'panel',
      group: 'go-to',
      label: 'Community Recovery Panel 2027',
      rank: { tier: 0, position: 1 },
      activate: { kind: 'navigate', href: '/panel' },
    },
    {
      id: 'japanese',
      group: 'go-to',
      label: '参加者一覧',
      rank: { tier: 0, position: 2 },
      activate: { kind: 'navigate', href: '/sanka' },
    },
  ],
};

/**
 * Matching folds case and diacritics, understands initials, and maps the
 * highlight back onto the original label by index.
 */
export const Matching: Story = {
  beforeEach: () => {
    clearRecents();
  },
  render: ({ providers: _providers, ...args }) => (
    <Harness {...args} providers={[accentedDestinations]} />
  ),
  play: async ({ canvasElement }) => {
    const { dialog, input } = await openBar(canvasElement);

    await userEvent.type(input, 'analisi');
    await waitFor(() => expect(optionLabels(dialog)).toHaveLength(1));
    await expect(
      marksIn(within(dialog).getByRole('option', { name: /Anàlisi/ })),
    ).toEqual(['Anàlisi']);

    await userEvent.clear(input);
    await userEvent.type(input, 'crp');
    await waitFor(() => expect(optionLabels(dialog)).toHaveLength(1));
    await expect(
      marksIn(within(dialog).getByRole('option', { name: /Community/ })),
    ).toEqual(['C', 'R', 'P']);

    await userEvent.clear(input);
    await userEvent.type(input, '者一');
    await waitFor(() => expect(optionLabels(dialog)).toHaveLength(1));
    await expect(marksIn(within(dialog).getAllByRole('option')[0]!)).toEqual([
      '者一',
    ]);
  },
};

const sensitiveProvider: EverythingBarProvider = {
  id: 'participants',
  local: true,
  persistence: 'never',
  items: () => [
    {
      id: 'p_1',
      group: 'go-to',
      label: 'Participant 4821',
      context: 'Community Recovery Panel 2027',
      rank: { tier: 0, position: 9 },
      activate: { kind: 'navigate', href: '/study/st_42/participants/p_1' },
    },
  ],
};

/**
 * The empty query shows re-resolved recents above the current context, each
 * item exactly once, and nothing from a provider declaring
 * `persistence: 'never'` is written or rendered from the store.
 */
export const Recents: Story = {
  beforeEach: () => {
    window.localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify([
        { providerId: 'destinations', itemId: 'team:tm_7:activity' },
        { providerId: 'participants', itemId: 'p_1' },
        { providerId: 'destinations', itemId: 'study:st_99:deleted' },
      ]),
    );
    return () => clearRecents();
  },
  render: ({ providers: _providers, ...args }) => (
    <Harness
      {...args}
      // Every inventory row fits, so a duplicated recent would be VISIBLE
      // rather than hidden past the group's bound.
      groupBound={10}
      providers={[destinations, commands, sensitiveProvider]}
    />
  ),
  play: async ({ canvasElement }) => {
    const { dialog } = await openBar(canvasElement);

    const recents = await within(dialog).findByRole('group', {
      name: labels.recents,
    });
    await waitFor(() =>
      expect(
        within(recents).getByRole('option', { name: /Activity log/ }),
      ).toBeVisible(),
    );

    // A `never` provider cannot have a row rendered from the store, and an
    // entry its provider no longer resolves is pruned from it.
    await expect(
      within(recents).queryByRole('option', { name: /Participant 4821/ }),
    ).toBeNull();
    await waitFor(() =>
      expect(storedRecents()).toEqual([
        { providerId: 'destinations', itemId: 'team:tm_7:activity' },
        { providerId: 'participants', itemId: 'p_1' },
      ]),
    );

    // Deduplicated against the inventory section below it: rendered once in
    // the whole list, and not at all in the section it came from.
    await expect(
      within(dialog).getAllByRole('option', { name: /Activity log/ }),
    ).toHaveLength(1);
    const goTo = within(dialog).getByRole('group', {
      name: labels.groups['go-to'],
    });
    await expect(
      within(goTo).queryByRole('option', { name: /Activity log/ }),
    ).toBeNull();

    // Activating a `never` row leaves the store exactly as it was.
    await userEvent.click(
      within(goTo).getByRole('option', { name: /Participant 4821/ }),
    );
    await waitFor(() =>
      expect(
        within(document.body).queryByRole('dialog', { name: labels.dialog }),
      ).not.toBeInTheDocument(),
    );
    await expect(storedRecents()).toEqual([
      { providerId: 'destinations', itemId: 'team:tm_7:activity' },
      { providerId: 'participants', itemId: 'p_1' },
    ]);

    // Activating a `recents` row puts it at the front.
    const reopened = await openBar(canvasElement);
    await userEvent.click(
      await within(reopened.dialog).findByRole('option', {
        name: /Team members/,
      }),
    );
    await waitFor(() =>
      expect(storedRecents()[0]).toEqual({
        providerId: 'destinations',
        itemId: 'team:tm_7:members',
      }),
    );
  },
};

/**
 * An `open` activation reports the owning route and the surface identifier
 * that route's screen registers. The bar launches; the screen performs.
 */
export const OpenActivation: Story = {
  beforeEach: () => {
    clearRecents();
  },
  render: ({ providers: _providers, ...args }) => (
    <Harness {...args} providers={[commands]} />
  ),
  play: async ({ canvasElement }) => {
    const { input } = await openBar(canvasElement);
    await userEvent.type(input, 'invite');
    await userEvent.keyboard('{Enter}');

    await waitFor(() =>
      expect(
        within(canvasElement).getByTestId('surface-log'),
      ).toHaveTextContent('/team/tm_7/members#members.invite'),
    );
    await expect(
      within(canvasElement).getByTestId('activation-log').textContent,
    ).toContain('/team/tm_7/members');
  },
};
