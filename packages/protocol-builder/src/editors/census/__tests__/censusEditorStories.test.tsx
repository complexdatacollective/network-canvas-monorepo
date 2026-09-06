import { composeStories } from '@storybook/react-vite';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { StageEditorStoryHost } from '../../../testing/StageEditorStoryHost.tsx';
import * as categoricalBin from '../CategoricalBinStageEditor.stories.tsx';
import * as dyadCensus from '../DyadCensusStageEditor.stories.tsx';
import * as oneToManyDyadCensus from '../OneToManyDyadCensusStageEditor.stories.tsx';
import * as ordinalBin from '../OrdinalBinStageEditor.stories.tsx';
import * as tieStrengthCensus from '../TieStrengthCensusStageEditor.stories.tsx';

/**
 * Every story in the family, as the story files themselves declare it.
 *
 * The arguments are IMPORTED rather than restated, which is the whole point:
 * Storybook builds a story that throws on mount just as happily as one that
 * works, nothing in this package's gates opens the built pages, and a copy of
 * the arguments written here would go on passing after the story beside it had
 * been broken.
 *
 * Each story is the shared `StageEditorStoryHost` with the family's editor in
 * its render prop, so what this mounts is exactly what a reader of the
 * Storybook sees — and the pass below is the `play` those stories run.
 */
const STORIES = [
  {
    name: 'Categorical Bin',
    stories: categoricalBin,
    codebookControls: ['Create a new attribute'],
  },
  {
    name: 'Ordinal Bin',
    stories: ordinalBin,
    codebookControls: ['Create a new attribute'],
  },
  {
    name: 'Dyad Census',
    stories: dyadCensus,
    codebookControls: ['Create a new connection type'],
  },
  {
    name: 'One to Many Dyad Census',
    stories: oneToManyDyadCensus,
    codebookControls: ['Create a new connection type'],
  },
  {
    name: 'Tie-Strength Census',
    stories: tieStrengthCensus,
    // Both, because the scale hangs off the connection this prompt creates.
    codebookControls: [
      'Create a new connection type',
      'Create a new attribute',
    ],
  },
] as const;

/**
 * Every heading under `root`, as `level: text`, in the order a reader
 * navigating by headings meets them.
 *
 * The whole document by default rather than the render container: a prompt is
 * edited in a `Dialog`, which portals its content out, so a ladder read from
 * the container alone would be missing the half of it under test.
 */
const headingLadder = (root: ParentNode = document.body): string[] =>
  Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(
    (heading) =>
      `${heading.tagName.toLowerCase()}: ${heading.textContent?.trim() ?? ''}`,
  );

/**
 * axe's own `heading-order` rule, over everything on screen.
 *
 * The rule exempts the first heading it meets and then refuses any jump of
 * more than one level, which is exactly the failure a surface that writes a
 * heading without saying what encloses it produces. Run here rather than left
 * to the story a11y configuration because nothing in this package's test lane
 * replays the stories.
 *
 * The count is asserted as well as the violations: axe reports a document with
 * no headings in it as inapplicable, with no violations to show, so a rendered
 * editor that quietly stopped writing headings would otherwise pass this.
 *
 * Modelled on the sweep in `src/__tests__/headingLadder.test.tsx`, which makes
 * the same judgement over the codebook editors and the bare shell. Kept here
 * rather than shared from there because that file is a test module and this
 * one owns the census and bin family's stories.
 */
async function expectHeadingOrder(judgedAtLeast: number): Promise<void> {
  const results = await axe.run(document.body, {
    runOnly: { type: 'rule', values: ['heading-order'] },
  });

  expect(
    results.violations.flatMap((violation) =>
      violation.nodes.map((node) => node.html),
    ),
  ).toEqual([]);
  expect(
    [...results.passes, ...results.incomplete].flatMap((result) => result.nodes)
      .length,
  ).toBeGreaterThanOrEqual(judgedAtLeast);
}

describe('the census and bin editor stories', () => {
  /**
   * The standing rule this file holds in place: every editor the family names
   * has a story, opened over the shared all-interfaces protocol. A family that
   * added a sixth editor and no story would leave that editor with no page a
   * researcher or a visual comparison can look at.
   */
  it('has one story per interface the family claims, over the fixture', () => {
    expect(
      STORIES.map(({ stories }) => stories.default.args.stageId).toSorted(),
    ).toEqual([
      'categorical-bin-1',
      'dyad-census-1',
      'one-to-many-dyad-census-1',
      'ordinal-bin-1',
      'tie-strength-census-1',
    ]);
  });

  it.each(STORIES)(
    'renames and saves the stage the $name story opens',
    async ({ stories }) => {
      render(<StageEditorStoryHost {...stories.default.args} />);
      const user = userEvent.setup();

      const name = screen.getByRole('textbox', { name: 'Stage name' });
      await user.clear(name);
      await user.type(name, 'Renamed');
      await user.click(screen.getByRole('button', { name: 'Save stage' }));

      await waitFor(() =>
        expect(
          screen.getByRole('status', { name: 'Save status' }),
        ).toHaveTextContent('Saved “Renamed”.'),
      );
      // The status alone cannot tell a save that committed the rename from one
      // that committed the stage as it was found.
      expect(
        screen.getByRole('region', {
          name: 'What the host was asked to commit',
        }),
      ).toHaveTextContent('"label": "Renamed"');
    },
  );

  /**
   * The controls in each prompt that write to the CODEBOOK rather than to the
   * stage, reachable in the story an author opens.
   *
   * A prompt is the only place these controls exist, so this is the assertion
   * that holds their labels in place: a control renamed or dropped is a
   * researcher who can no longer create the attribute or connection type the
   * prompt needs, from a page nothing else in this package opens.
   */
  it.each(STORIES)(
    'reaches the codebook controls in a $name prompt as an author',
    async ({ stories, codebookControls }) => {
      render(<StageEditorStoryHost {...stories.default.args} />);
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'Edit prompt' }));
      await screen.findByRole('dialog');

      for (const name of codebookControls) {
        expect(await screen.findByRole('button', { name })).toBeInTheDocument();
      }
    },
  );

  /**
   * A spectator can read the stage and change nothing: every control that
   * leads into a prompt is inert, so there is no way from here to the prompt
   * dialog, and a disabled Save cannot be pressed.
   *
   * The codebook controls INSIDE a prompt are not asserted here, and used to
   * be. They live in the row dialog, which a spectator cannot open — so
   * "nowhere on the page" was equally true of an author who had not clicked
   * anything, and a renamed or deleted control would have gone on being absent
   * for a spectator forever. The reachable case is editing taken away while a
   * prompt is already OPEN, which needs a session the test can change under
   * the editor rather than a story's fixed arguments; it is asserted against
   * each guard in `CategoricalBinPromptsSection.test.tsx` and
   * `DyadCensusPromptsSection.test.tsx`.
   */
  it.each(STORIES)(
    'offers a spectator of the $name story no way into a prompt',
    ({ stories }) => {
      render(
        <StageEditorStoryHost
          {...stories.default.args}
          {...stories.Spectating.args}
        />,
      );

      expect(screen.getByRole('button', { name: 'Save stage' })).toBeDisabled();
      for (const name of [
        'Create new prompt',
        'Edit prompt',
        'Remove prompt',
      ]) {
        expect(screen.getByRole('button', { name })).toBeDisabled();
      }
    },
  );
});

/**
 * The outline every one of these stories writes.
 *
 * None of these editors states a heading level of its own: the stage's name is
 * the page's heading and each section is one below it, which they get by being
 * assembled out of `StageHeading` and Fresco's `Section` rather than by saying
 * so. That is precisely why it is worth judging — a family that reached for a
 * hand-written level, or a shell that stopped stating the one its sections
 * count from, would leave a reader navigating by headings a subsection that is
 * not there, and nothing else in this package opens these pages to notice.
 */
describe('the heading ladder the census and bin stories write', () => {
  const eachStory = STORIES.flatMap(({ name, stories }) =>
    Object.entries(composeStories(stories)).map(
      ([storyName, Story]): [string, () => ReactNode] => [
        `${name}/${storyName}`,
        Story,
      ],
    ),
  );

  /**
   * Named rather than counted, so a story added to a family and left out of
   * the sweep below is a failure here rather than silence.
   */
  it('sweeps both stories of every editor in the family', () => {
    expect(eachStory.map(([name]) => name)).toEqual([
      'Categorical Bin/Editing',
      'Categorical Bin/Spectating',
      'Ordinal Bin/Editing',
      'Ordinal Bin/Spectating',
      'Dyad Census/Editing',
      'Dyad Census/Spectating',
      'One to Many Dyad Census/Editing',
      'One to Many Dyad Census/Spectating',
      'Tie-Strength Census/Editing',
      'Tie-Strength Census/Spectating',
    ]);
  });

  it.each(eachStory)('opens %s at the stage name', async (_name, Story) => {
    render(<Story />);

    const [stageName, ...sections] = headingLadder();
    expect(stageName).toBe('h2: Stage name');
    // Every section of the stage configures part of the stage that name
    // belongs to, so each is one rung below it and none is beside it.
    expect(sections).not.toEqual([]);
    expect(sections.filter((heading) => !heading.startsWith('h3: '))).toEqual(
      [],
    );
    await expectHeadingOrder(2);
  });

  /**
   * A prompt is edited in a dialog, which is where the level a section counts
   * from stops being inferable: `DialogPopup` restarts the Surface ladder for
   * the overlay's colours, so a section that read its level from Surface depth
   * landed an `h4` under the dialog's `h2` title. The dialog states its own
   * title's level instead, and everything in it counts from there.
   */
  it.each(STORIES)(
    'counts a $name prompt dialog from the dialog title',
    async ({ stories }) => {
      const { Editing } = composeStories(stories);
      render(<Editing />);
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'Edit prompt' }));
      const [title, ...sections] = headingLadder(
        await screen.findByRole('dialog'),
      );

      expect(title).toBe('h2: Edit prompt');
      expect(sections).not.toEqual([]);
      expect(sections.filter((heading) => !heading.startsWith('h3: '))).toEqual(
        [],
      );
      // Judged over the whole document, so the stage's own ladder behind the
      // overlay is read together with the dialog's rather than in place of it.
      await expectHeadingOrder(2);
    },
  );
});
