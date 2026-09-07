import { composeStories } from '@storybook/react-vite';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { nameGeneratorStageEditors } from '../../nameGeneratorStageEditors.ts';
import * as quickAddStories from '../NameGeneratorQuickAddStageEditor.stories.tsx';
import * as rosterStories from '../NameGeneratorRosterStageEditor.stories.tsx';
import * as nameGeneratorStories from '../NameGeneratorStageEditor.stories.tsx';

/**
 * Every heading under `root`, as `level: text`, in the order a reader
 * navigating by headings meets them.
 *
 * A `root` narrows it to one subtree, for a surface that is only ever met
 * inside a page with a ladder of its own — a dialog opened over a stage
 * editor, a section of one. What is asked of those is where their own
 * headings sit relative to the heading they were opened under, and spelling
 * out the whole page as well would make the answer change every time a
 * section is added to an editor that is not what the test is about. A skip
 * anywhere is still caught: `expectHeadingOrder` reads the whole document
 * either way.
 *
 * The whole document by default rather than the render container: a `Dialog`
 * portals its content out, so a ladder read from the container alone would be
 * missing the half of it under test.
 */
const headingLadder = (root: ParentNode = document): string[] =>
  Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(
    (heading) =>
      `${heading.tagName.toLowerCase()}: ${heading.textContent?.trim() ?? ''}`,
  );

/**
 * axe's own `heading-order` rule, over everything on screen.
 *
 * The rule exempts the first heading it meets and then refuses any jump of
 * more than one level, which is exactly the failure a component that writes a
 * heading without saying so produces.
 *
 * The count is asserted as well as the violations: axe reports a document with
 * no headings in it as inapplicable, with no violations to show, so a rendered
 * surface that quietly stopped writing headings would otherwise pass this.
 *
 * Modelled on the sweep in `src/__tests__/headingLadder.test.tsx`, which makes
 * the same judgement over the codebook editors and the bare shell. Kept here
 * rather than shared from there because that file is a test module and this
 * one owns the name-generator family's stories.
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

describe('a row of a stage editor list, opened in its dialog', () => {
  /** The one editor that offers both of the lists asked about here. */
  const openNameGenerator = () =>
    renderStageEditor({
      stageId: 'name-generator-1',
      registry: nameGeneratorStageEditors,
    });

  /**
   * The dialog is a page of its own: its title is the heading above the
   * sections that configure the row, and those sections are one below it —
   * however deep the card behind the overlay happens to sit.
   *
   * That depth is exactly what a section used to count from. `DialogPopup`
   * restarts the Surface ladder inside the overlay, so a first-level section
   * in one of these dialogs was an `h4` under the dialog's `h2` title: a skip
   * axe reports, and for a reader navigating by headings a subsection of
   * something that is not there. Both lists are reached only by opening a
   * row, so no story of the editor renders either of them.
   */
  it('puts a panel row’s sections under the dialog title', async () => {
    const harness = openNameGenerator();

    await harness.user.click(
      screen.getByRole('switch', { name: 'Side panels' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new panel' }),
    );

    expect(headingLadder(await screen.findByRole('dialog'))).toEqual([
      'h2: Create panel',
      'h3: Panel',
      'h3: Panel filter',
    ]);
    await expectHeadingOrder(3);
  });

  it('puts a prompt row’s sections under the dialog title', async () => {
    const harness = openNameGenerator();

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new prompt' }),
    );

    expect(headingLadder(await screen.findByRole('dialog'))).toEqual([
      'h2: Create prompt',
      'h3: Participant prompt',
      'h3: Additional attributes',
    ]);
    await expectHeadingOrder(3);
  });
});

describe('a section that speaks once a data file has been read', () => {
  /**
   * The roster editor reads the file its stage points at and then says what
   * the file holds, in an alert raised inside the section that chose it — so
   * that alert is one below that section's own heading rather than beside it.
   *
   * Asserted here rather than left to the story sweep below, which judges each
   * story as it commits: this alert arrives a beat later, and a sweep that
   * waited for it by a timer would be judging whatever had happened to render
   * by then. Waited for by the words it puts on screen instead, so the rung it
   * lands on is really the one under test.
   */
  it('puts what a data file holds one below the section that chose it', async () => {
    renderStageEditor({
      stageId: 'name-generator-roster-1',
      registry: nameGeneratorStageEditors,
    });

    await screen.findByText(
      'The people in it carry these attributes: age and name.',
    );

    expect(
      headingLadder(screen.getByRole('region', { name: 'Roster source' })),
    ).toEqual([
      'h3: Roster source',
      'h4: Roster',
      'h4: What this data file holds',
    ]);
    await expectHeadingOrder(3);
  });
});

/**
 * The stories are the surfaces a reviewer looks at and the ones Chromatic and
 * the Storybook a11y addon replay, so the rule is run over them here too —
 * this package's test lane does not mount them otherwise.
 *
 * Named by the surface as well as the story, because a family with more than
 * one editor exports an `Editing` and a `Spectating` from each: gathered into
 * one object by story name alone, the last module read would silently replace
 * the others and two stories would be swept by nothing.
 */
describe('every story of a name-generator editor that writes its own heading', () => {
  const from = (
    surface: string,
    composed: Record<string, () => ReactNode>,
  ): [string, () => ReactNode][] =>
    Object.entries(composed).map(([name, Story]) => [
      `${surface}/${name}`,
      Story,
    ]);

  const stories = [
    ...from('NameGeneratorStageEditor', composeStories(nameGeneratorStories)),
    ...from(
      'NameGeneratorQuickAddStageEditor',
      composeStories(quickAddStories),
    ),
    ...from('NameGeneratorRosterStageEditor', composeStories(rosterStories)),
  ];

  it.each(stories)('has no heading skip in %s', async (_name, Story) => {
    render(<Story />);

    await expectHeadingOrder(1);
  });
});
