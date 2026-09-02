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
| \`kicker\` | The whole translated word above the name — "Team", "Study". A whole string, never assembled from fragments: it is half of the trigger's accessible name, and a template would bake English word order into every translation. |
| \`items\` | The entity being acted in and its siblings. Each is \`{ id, name, meta?, badge?, leading? }\`. |
| \`currentId\` | The entity being acted in. \`undefined\`, or an id no item names, leaves the trigger showing \`placeholder\` and every menu item unchecked. |
| \`onSelect\` | Called with the chosen id. Never called for the id already current. |
| \`placeholder\` | Stands in for the name when \`currentId\` names nothing — the host's translated "Choose a team". |
| \`status\` | \`ready\` (default), \`loading\` or \`failed\`. |
| \`onRetry\`, \`failureMessage\`, \`retryLabel\` | Required together, and required to make \`failed\` expressible at all: without a retry, the type rejects \`status="failed"\`. |
| \`action\` | A trailing command under the list — \`{ label, onSelect }\`. |
| \`renderMark\` | Replaces the default \`IdentityMark\` in both trigger and menu — a status dot, an avatar, nothing. \`item.leading\` wins over it for a single item. |
| \`className\` | Merged onto the trigger. |

**Radio semantics.** Menu items are \`menuitemradio\`: exactly one sibling is
the one being acted in, and that reaches a screen reader without depending on
seeing a tick. Selecting the entity already current is a no-op.

**The trigger's accessible name is the kicker qualifying the name** — "Team
SONIC Lab" — joined by the accessible-name algorithm over two \`aria-labelledby\`
references rather than by JavaScript. An \`aria-label\` would replace the visible
name instead of qualifying it, and a template would bake English word order in.
The two spans are inline, and text concatenation inserts a space only between
block-level children, which is why they are referenced by id.

**A menu of one is a dead end.** With nothing to switch to, no command and no
failure to retry, the trigger renders inert: no caret, no menu, and not in the
tab order.

**A failed list is not an empty one.** On \`failed\` the trigger stays exactly
where it was — it must never silently vanish — and the menu carries the failure
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
    await userEvent.click(within(canvasElement).getByRole('button'));
    const menu = within(await within(document.body).findByRole('menu'));
    await expect(
      menu.getByRole('menuitemradio', { name: /Wave 1 pilot/ }),
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
 * readable in the menu, and is on the trigger's `title`.
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
    const trigger = canvas.getByRole('button');
    await expect(
      canvas.getByTitle(
        'Adolescent Health and Social Connectedness Longitudinal Study Group',
      ),
    ).toBeInTheDocument();

    await awaitPassiveEffects();
    await userEvent.click(trigger);
    const menu = await within(document.body).findByRole('menu');
    const item = within(menu).getByRole('menuitemradio', {
      name: /Adolescent Health and Social Connectedness/,
    });
    // Nothing in the menu clips: no ellipsis, so the name is readable in full.
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
      within(canvasElement).getByRole('button'),
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
      within(canvasElement).getByRole('button'),
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

    const narrow = within(narrowBox).getByRole('button');
    const wide = within(wideBox).getByRole('button');
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
 * on failure strands the researcher with no way back — and the menu carries
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
    const trigger = within(canvasElement).getByRole('button');
    await expect(trigger).toBeInTheDocument();

    await userEvent.click(trigger);
    const menu = within(await within(document.body).findByRole('menu'));
    await expect(
      menu.getByText('Your teams could not be loaded.'),
    ).toBeInTheDocument();

    await userEvent.click(menu.getByRole('menuitem', { name: 'Try again' }));
    await waitFor(() => expect(args.onRetry).toHaveBeenCalledTimes(1));
  },
};

/**
 * A failure over a list already in hand. An errored list is not an empty one:
 * the teams that were read stay selectable while the retry sits under them.
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
    await userEvent.click(within(canvasElement).getByRole('button'));
    const menu = within(await within(document.body).findByRole('menu'));
    await expect(menu.getAllByRole('menuitemradio')).toHaveLength(teams.length);
    await expect(
      menu.getByRole('menuitem', { name: 'Try again' }),
    ).toBeInTheDocument();
  },
};

/**
 * One team, nothing to do with it: the trigger is a label, not a control. No
 * caret, no menu, and no tab stop spent on a menu that names only where the
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
    await expect(canvas.queryByRole('button')).toBeNull();
    await expect(canvasElement.querySelector('svg')).toBeNull();
    await expect(canvasElement.textContent).toContain('SONIC Lab');

    // And it is genuinely out of the tab order, not merely unstyled.
    await awaitPassiveEffects();
    await userEvent.tab();
    await expect(canvasElement.contains(document.activeElement)).toBe(false);
  },
};

/**
 * One team, but a command to run: the menu is no longer a dead end, so the
 * trigger stays a control. Dropping the action here would be the worse bug —
 * a researcher in their only team could never make a second one.
 */
export const SingleItemWithAction: Story = {
  args: { items: [teams[0]!], currentId: 'team_5' },
  play: async ({ args, canvasElement }) => {
    await awaitPassiveEffects();
    await userEvent.click(within(canvasElement).getByRole('button'));
    const menu = within(await within(document.body).findByRole('menu'));
    await userEvent.click(
      menu.getByRole('menuitem', { name: 'Create a team' }),
    );
    await waitFor(() => expect(args.action?.onSelect).toHaveBeenCalledTimes(1));
  },
};

/** No current entity: the placeholder names the gap, and nothing is checked. */
export const NoCurrentEntity: Story = {
  args: { currentId: undefined, placeholder: 'Choose a team' },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const trigger = within(canvasElement).getByRole('button');
    await expect(trigger).toHaveAccessibleName('Team Choose a team');

    await userEvent.click(trigger);
    const menu = within(await within(document.body).findByRole('menu'));
    for (const item of menu.getAllByRole('menuitemradio')) {
      await expect(item).toHaveAttribute('aria-checked', 'false');
    }
  },
};

/**
 * Exactly one item is checked, and it is the current one. This is the state a
 * screen reader reads; the tick beside it is the same fact drawn.
 */
export const RadioSemantics: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    await userEvent.click(within(canvasElement).getByRole('button'));
    const menu = within(await within(document.body).findByRole('menu'));

    const checked = menu.getAllByRole('menuitemradio', { checked: true });
    await expect(checked).toHaveLength(1);
    await expect(checked[0]).toHaveTextContent('SONIC Lab');
    await expect(menu.getAllByRole('menuitemradio')).toHaveLength(teams.length);
  },
};

/**
 * Opening with the keyboard puts focus inside the menu, the arrow keys move
 * between siblings, and Escape closes it and hands focus back to the trigger.
 *
 * The current entity is deliberately the SECOND item here, because that is
 * the only arrangement in which the two candidate landing spots differ.
 * Base UI's `Menu` highlights the first item on open: unlike `Select`, it
 * takes no `selectedIndex`, and there is no way to ask its list navigation to
 * start on the checked radio item. Moving focus by hand after open would mean
 * running our own focus management alongside Base UI's, which is how the two
 * come to disagree. So this pins the behaviour that exists — the checked item
 * is still announced as checked when the reader arrives at it.
 */
export const KeyboardNavigation: Story = {
  args: { currentId: 'team_2' },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button');
    await awaitPassiveEffects();

    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');

    const menu = await within(document.body).findByRole('menu');
    const items = within(menu).getAllByRole('menuitemradio');
    await waitFor(() => expect(items[0]).toHaveFocus());
    await expect(items[0]).toHaveAttribute('aria-checked', 'false');

    // Down to the entity actually being acted in, which announces as checked.
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(items[1]).toHaveFocus());
    await expect(items[1]).toHaveAttribute('aria-checked', 'true');

    await userEvent.keyboard('{ArrowUp}');
    await waitFor(() => expect(items[0]).toHaveFocus());

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(within(document.body).queryByRole('menu')).toBeNull(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
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

    await userEvent.click(canvas.getByRole('button'));
    let menu = within(await within(document.body).findByRole('menu'));
    await userEvent.click(
      menu.getByRole('menuitemradio', { name: /SONIC Lab/ }),
    );
    await waitFor(() =>
      expect(within(document.body).queryByRole('menu')).toBeNull(),
    );
    await expect(args.onSelect).not.toHaveBeenCalled();

    await userEvent.click(canvas.getByRole('button'));
    menu = within(await within(document.body).findByRole('menu'));
    await userEvent.click(
      menu.getByRole('menuitemradio', { name: /Complex Data Collective/ }),
    );
    await waitFor(() => expect(args.onSelect).toHaveBeenCalledWith('team_2'));
    await expect(args.onSelect).toHaveBeenCalledTimes(1);
  },
};
