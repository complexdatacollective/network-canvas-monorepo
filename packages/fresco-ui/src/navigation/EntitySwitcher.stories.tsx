import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '../storybook-support/awaitPassiveEffects';
import { EntitySwitcher, type EntitySwitcherItem } from './EntitySwitcher';

const teams: EntitySwitcherItem[] = [
  { id: 'team_5', name: 'SONIC Lab' },
  { id: 'team_2', name: 'Complex Data Collective' },
  { id: 'team_3', name: 'Adolescent Health Study Group' },
];

const studies: EntitySwitcherItem[] = [
  { id: 'study_1', name: 'Wave 1 pilot', meta: '12 interviews', badge: 'Live' },
  { id: 'study_2', name: 'Wave 2', meta: '0 interviews', badge: 'Draft' },
  { id: 'study_3', name: 'Methods comparison', meta: '84 interviews' },
];

const statusDot = (tone: string): ReactNode => (
  <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${tone}`} />
);

/**
 * A container-query context of a stated width. Not decoration: the trigger's
 * collapse resolves against its nearest container, so a story about collapse
 * has to say how wide that container is. In an app this is `SwitcherLockup`
 * or the panel the switcher sits in.
 */
const inContainer =
  (width: string): Decorator =>
  (Story) => (
    <div className="@container" style={{ width }}>
      <Story />
    </div>
  );

/**
 * The span the collapse query acts on — the kicker-over-name column, which
 * `sr-only` takes out of flow below 34rem of container width. Read through
 * the name rather than by class, because the class is the thing under test.
 */
function textColumn(root: HTMLElement): HTMLElement {
  const name = within(root).getAllByText(/SONIC Lab|Wave 1 pilot/)[0];
  const column = name?.parentElement;
  if (!(column instanceof HTMLElement)) {
    throw new Error('EntitySwitcher rendered no text column');
  }
  return column;
}

const documentation = `
The control a researcher uses to see which entity they are acting in, and to
move to a sibling of it. A team switcher and a study switcher are two
configurations of this, not two components.

\`\`\`tsx
import { EntitySwitcher } from '@codaco/fresco-ui/navigation/EntitySwitcher';

<EntitySwitcher
  kicker={t('team')}
  items={teams}
  currentId={teamId}
  onSelect={(id) => void navigate({ to: '/team/$teamId', params: { teamId: id } })}
  action={{ label: t('createTeam'), onSelect: openCreateTeam }}
/>
\`\`\`

| Prop | Purpose |
| --- | --- |
| \`kicker\` | The whole translated word above the name — "Team", "Study". A whole string, never assembled from fragments: it is half of the trigger's accessible name, and a template would bake English word order into every translation. It also labels the list's group. |
| \`items\` | The entity being acted in and its siblings. Each is \`{ id, name, meta?, badge?, leading? }\`. |
| \`currentId\` | The entity being acted in. \`undefined\`, or an id no item names, leaves the trigger showing \`placeholder\` and every option unselected. |
| \`onSelect\` | Called with the chosen id. Never called for the id already current. |
| \`placeholder\` | Stands in for the name when \`currentId\` names nothing — the host's translated "Choose a team". |
| \`status\` | \`ready\` (default), \`loading\` or \`failed\`. |
| \`onRetry\`, \`failureMessage\`, \`retryLabel\` | Required together, and required to make \`failed\` expressible at all: without a retry, the type rejects \`status="failed"\`. |
| \`action\` | A trailing command under the list — \`{ label, onSelect }\`. |
| \`renderMark\` | Replaces the default \`IdentityMark\` in both trigger and list — a status dot, an avatar, nothing. \`item.leading\` wins over it for a single item. |
| \`className\` | Merged onto the trigger. |

**A listbox, not a menu.** Choosing which sibling you are acting in is a
selection, not a command, so the popup is Base UI's \`Select\`: the trigger is a
\`combobox\`, the siblings are \`option\`s inside a \`listbox\`, and the current one
is \`aria-selected\`. That is also what makes **opening the switcher land on the
current entity** — \`Select\` opens with its selected item highlighted, which
\`Menu\` cannot do (it has no \`selectedIndex\`, and \`initialFocus\` is not one of
its props).

**The list stays a pure listbox.** The retry and the action are children of the
popup but NOT of the list, because a \`listbox\` may only contain options — a
command sitting among them would be announced as one more entity to switch to.
They are reachable from the list with a single Tab.

**The trigger's accessible name is the kicker qualifying the name** — "Team
SONIC Lab" — joined by the accessible-name algorithm over two \`aria-labelledby\`
references rather than by JavaScript. An \`aria-label\` would replace the visible
name instead of qualifying it, and a template would bake English word order in.
The two spans are inline, and text concatenation inserts a space only between
block-level children, which is why they are referenced by id.

**A list of one is a dead end.** With nothing to switch to, no command and no
failure to retry, the trigger renders inert: no caret, no list, and not in the
tab order.

**A failed list is not an empty one.** On \`failed\` the trigger stays exactly
where it was — it must never silently vanish — and the popup carries the failure
and its retry alongside any items already in hand.

**Loading reserves its space**, so the header does not reflow when the name
arrives.

**Collapse is a container query, not a breakpoint.** Below roughly 34rem of
*container* width the trigger keeps only its mark and caret. A switcher can sit
in a wide header or a narrow panel, and what decides whether the name fits is
the width it was given. Wrap it in \`SwitcherLockup\`, or in any \`@container\`.
`;

const meta = {
  title: 'Navigation/EntitySwitcher',
  component: EntitySwitcher,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: documentation } },
  },
  argTypes: {
    kicker: { control: 'text' },
    placeholder: { control: 'text' },
    status: {
      control: 'inline-radio',
      options: ['ready', 'loading', 'failed'],
    },
  },
  args: {
    kicker: 'Team',
    items: teams,
    currentId: 'team_5',
    onSelect: fn(),
    action: { label: 'Create a team', onSelect: fn() },
  },
  decorators: [inContainer('44rem')],
} satisfies Meta<typeof EntitySwitcher>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * Studies carry a second line and a status word. Neither is part of the
 * accessible name of the item, which stays the study's own name.
 */
export const WithMetaAndBadges: Story = {
  args: {
    kicker: 'Study',
    items: studies,
    currentId: 'study_1',
    action: { label: 'Create a study', onSelect: fn() },
  },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    await userEvent.click(within(canvasElement).getByRole('combobox'));
    const list = within(await within(document.body).findByRole('listbox'));
    await expect(
      list.getByRole('option', { name: /Wave 1 pilot/ }),
    ).toHaveTextContent('12 interviews');
  },
};

/**
 * A caller who would rather show state than identity supplies its own mark.
 * `renderMark` replaces the default `IdentityMark` everywhere; `item.leading`
 * overrides it for one item.
 */
export const StatusDotsInsteadOfMarks: Story = {
  args: {
    kicker: 'Study',
    currentId: 'study_1',
    items: [
      { ...studies[0]!, leading: statusDot('bg-success') },
      { ...studies[1]!, leading: statusDot('bg-warning') },
      { ...studies[2]!, leading: statusDot('bg-neutral') },
    ],
    action: undefined,
  },
};

/** No mark at all: `renderMark` may return nothing. */
export const WithoutMarks: Story = {
  args: { renderMark: () => null },
};

/**
 * Long names truncate in the trigger and nowhere else. The full name stays
 * readable in the list, and is on the trigger's `title`.
 */
export const LongNames: Story = {
  args: {
    currentId: 'team_long',
    items: [
      {
        id: 'team_long',
        name: 'Adolescent Health and Social Connectedness Longitudinal Study Group',
      },
      ...teams,
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('combobox');
    await expect(
      canvas.getByTitle(
        'Adolescent Health and Social Connectedness Longitudinal Study Group',
      ),
    ).toBeInTheDocument();

    await awaitPassiveEffects();
    await userEvent.click(trigger);
    const list = await within(document.body).findByRole('listbox');
    const item = within(list).getByRole('option', {
      name: /Adolescent Health and Social Connectedness/,
    });
    // Nothing in the list clips: no ellipsis, so the name is readable in full.
    await expect(item).not.toHaveClass('truncate');
    await expect(item.scrollWidth).toBeLessThanOrEqual(item.clientWidth + 1);
  },
};

/**
 * Below roughly 34rem of container width the trigger keeps only its mark and
 * its caret — and keeps its accessible name, because the collapsed text is
 * clipped rather than removed.
 */
export const NarrowContainer: Story = {
  decorators: [inContainer('20rem')],
  play: async ({ canvasElement }) => {
    // Clipped out of the layout by `sr-only`, so the trigger is down to its
    // mark and caret …
    await waitFor(() =>
      expect(getComputedStyle(textColumn(canvasElement)).position).toBe(
        'absolute',
      ),
    );
    // … and still named, which is the whole reason for clipping rather than
    // hiding it.
    await expect(
      within(canvasElement).getByRole('combobox'),
    ).toHaveAccessibleName('Team SONIC Lab');
  },
};

/** With room, the kicker and the name are both visible. */
export const WideContainer: Story = {
  decorators: [inContainer('72rem')],
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(getComputedStyle(textColumn(canvasElement)).position).toBe(
        'static',
      ),
    );
    await expect(
      within(canvasElement).getByRole('combobox'),
    ).toHaveAccessibleName('Team SONIC Lab');
  },
};

/**
 * The same switcher in two containers, so the collapse can be seen for what it
 * is: a response to the width it was GIVEN, with one viewport and one window
 * for both. A viewport breakpoint could not tell these two apart.
 */
export const CollapseIsAContainerQuery: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      <div
        data-testid="narrow"
        className="@container"
        style={{ width: '20rem' }}
      >
        <EntitySwitcher {...args} />
      </div>
      <div data-testid="wide" className="@container" style={{ width: '40rem' }}>
        <EntitySwitcher {...args} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const narrowBox = canvas.getByTestId('narrow');
    const wideBox = canvas.getByTestId('wide');

    // The same component, the same viewport, opposite collapse states.
    await waitFor(() =>
      expect(getComputedStyle(textColumn(narrowBox)).position).toBe('absolute'),
    );
    await expect(getComputedStyle(textColumn(wideBox)).position).toBe('static');

    const narrow = within(narrowBox).getByRole('combobox');
    const wide = within(wideBox).getByRole('combobox');
    await expect(narrow.getBoundingClientRect().width).toBeLessThan(
      wide.getBoundingClientRect().width,
    );
    // Neither loses its name in the process.
    await expect(narrow).toHaveAccessibleName('Team SONIC Lab');
    await expect(wide).toHaveAccessibleName('Team SONIC Lab');
  },
};

/**
 * The list has not arrived. The skeleton fills the same mark and name widths
 * the real values will, so the header does not jump when the query settles.
 */
export const Loading: Story = {
  args: {
    status: 'loading',
    items: [],
    currentId: undefined,
    action: undefined,
  },
};

/**
 * The list could not be read. The trigger REMAINS — a switcher that vanishes
 * on failure strands the researcher with no way back — and the popup carries
 * the failure and its retry.
 */
export const Failed: Story = {
  args: {
    status: 'failed',
    items: [],
    currentId: undefined,
    placeholder: 'Choose a team',
    onRetry: fn(),
    failureMessage: 'Your teams could not be loaded.',
    retryLabel: 'Try again',
    action: undefined,
  },
  play: async ({ args, canvasElement }) => {
    await awaitPassiveEffects();
    const trigger = within(canvasElement).getByRole('combobox');
    await expect(trigger).toBeInTheDocument();

    await userEvent.click(trigger);
    const body = within(document.body);
    const retry = await body.findByRole('button', { name: 'Try again' });
    await expect(
      body.getByText('Your teams could not be loaded.'),
    ).toBeInTheDocument();
    // Reaching the retry says what it is a retry FOR.
    await expect(retry).toHaveAccessibleDescription(
      'Your teams could not be loaded.',
    );

    await userEvent.click(retry);
    await waitFor(() => expect(args.onRetry).toHaveBeenCalledTimes(1));
  },
};

/**
 * A failure over a list already in hand. An errored list is not an empty one:
 * the teams that were read stay selectable while the retry sits under them —
 * and under, not among: the retry is not an option in the listbox.
 */
export const FailedWithStaleItems: Story = {
  args: {
    status: 'failed',
    onRetry: fn(),
    failureMessage: 'Your teams could not be refreshed.',
    retryLabel: 'Try again',
  },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    await userEvent.click(within(canvasElement).getByRole('combobox'));
    const list = within(await within(document.body).findByRole('listbox'));
    await expect(list.getAllByRole('option')).toHaveLength(teams.length);
    // The retry is in the popup but outside the list, so it is not an option.
    await expect(list.queryByRole('button', { name: 'Try again' })).toBeNull();
    await expect(
      within(document.body).getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  },
};

/**
 * One team, nothing to do with it: the trigger is a label, not a control. No
 * caret, no list, and no tab stop spent on a list that names only where the
 * researcher already is.
 */
export const SingleItem: Story = {
  args: {
    items: [teams[0]!],
    currentId: 'team_5',
    action: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('combobox')).toBeNull();
    await expect(canvas.queryByRole('button')).toBeNull();
    // The CARET specifically, not "any svg": the identity mark draws a
    // generated pattern, which is also an `<svg>`, so a bare tag query would
    // pass or fail on the mark rather than on what this story is about.
    await expect(canvasElement.querySelector('[data-caret]')).toBeNull();
    await expect(canvasElement.textContent).toContain('SONIC Lab');

    // And it is genuinely out of the tab order, not merely unstyled.
    await awaitPassiveEffects();
    await userEvent.tab();
    await expect(canvasElement.contains(document.activeElement)).toBe(false);
  },
};

/**
 * One team, but a command to run: the list is no longer a dead end, so the
 * trigger stays a control. Dropping the action here would be the worse bug —
 * a researcher in their only team could never make a second one.
 */
export const SingleItemWithAction: Story = {
  args: { items: [teams[0]!], currentId: 'team_5' },
  play: async ({ args, canvasElement }) => {
    await awaitPassiveEffects();
    await userEvent.click(within(canvasElement).getByRole('combobox'));
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole('button', { name: 'Create a team' }),
    );
    await waitFor(() => expect(args.action?.onSelect).toHaveBeenCalledTimes(1));
  },
};

/** No current entity: the placeholder names the gap, and nothing is selected. */
export const NoCurrentEntity: Story = {
  args: { currentId: undefined, placeholder: 'Choose a team' },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const trigger = within(canvasElement).getByRole('combobox');
    await expect(trigger).toHaveAccessibleName('Team Choose a team');

    await userEvent.click(trigger);
    const list = within(await within(document.body).findByRole('listbox'));
    for (const item of list.getAllByRole('option')) {
      await expect(item).toHaveAttribute('aria-selected', 'false');
    }
  },
};

/**
 * Exactly one option is selected, and it is the current one. This is the state
 * a screen reader reads; the tick beside it is the same fact drawn.
 *
 * `aria-selected`, not `aria-checked`: these are listbox options, and the
 * kicker labels the group they sit in, so a reader arriving in the list is
 * told what is being chosen between.
 */
export const SelectionSemantics: Story = {
  /*
    Room above the trigger, because the popup's placement is what this story
    also checks. Base UI abandons the overlapping `alignItemWithTrigger` mode
    on its own when the trigger is within 20px of the top of the viewport, so
    a switcher jammed against the top edge lands under its trigger either way
    and could not tell the two modes apart.
  */
  decorators: [
    (Story) => (
      <div style={{ paddingTop: '12rem' }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const trigger = within(canvasElement).getByRole('combobox');
    await userEvent.click(trigger);
    const listbox = await within(document.body).findByRole('listbox');
    const list = within(listbox);

    /*
      The popup sits UNDER the trigger rather than over it. Base UI's default
      for a select overlaps the trigger so the selected item's text lands on
      the trigger's value text — right for a form field in a column of
      fields, wrong for a switcher that would then cover its own header.
    */
    const popup = listbox.parentElement!;
    await waitFor(() =>
      expect(popup.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        trigger.getBoundingClientRect().bottom,
      ),
    );

    const selected = list.getAllByRole('option', { selected: true });
    await expect(selected).toHaveLength(1);
    await expect(selected[0]).toHaveTextContent('SONIC Lab');
    await expect(selected[0]).toHaveAttribute('aria-selected', 'true');
    await expect(list.getAllByRole('option')).toHaveLength(teams.length);

    // The group carries the kicker, so the options are announced as teams.
    await expect(list.getByRole('group')).toHaveAccessibleName('Team');
  },
};

/**
 * Opening with the keyboard lands on the entity being acted in — the whole
 * reason this is a `Select` and not a `Menu`. The arrow keys move between
 * siblings from there, and Escape closes the list and hands focus back to the
 * trigger.
 *
 * The current entity is deliberately the SECOND item, because that is the only
 * arrangement in which "opens on the current one" and "opens on the first one"
 * can be told apart. The previous `Menu` implementation did the latter: it has
 * no `selectedIndex` and no `initialFocus`, so the reader always started at
 * the top of the list and had to walk down to where they already were.
 */
export const KeyboardNavigation: Story = {
  args: { currentId: 'team_2' },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('combobox');
    await awaitPassiveEffects();

    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');

    const listbox = await within(document.body).findByRole('listbox');
    const items = within(listbox).getAllByRole('option');

    // The current entity, not the first one.
    await waitFor(() => expect(items[1]).toHaveFocus());
    await expect(items[1]).toHaveAttribute('aria-selected', 'true');
    await expect(items[0]).not.toHaveFocus();

    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(items[2]).toHaveFocus());
    await expect(items[2]).toHaveAttribute('aria-selected', 'false');

    await userEvent.keyboard('{ArrowUp}');
    await waitFor(() => expect(items[1]).toHaveFocus());

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(within(document.body).queryByRole('listbox')).toBeNull(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/**
 * The action lives in the popup but OUTSIDE the listbox, which is the only
 * place a command can go without being announced as one more entity to switch
 * to. That only works if a keyboard can still reach it: Base UI manages focus
 * inside the list, and a Tab that escaped the popup instead of landing on the
 * action would leave the command mouse-only.
 *
 * So this operates it entirely by keyboard — open, Tab out of the list, Enter
 * — and checks that the popup closes and focus comes back to the trigger, the
 * same way it does after choosing a sibling.
 */
export const ActionReachableByKeyboard: Story = {
  play: async ({ args, canvasElement }) => {
    const trigger = within(canvasElement).getByRole('combobox');
    await awaitPassiveEffects();

    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    await within(document.body).findByRole('listbox');

    // One Tab out of the list: the roving tabindex leaves exactly one tabbable
    // option, so the next tab stop is the action itself.
    await userEvent.tab();
    const create = within(document.body).getByRole('button', {
      name: 'Create a team',
    });
    await waitFor(() => expect(create).toHaveFocus());

    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(args.action?.onSelect).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(within(document.body).queryByRole('listbox')).toBeNull(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    // Running a command is not switching entity.
    await expect(args.onSelect).not.toHaveBeenCalled();
  },
};

/**
 * Choosing a sibling reports it. Choosing the entity already current does
 * not: re-selecting where you already are is not a switch, and in a
 * router-driven host it would be a redundant navigation.
 */
export const SelectingSiblings: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(canvas.getByRole('combobox'));
    let list = within(await within(document.body).findByRole('listbox'));
    await userEvent.click(list.getByRole('option', { name: /SONIC Lab/ }));
    await waitFor(() =>
      expect(within(document.body).queryByRole('listbox')).toBeNull(),
    );
    await expect(args.onSelect).not.toHaveBeenCalled();

    await userEvent.click(canvas.getByRole('combobox'));
    list = within(await within(document.body).findByRole('listbox'));
    await userEvent.click(
      list.getByRole('option', { name: /Complex Data Collective/ }),
    );
    await waitFor(() => expect(args.onSelect).toHaveBeenCalledWith('team_2'));
    await expect(args.onSelect).toHaveBeenCalledTimes(1);
  },
};
