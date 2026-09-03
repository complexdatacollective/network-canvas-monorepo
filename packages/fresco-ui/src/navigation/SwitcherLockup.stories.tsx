import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '../storybook-support/awaitPassiveEffects';
import { EntitySwitcher, type EntitySwitcherItem } from './EntitySwitcher';
import { SwitcherLockup } from './SwitcherLockup';

const teams: EntitySwitcherItem[] = [
  { id: 'team_5', name: 'SONIC Lab' },
  { id: 'team_2', name: 'Complex Data Collective' },
  { id: 'team_3', name: 'Adolescent Health Study Group' },
];

const studies: EntitySwitcherItem[] = [
  { id: 'study_1', name: 'Wave 1 pilot', meta: '12 interviews' },
  { id: 'study_2', name: 'Wave 2', meta: '0 interviews', badge: 'Draft' },
];

/**
 * The kicker-over-name column of one segment, which `sr-only` takes out of
 * flow when the lockup is too narrow for it. Reading `position` off it is how
 * these stories tell a collapsed switcher from an expanded one.
 */
function textColumn(root: HTMLElement, name: string): HTMLElement {
  const column = within(root).getByText(name).parentElement;
  if (!(column instanceof HTMLElement)) {
    throw new Error(`EntitySwitcher rendered no text column for "${name}"`);
  }
  return column;
}

/** The lockup's two segment triggers, or a failure that says which is missing. */
function segments(root: HTMLElement): [HTMLElement, HTMLElement] {
  const [team, study] = within(root).getAllByRole('combobox');
  if (team === undefined || study === undefined) {
    throw new Error('SwitcherLockup rendered fewer than two segment triggers');
  }
  return [team, study];
}

const documentation = `
Joins one or two \`EntitySwitcher\`s into a single bordered object that reads as
a path — team, then the study inside it.

\`\`\`tsx
import { SwitcherLockup } from '@codaco/fresco-ui/navigation/SwitcherLockup';

<SwitcherLockup>
  <EntitySwitcher kicker={t('team')} items={teams} currentId={teamId} onSelect={goToTeam} />
  {studyId !== undefined && (
    <EntitySwitcher kicker={t('study')} items={studies} currentId={studyId} onSelect={goToStudy} />
  )}
</SwitcherLockup>
\`\`\`

| Prop | Purpose |
| --- | --- |
| \`children\` | One or two \`EntitySwitcher\`s, outermost first. A conditional child (\`{study && <EntitySwitcher … />}\`) leaves no segment behind. |
| \`className\` | Merged onto the lockup's outer element — the one carrying the container query, which is where a host says how wide the lockup may be. |

**The study segment is absent, not empty.** With one child the lockup is a
single rounded control: nothing marks where a second segment would have been,
because outside a study there is no study.

**One border, one divider.** The segments share the lockup's border and are
separated by a rule, so the corners round only on the outer edges. There is no
\`overflow-hidden\` doing that clipping — it would take the focus ring off
whichever trigger is focused.

**The lockup is the \`@container\`,** so its switchers collapse against the
width the lockup was given rather than against the viewport, and the same pair
behaves correctly in a wide app header and in a narrow panel.

That is why the lockup renders two elements. \`container-type: inline-size\`
makes an element's own width ignore its contents, so putting it on the bordered
box would collapse the box to zero and leave every switcher inside reading a
container narrower than the threshold — permanently collapsed. The outer
element carries the container and takes its width from the host; the inner one
is the bordered box. The host does have to give the outer element a width it
does not derive from its contents: automatic for a block-level child, and
\`flex-1\` / \`w-full\` / a sized track in a flex or grid row.
`;

const meta = {
  title: 'Navigation/SwitcherLockup',
  component: SwitcherLockup,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: documentation } },
  },
  args: {
    children: null,
  },
  render: () => (
    <SwitcherLockup>
      <EntitySwitcher
        kicker="Team"
        items={teams}
        currentId="team_5"
        onSelect={fn()}
      />
      <EntitySwitcher
        kicker="Study"
        items={studies}
        currentId="study_1"
        onSelect={fn()}
      />
    </SwitcherLockup>
  ),
} satisfies Meta<typeof SwitcherLockup>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Team, then the study inside it. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const [team, study] = segments(canvasElement);
    await expect(team).toHaveAccessibleName('Team SONIC Lab');
    await expect(study).toHaveAccessibleName('Study Wave 1 pilot');

    // With room, nothing collapses. This is the assertion that catches a
    // lockup whose container measures zero: size containment on the bordered
    // box makes it ignore its contents, and every switcher inside then reads
    // a container below the threshold and collapses no matter how much room
    // the header actually has.
    for (const name of ['SONIC Lab', 'Wave 1 pilot']) {
      await waitFor(() =>
        expect(getComputedStyle(textColumn(canvasElement, name)).position).toBe(
          'static',
        ),
      );
    }
    await expect(team.getBoundingClientRect().width).toBeGreaterThan(100);
  },
};

/**
 * No study open. One child, so the lockup is a single rounded control with no
 * divider and no blank second segment.
 */
export const TeamOnly: Story = {
  render: () => (
    <SwitcherLockup>
      <EntitySwitcher
        kicker="Team"
        items={teams}
        currentId="team_5"
        onSelect={fn()}
      />
    </SwitcherLockup>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('combobox')).toHaveLength(
      1,
    );
    // One segment, so nothing carries the divider.
    await expect(canvasElement.querySelectorAll('.border-s')).toHaveLength(0);
  },
};

/**
 * A conditional second switcher. `Children.toArray` drops the falsy child, so
 * a study that is not open leaves no empty segment and no stray divider.
 */
export const ConditionalSecondSegment: Story = {
  render: () => {
    const studyId: string | undefined = undefined;
    return (
      <SwitcherLockup>
        <EntitySwitcher
          kicker="Team"
          items={teams}
          currentId="team_5"
          onSelect={fn()}
        />
        {studyId !== undefined && (
          <EntitySwitcher
            kicker="Study"
            items={studies}
            currentId={studyId}
            onSelect={fn()}
          />
        )}
      </SwitcherLockup>
    );
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('combobox')).toHaveLength(
      1,
    );
    await expect(canvasElement.querySelectorAll('.border-s')).toHaveLength(0);
  },
};

/**
 * A study whose team offers no alternatives: the team segment is inert while
 * the study segment stays a control. The two segments answer for themselves.
 */
export const OneTeamManyStudies: Story = {
  render: () => (
    <SwitcherLockup>
      <EntitySwitcher
        kicker="Team"
        items={[teams[0]!]}
        currentId="team_5"
        onSelect={fn()}
      />
      <EntitySwitcher
        kicker="Study"
        items={studies}
        currentId="study_1"
        onSelect={fn()}
      />
    </SwitcherLockup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const triggers = canvas.getAllByRole('combobox');
    await expect(triggers).toHaveLength(1);
    await expect(triggers[0]).toHaveAccessibleName('Study Wave 1 pilot');
    // The team is still named, just not as a control.
    await expect(canvasElement.textContent).toContain('SONIC Lab');
  },
};

/**
 * The lockup is the container both switchers collapse against, so a narrow
 * header leaves two marks and two carets rather than a wrapped mess.
 */
export const NarrowLockup: Story = {
  render: () => (
    <div style={{ width: '22rem' }}>
      <SwitcherLockup>
        <EntitySwitcher
          kicker="Team"
          items={teams}
          currentId="team_5"
          onSelect={fn()}
        />
        <EntitySwitcher
          kicker="Study"
          items={studies}
          currentId="study_1"
          onSelect={fn()}
        />
      </SwitcherLockup>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // The lockup is the container both switchers query, so a 22rem lockup
    // collapses both of them — with no `@container` of its own, neither would
    // find one and neither would ever collapse.
    for (const name of ['SONIC Lab', 'Wave 1 pilot']) {
      await waitFor(() =>
        expect(getComputedStyle(textColumn(canvasElement, name)).position).toBe(
          'absolute',
        ),
      );
    }

    // Both segments survive the collapse with their names intact.
    const [team, study] = segments(canvasElement);
    await expect(team).toHaveAccessibleName('Team SONIC Lab');
    await expect(study).toHaveAccessibleName('Study Wave 1 pilot');
  },
};

/** Long names in both segments, truncated in the triggers and nowhere else. */
export const LongNames: Story = {
  render: () => (
    <SwitcherLockup>
      <EntitySwitcher
        kicker="Team"
        items={[
          {
            id: 'team_long',
            name: 'Adolescent Health and Social Connectedness Longitudinal Study Group',
          },
          ...teams,
        ]}
        currentId="team_long"
        onSelect={fn()}
      />
      <EntitySwitcher
        kicker="Study"
        items={[
          {
            id: 'study_long',
            name: 'Wave 3 follow-up with the extended sociogram battery',
            meta: '312 interviews',
          },
          ...studies,
        ]}
        currentId="study_long"
        onSelect={fn()}
      />
    </SwitcherLockup>
  ),
};

/**
 * Each segment owns its own list. Opening one and dismissing it hands focus
 * back to the trigger it came from, not to the lockup's first child.
 */
export const EachSegmentOpensItsOwnList: Story = {
  play: async ({ canvasElement }) => {
    const [, study] = segments(canvasElement);

    await awaitPassiveEffects();
    await userEvent.click(study);

    const list = await within(document.body).findByRole('listbox');
    await expect(
      within(list).getAllByRole('option', { selected: true })[0],
    ).toHaveTextContent('Wave 1 pilot');

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(within(document.body).queryByRole('listbox')).toBeNull(),
    );
    await waitFor(() => expect(study).toHaveFocus());
  },
};
