import { composeStories } from '@storybook/react-vite';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { EnclosingHeadingLevel } from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';

import * as anonymisationEditorStories from '../AnonymisationStageEditor.stories.tsx';
import * as familyPedigreeEditorStories from '../FamilyPedigreeStageEditor.stories.tsx';
import * as narrativePedigreeEditorStories from '../NarrativePedigreeStageEditor.stories.tsx';

/**
 * Every heading in the document, as `level: text`, in the order a reader
 * navigating by headings meets them.
 */
const headingLadder = (): string[] =>
  Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(
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
 * one owns the pedigree and anonymisation family's stories.
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
    [...results.passes, ...results.incomplete].flatMap(
      (result) => result.nodes,
    ).length,
  ).toBeGreaterThanOrEqual(judgedAtLeast);
}

describe('a heading a section writes inside itself', () => {
  /**
   * A section can hold another section, and the prose and group headings
   * inside one belong under whichever of them they sit in. Nothing on a story
   * proves that: at the depth the stories open at, a heading written as a
   * fixed `h4` happens to land on the rung the ladder wanted, and axe's
   * `heading-order` only refuses a SKIP — a heading written as a peer of the
   * section containing it reads to anyone navigating by headings as though
   * that section had ended, and passes the rule.
   *
   * So the levels are read out here, from a host that mounts an editor under
   * a heading of its own — at the level the stories never open under.
   */

  /**
   * The whole ladder moves together, the prose headings written inside a
   * section included. Fixed at `h4`, the two explanations below became peers
   * of the section explaining them the moment a host stated a heading of its
   * own — and a section is exactly what a host of this editor is.
   */
  it('moves prose inside a section down with the editor around it', async () => {
    const { Editing } = composeStories(narrativePedigreeEditorStories);

    render(
      <div>
        <h2>Prompt configuration</h2>
        <EnclosingHeadingLevel level="h2">
          <Editing />
        </EnclosingHeadingLevel>
      </div>,
    );

    expect(headingLadder()).toEqual([
      'h2: Prompt configuration',
      'h3: Stage name',
      'h4: Pedigree source',
      'h4: Diseases',
      'h4: At-risk statuses',
      'h5: How it is worked out',
      'h5: Why this is off by default',
      'h4: Skip logic',
      'h4: Interviewer guidance',
    ]);
    await expectHeadingOrder(9);
  });

  /**
   * The same for a heading a section writes once per thing it lists. Read
   * under a host heading for the same reason: at the stories' own depth an
   * `h4` written by hand is indistinguishable from one counted.
   */
  it('moves a per-entry heading down with the editor around it', async () => {
    const { Editing } = composeStories(anonymisationEditorStories);

    render(
      <div>
        <h2>Prompt configuration</h2>
        <EnclosingHeadingLevel level="h2">
          <Editing />
        </EnclosingHeadingLevel>
      </div>,
    );

    expect(headingLadder()).toEqual([
      'h2: Prompt configuration',
      'h3: Stage name',
      'h4: Passphrase explanation',
      'h4: Passphrase rules',
      'h4: Encrypted attributes',
      'h5: family member',
      'h5: person',
      'h4: Skip logic',
      'h4: Interviewer guidance',
    ]);
    await expectHeadingOrder(9);
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
describe('every story of a pedigree editor that writes its own heading', () => {
  const from = (
    surface: string,
    composed: Record<string, () => ReactNode>,
  ): [string, () => ReactNode][] =>
    Object.entries(composed).map(([name, Story]) => [
      `${surface}/${name}`,
      Story,
    ]);

  const stories = [
    ...from(
      'FamilyPedigreeStageEditor',
      composeStories(familyPedigreeEditorStories),
    ),
    ...from(
      'NarrativePedigreeStageEditor',
      composeStories(narrativePedigreeEditorStories),
    ),
    ...from(
      'AnonymisationStageEditor',
      composeStories(anonymisationEditorStories),
    ),
  ];

  it.each(stories)('has no heading skip in %s', async (_name, Story) => {
    render(<Story />);

    await expectHeadingOrder(1);
  });
});
