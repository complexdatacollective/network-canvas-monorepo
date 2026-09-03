import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import {
  TeamAndStudySwitcher,
  type SwitcherItem,
  type SwitcherSegment,
} from './TeamAndStudySwitcher';

/**
 * A study's status, as the pip beside its name. Unexported: a non-story export
 * in a stories file becomes an invalid auto-story.
 *
 * `aria-hidden`, and every row carrying one also carries the status word in its
 * supporting line, so the colour never carries the meaning alone.
 */
function StatusPip({ tone }: { tone: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${tone}`}
    />
  );
}

const teams: SwitcherItem[] = [
  { id: 'team_5', name: 'SONIC Lab', meta: '12 studies', badge: 'Owner' },
  {
    id: 'team_2',
    name: 'Complex Data Collective',
    meta: '4 studies',
    badge: 'Admin',
  },
  {
    id: 'team_3',
    name: 'Adolescent Health Study Group',
    meta: '1 study',
    badge: 'Member',
  },
];

const studies: SwitcherItem[] = [
  {
    id: 'study_1',
    name: 'Wave 1 pilot',
    meta: 'Collecting · 12 interviews',
    leading: <StatusPip tone="bg-success" />,
  },
  {
    id: 'study_2',
    name: 'Wave 2',
    meta: 'Draft · no interviews yet',
    leading: <StatusPip tone="bg-input-contrast/40" />,
  },
  {
    id: 'study_3',
    name: 'Baseline survey',
    meta: 'Closed · 302 interviews',
    leading: <StatusPip tone="bg-warning" />,
  },
];

const teamSegment = (): SwitcherSegment => ({
  kicker: 'Team',
  items: teams,
  currentId: 'team_5',
  onSelect: fn(),
  action: { label: 'Create a team', onSelect: fn() },
});

const studySegment = (): SwitcherSegment => ({
  kicker: 'Study',
  items: studies,
  currentId: 'study_1',
  onSelect: fn(),
  action: { label: 'New study in this team', onSelect: fn() },
});

/** The frame that borders the segments — the segments' own parent. */
function frameOf(canvasElement: HTMLElement): HTMLElement {
  const trigger = within(canvasElement).getAllByRole('combobox')[0];
  const frame = trigger?.parentElement;
  if (!(frame instanceof HTMLElement)) {
    throw new Error('the switcher rendered no frame');
  }
  return frame;
}

/** How many segments are drawn, as a reader would count them. */
function segmentCount(canvasElement: HTMLElement): number {
  return frameOf(canvasElement).querySelectorAll('[data-switcher-segment]')
    .length;
}

const meta = {
  title: 'Navigation/TeamAndStudySwitcher',
  component: TeamAndStudySwitcher,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'Where a researcher is, and how they move: the team whose work is on',
          'screen and the study open inside it, as one control.',
          '',
          '```tsx',
          "import { TeamAndStudySwitcher } from '@codaco/fresco-ui/navigation/TeamAndStudySwitcher';",
          '',
          '<TeamAndStudySwitcher',
          "  team={{ kicker: t('team'), items: teams, currentId: teamId, onSelect: goToTeam }}",
          "  study={study && { kicker: t('study'), items: studies, currentId: study.id, onSelect: openStudy }}",
          '/>',
          '```',
          '',
          '- **`team` / `study`** — each a segment: `kicker`, `items`,',
          '  `currentId`, `onSelect`, and optionally `placeholder`, `action`,',
          '  `status` (+ `onRetry`, `failureMessage`, `retryLabel`) and',
          '  `renderMark`. Omit `study` and the control draws as one',
          '  segment, with no divider and no empty compartment.',
          '- **`items`** — `{ id, name, meta?, badge?, leading? }`. `leading`',
          '  replaces the identity mark for one item; `renderMark` replaces it',
          '  for the whole segment.',
          '- **`className`** — merged onto the outer element, which is the',
          '  `@container` the collapse resolves against. Give it a width it',
          '  does not derive from its contents.',
          '',
          'A listbox, not a menu: opening lands on the entity you are already',
          'in. The trailing command and the failure retry sit in the popup but',
          'outside the listbox, so the list holds only options.',
        ].join('\n'),
      },
    },
  },
  args: {
    team: teamSegment(),
    study: studySegment(),
  },
} satisfies Meta<typeof TeamAndStudySwitcher>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(segmentCount(canvasElement)).toBe(2);
  },
};

/**
 * No study open. The second segment is absent rather than empty, so the
 * control shrinks to one and draws no divider.
 */
export const TeamOnly: Story = {
  args: { study: undefined },
  play: async ({ canvasElement }) => {
    await expect(segmentCount(canvasElement)).toBe(1);
    await expect(
      within(canvasElement).queryByRole('combobox', { name: /^Study/ }),
    ).toBeNull();
  },
};

/**
 * The segments paint their surfaces into a frame that clips, so a hovered or
 * open segment meets the border on every edge. Both segments fill the frame's
 * full height even though one holds a 32px mark and the other a status pip.
 */
export const SegmentsFillTheFrame: Story = {
  play: async ({ canvasElement }) => {
    const frame = frameOf(canvasElement);
    const segments = [
      ...frame.querySelectorAll<HTMLElement>('[data-switcher-segment]'),
    ];
    await expect(segments).toHaveLength(2);

    const frameBox = frame.getBoundingClientRect();
    for (const segment of segments) {
      const box = segment.getBoundingClientRect();
      // Within the frame's own 1px border, top and bottom. A centred segment
      // used to leave a sub-pixel gap here, which showed as a thin line
      // between its surface and the border.
      await expect(box.top - frameBox.top).toBeLessThanOrEqual(1.5);
      await expect(frameBox.bottom - box.bottom).toBeLessThanOrEqual(1.5);
    }

    // And the segments carry no radius of their own: the frame decides where
    // the corners are, which is what keeps a painted surface flush with it.
    for (const segment of segments) {
      await expect(getComputedStyle(segment).borderRadius).toBe('0px');
    }
  },
};

/** Opening lands on the entity you are already in, not on the first. */
export const OpensOnTheCurrentEntity: Story = {
  args: { team: { ...teamSegment(), currentId: 'team_2' } },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('combobox', {
      name: /^Team/,
    });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');

    const listbox = await within(document.body).findByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    // The current team is second, so landing on it cannot be mistaken for
    // landing on the first item.
    await waitFor(() => expect(options[1]).toHaveFocus());
    await expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await expect(options[0]).not.toHaveFocus();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** Exactly one entity is selected, and the group is named by the kicker. */
export const SelectionSemantics: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('combobox', { name: /^Team/ }),
    );
    const listbox = await within(document.body).findByRole('listbox');
    const selected = within(listbox)
      .getAllByRole('option')
      .filter((o) => o.getAttribute('aria-selected') === 'true');
    await expect(selected).toHaveLength(1);
    await expect(
      within(document.body).getByRole('group', { name: 'Team' }),
    ).toBeInTheDocument();
  },
};

/** Choosing a sibling reports it; choosing the current entity reports nothing. */
export const SelectingSiblings: Story = {
  play: async ({ args, canvasElement }) => {
    const onSelect = args.team?.onSelect;
    await userEvent.click(
      within(canvasElement).getByRole('combobox', { name: /^Team/ }),
    );
    let listbox = await within(document.body).findByRole('listbox');

    await userEvent.click(
      within(listbox).getByRole('option', { name: /^SONIC Lab/ }),
    );
    await expect(onSelect).not.toHaveBeenCalled();

    await userEvent.click(
      within(canvasElement).getByRole('combobox', { name: /^Team/ }),
    );
    listbox = await within(document.body).findByRole('listbox');
    await userEvent.click(
      within(listbox).getByRole('option', { name: /^Complex Data Collective/ }),
    );
    await expect(onSelect).toHaveBeenCalledWith('team_2');
    await expect(onSelect).toHaveBeenCalledTimes(1);
  },
};

/**
 * The trailing command sits in the popup but outside the listbox, so the list
 * holds only options — and is still reachable: one Tab from the open list.
 */
export const ActionReachableByKeyboard: Story = {
  play: async ({ args, canvasElement }) => {
    const trigger = within(canvasElement).getByRole('combobox', {
      name: /^Team/,
    });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    const listbox = await within(document.body).findByRole('listbox');

    // Not among the options.
    await expect(
      within(listbox).queryByRole('button', { name: 'Create a team' }),
    ).toBeNull();

    await userEvent.tab();
    const action = within(document.body).getByRole('button', {
      name: 'Create a team',
    });
    await waitFor(() => expect(action).toHaveFocus());

    await userEvent.keyboard('{Enter}');
    await expect(args.team?.action?.onSelect).toHaveBeenCalledTimes(1);
    await expect(args.team?.onSelect).not.toHaveBeenCalled();
  },
};

/** A failed list keeps its segment and offers a way out of the failure. */
export const Failed: Story = {
  args: {
    team: {
      ...teamSegment(),
      items: [],
      status: 'failed',
      onRetry: fn(),
      failureMessage: 'Your teams could not be loaded.',
      retryLabel: 'Try again',
    },
  },
  play: async ({ args, canvasElement }) => {
    // The segment must never silently vanish: that strands the researcher.
    const trigger = within(canvasElement).getByRole('combobox', {
      name: /^Team/,
    });
    await userEvent.click(trigger);

    const retry = await within(document.body).findByRole('button', {
      name: 'Try again',
    });
    await expect(retry).toHaveAccessibleDescription(
      'Your teams could not be loaded.',
    );
    await userEvent.click(retry);
    await expect(args.team?.onRetry).toHaveBeenCalledTimes(1);
  },
};

/** A list that failed while an earlier one is still in hand keeps showing it. */
export const FailedWithStaleItems: Story = {
  args: {
    team: {
      ...teamSegment(),
      status: 'failed',
      onRetry: fn(),
      failureMessage: 'Your teams could not be loaded.',
      retryLabel: 'Try again',
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('combobox', { name: /^Team/ }),
    );
    const listbox = await within(document.body).findByRole('listbox');
    await expect(within(listbox).getAllByRole('option')).toHaveLength(3);
    // The retry is in the popup, never among the options.
    await expect(
      within(listbox).queryByRole('button', { name: 'Try again' }),
    ).toBeNull();
    await expect(
      within(document.body).getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  },
};

/** Nothing to switch to and no command: the segment is a label, not a control. */
export const SingleItem: Story = {
  args: {
    team: {
      kicker: 'Team',
      items: [teams[0]!],
      currentId: 'team_5',
      onSelect: fn(),
    },
    study: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('combobox')).toBeNull();
    await expect(canvas.queryByRole('button')).toBeNull();
    // The caret specifically: it is what tells a reader there is a list.
    await expect(canvasElement.querySelector('[data-caret]')).toBeNull();
    // The team is still named.
    await expect(canvasElement.textContent).toContain('SONIC Lab');
  },
};

/** One team, but a command to make another: still worth opening. */
export const SingleItemWithAction: Story = {
  args: {
    team: {
      ...teamSegment(),
      items: [teams[0]!],
      action: { label: 'Create a team', onSelect: fn() },
    },
    study: undefined,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('combobox', { name: /^Team/ }),
    ).toBeInTheDocument();
  },
};

/** The name has not arrived. The skeleton reserves the space it will take. */
export const Loading: Story = {
  args: { team: { ...teamSegment(), items: [], status: 'loading' } },
};

/** No entity is current: the placeholder stands in, and nothing is selected. */
export const NoCurrentEntity: Story = {
  args: {
    team: {
      ...teamSegment(),
      currentId: undefined,
      placeholder: 'Choose a team',
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toContain('Choose a team');
  },
};

/**
 * The accessible name is one interpolated message, so a locale can put the
 * entity type after the name. English wants "Team SONIC Lab"; Japanese wants
 * the equivalent of "SONIC Lab team", which two separately translated strings
 * joined by this component could never produce.
 */
export const LocalisedAccessibleName: Story = {
  args: {
    team: {
      ...teamSegment(),
      kicker: 'チーム',
      accessibleName: (name) => `${name} チーム`,
    },
    study: undefined,
  },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('combobox');
    // Name first, type second — the order the message chose, not the order the
    // component would have imposed.
    await expect(trigger).toHaveAccessibleName('SONIC Lab チーム');
    // And it still contains what is on screen, so speech input can reach it.
    await expect(trigger.textContent).toContain('SONIC Lab');
  },
};

/** With no `accessibleName`, the name is the kicker and the entity, as before. */
export const DefaultAccessibleName: Story = {
  args: { study: undefined },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('combobox'),
    ).toHaveAccessibleName('Team SONIC Lab');
  },
};

/** While the name is still loading, the label is the type alone. */
export const LoadingAccessibleName: Story = {
  args: {
    team: {
      ...teamSegment(),
      items: [],
      status: 'loading',
      accessibleName: (name) => `${name} チーム`,
    },
    study: undefined,
  },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('combobox');
    await expect(trigger).toHaveAccessibleName('Team');
    await expect(trigger).toHaveAttribute('aria-busy', 'true');
  },
};

/** Long names truncate in the segment and are readable in full in the list. */
export const LongNames: Story = {
  args: {
    team: {
      ...teamSegment(),
      items: [
        {
          id: 'team_5',
          name: 'Northwestern Social Networks and Health Innovations Laboratory',
          meta: '12 studies',
          badge: 'Owner',
        },
        ...teams.slice(1),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const name = within(canvasElement).getByTitle(
      'Northwestern Social Networks and Health Innovations Laboratory',
    );
    await expect(name).toHaveClass('truncate');
  },
};

/**
 * The collapse is a CONTAINER query, so it follows the width the control was
 * given rather than the viewport's.
 */
export const NarrowContainer: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '22rem' }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('combobox', {
      name: /^Team/,
    });
    // The name is clipped out of the layout but stays in the accessible name.
    await expect(trigger).toHaveAccessibleName('Team SONIC Lab');
    const column = within(canvasElement).getByText('SONIC Lab').parentElement;
    await expect(getComputedStyle(column!).position).toBe('absolute');
  },
};

/** Wide enough for both names, for contrast with the narrow case. */
export const WideContainer: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '60rem' }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const column = within(canvasElement).getByText('SONIC Lab').parentElement;
    await expect(getComputedStyle(column!).position).not.toBe('absolute');
  },
};
