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
          '  `status` and `renderMark`. Omit `study` and the control draws as one',
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
    // The frame's OWN border width, not a fixed figure: a segment sits inside
    // it, so that is exactly how far its edge may be from the frame's.
    const inset = parseFloat(getComputedStyle(frame).borderTopWidth) + 0.5;
    for (const segment of segments) {
      const box = segment.getBoundingClientRect();
      /*
        Bounded in BOTH directions. An upper bound alone passes for a segment
        that spills OUT of the frame — a top edge 5px above it gives -5, which
        is happily "at most 1.5" — so the story would have stayed green
        through the overflow it exists to catch. Nonnegative says the segment
        is inside the frame; at most the border width says it reaches it.
      */
      const top = box.top - frameBox.top;
      const bottom = frameBox.bottom - box.bottom;
      await expect(top).toBeGreaterThanOrEqual(0);
      await expect(bottom).toBeGreaterThanOrEqual(0);
      await expect(top).toBeLessThanOrEqual(inset);
      await expect(bottom).toBeLessThanOrEqual(inset);
    }

    // A segment's curve is the frame's LESS its border, which is what makes
    // the two concentric. A larger radius cuts more away at a corner, so a
    // segment carrying the frame's OWN radius falls short of the frame's inner
    // curve and lets the page show through between the fill and the border.
    // Squaring it off is wrong too: the focus outline traces the element's own
    // radius and would ring square inside a rounded frame.
    const frameStyle = getComputedStyle(frame);
    const outer = parseFloat(frameStyle.borderTopLeftRadius);
    const expected = `${outer - parseFloat(frameStyle.borderTopWidth)}px`;
    // Comparing computed radii would pass if everything were `0px`, which is
    // what a render with no theme loaded gives. The frame having a curve at
    // all is what makes the comparison below mean anything.
    await expect(outer).toBeGreaterThan(0);

    const [first, last] = [segments[0]!, segments[segments.length - 1]!];
    await expect(getComputedStyle(first).borderTopLeftRadius).toBe(expected);
    await expect(getComputedStyle(last).borderTopRightRadius).toBe(expected);
    // And square where they meet, so the divider is a straight rule.
    await expect(getComputedStyle(first).borderTopRightRadius).toBe('0px');
    await expect(getComputedStyle(last).borderTopLeftRadius).toBe('0px');
  },
};

/**
 * The segments follow the THEME's radius, not the default theme's.
 *
 * `--radius` is declared once at `:root` as `var(--radius-base, …)`, so it is
 * substituted there and inherits as the default theme's value everywhere. Only
 * the bare `rounded-*` utilities read `--radius-base`, which is what a theme
 * actually sets. Reading the variable directly — `rounded-[var(--radius)]` —
 * therefore pins a segment to 28px while the frame around it follows its theme
 * to 14px, and the fill reads as visibly rounder than the frame.
 *
 * Pinned to the studio theme because the default theme cannot show it: there
 * the frozen value and the theme's value are the same number, so a story
 * running in it passes either way.
 */
export const SegmentsFollowTheThemeRadius: Story = {
  globals: { theme: 'studio' },
  play: async ({ canvasElement }) => {
    const frame = frameOf(canvasElement);
    const segments = [
      ...frame.querySelectorAll<HTMLElement>('[data-switcher-segment]'),
    ];
    const frameRadius = getComputedStyle(frame).borderTopLeftRadius;

    // The theme is what makes this story meaningful. `--radius-base` is set on
    // the body by the theme switcher, and if it had not applied, the value
    // below would be the default theme's and the comparison would prove
    // nothing.
    const base = getComputedStyle(document.body)
      .getPropertyValue('--radius-base')
      .trim();
    await expect(base).toBe('0.875rem');
    await expect(frameRadius).toBe('14px');

    // 14px less the frame's 2px border. What matters is that it followed the
    // theme at all: reading `--radius` pinned this at 28px.
    await expect(getComputedStyle(segments[0]!).borderTopLeftRadius).toBe(
      '12px',
    );
    await expect(
      getComputedStyle(segments[segments.length - 1]!).borderTopRightRadius,
    ).toBe('12px');
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

    // The popup being in the document is not the same as focus having moved
    // into it: Base UI does that in an effect after the mount. Tab in that
    // window still has the TRIGGER as its origin, so it leaves the switcher
    // altogether and the assertion below fails for a reason the story is not
    // about.
    await waitFor(() => expect(trigger).not.toHaveFocus());
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

/**
 * A segment with no mark keeps its words at every width.
 *
 * The column collapses to the identity mark, which stands in for the name —
 * but a `currentId` naming nothing in `items` has no mark to collapse to.
 * Collapsing anyway would leave a bare chevron on a control still worth
 * opening, with nothing on it to say what it switches.
 */
export const NoMarkStaysVisibleWhenNarrow: Story = {
  args: {
    team: {
      ...teamSegment(),
      currentId: undefined,
      placeholder: 'Choose a team',
    },
    study: undefined,
  },
  decorators: [
    (Story) => (
      <div style={{ width: '22rem' }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    // Narrow enough that a segment WITH a mark would have collapsed — see
    // `NarrowContainer`, which asserts exactly that at this width.
    const column =
      within(canvasElement).getByText('Choose a team').parentElement;
    await expect(getComputedStyle(column!).position).not.toBe('absolute');
  },
};

/**
 * The supporting line keeps full strength on the selected row.
 *
 * Dimmed, it composites toward `--selected` and falls to 2.90:1 against it —
 * below 4.5:1, and 90% opacity only reaches 4.19:1. Elsewhere 70% is 5.19:1,
 * which is worth keeping for the hierarchy.
 */
export const SelectedMetadataKeepsItsContrast: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('combobox', { name: /^Team/ }),
    );
    const listbox = await within(document.body).findByRole('listbox');
    const rows = within(listbox)
      .getAllByRole('option')
      .map((option) => ({
        selected: option.getAttribute('aria-selected') === 'true',
        // `[data-meta]`, not a class query: the identity mark is `text-xs` too.
        meta: option.querySelector('[data-meta]'),
      }));

    for (const row of rows) {
      if (!row.meta) continue;
      const opacity = getComputedStyle(row.meta).opacity;
      await expect(opacity).toBe(row.selected ? '1' : '0.7');
    }
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

/**
 * A long name is shown whole. The shell spec is explicit that the header sizes
 * to its content and must not clip or truncate a label — translated names run
 * about a third longer, and a truncated name is the thing the researcher came
 * to the header to read.
 */
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
    study: undefined,
  },
  play: async ({ canvasElement }) => {
    const name = within(canvasElement).getByText(
      'Northwestern Social Networks and Health Innovations Laboratory',
    );

    // Given room, the whole name is shown: nothing here caps its width, so a
    // name is only ever cut by a container too small for it.
    await expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth + 1);
  },
};

/**
 * Both names give way by the character before either gives way entirely.
 *
 * Three widths, and the same two names in each. At `72rem` both are whole. At
 * `38rem` — still above the container's `xl` collapse threshold, so the words
 * are still on screen — neither fits, and each is cut with an ellipsis that
 * keeps the beginning of a name, the part that distinguishes it. At `20rem`
 * the threshold has passed, the words leave the layout altogether and the
 * marks stand in for them: an ellipsis over a character or two says less than
 * a mark does.
 */
export const TruncatesAsTheContainerShrinks: Story = {
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
    study: {
      ...studySegment(),
      items: [
        {
          id: 'study_1',
          name: 'Wave 1 pilot, adolescent friendship nominations',
          meta: 'Collecting',
          // A study is led by its status, never by an identity mark: the
          // monogram of a study says nothing the name does not, and the state
          // it is in is what a researcher is looking for.
          leading: <StatusPip tone="bg-success" />,
        },
        ...studies.slice(1),
      ],
      currentId: 'study_1',
    },
  },
  decorators: [
    (Story) => (
      <div className="flex flex-col gap-4">
        {(['72rem', '38rem', '20rem'] as const).map((width) => (
          <div key={width} data-width={width} style={{ width }}>
            <Story />
          </div>
        ))}
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const at = (width: string) =>
      canvasElement.querySelector<HTMLElement>(`[data-width="${width}"]`)!;

    const nameIn = (host: HTMLElement, text: string) =>
      within(host).getByText(text);

    const TEAM =
      'Northwestern Social Networks and Health Innovations Laboratory';
    const STUDY = 'Wave 1 pilot, adolescent friendship nominations';

    // Wide: whole, both of them. `scrollWidth` is what the text WANTS; where
    // it fits inside the box there is nothing to cut.
    for (const text of [TEAM, STUDY]) {
      const el = nameIn(at('72rem'), text);
      await expect(el.scrollWidth).toBeLessThanOrEqual(el.clientWidth + 1);
    }

    // Mid: both cut, and cut with an ellipsis rather than simply clipped.
    for (const text of [TEAM, STUDY]) {
      const el = nameIn(at('38rem'), text);
      // Above the collapse threshold, so the words are still in the layout —
      // otherwise this would be asserting truncation of a hidden column.
      await expect(getComputedStyle(el.parentElement!).position).not.toBe(
        'absolute',
      );
      await expect(el.scrollWidth).toBeGreaterThan(el.clientWidth);
      await expect(getComputedStyle(el).textOverflow).toBe('ellipsis');
      // Still on one line: an ellipsis is the answer, not a wrap.
      await expect(getComputedStyle(el).whiteSpace).toBe('nowrap');
    }

    // Narrow: the words are out of the layout entirely and the marks carry
    // the segments. They stay in the accessible name — `NarrowContainer`
    // asserts that half.
    for (const text of [TEAM, STUDY]) {
      const column = nameIn(at('20rem'), text).parentElement!;
      await expect(getComputedStyle(column).position).toBe('absolute');
    }
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
