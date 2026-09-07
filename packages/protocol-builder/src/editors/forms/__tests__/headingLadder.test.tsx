import { composeStories } from '@storybook/react-vite';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import * as alterEdgeFormStories from '../AlterEdgeFormStageEditor.stories.tsx';
import * as alterFormStories from '../AlterFormStageEditor.stories.tsx';
import * as egoFormStories from '../EgoFormStageEditor.stories.tsx';
import * as informationStories from '../InformationStageEditor.stories.tsx';

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
 * one owns the forms family's stories.
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
describe('every story of a forms editor that writes its own heading', () => {
  const from = (
    surface: string,
    composed: Record<string, () => ReactNode>,
  ): [string, () => ReactNode][] =>
    Object.entries(composed).map(([name, Story]) => [
      `${surface}/${name}`,
      Story,
    ]);

  const stories = [
    ...from('AlterEdgeFormStageEditor', composeStories(alterEdgeFormStories)),
    ...from('AlterFormStageEditor', composeStories(alterFormStories)),
    ...from('EgoFormStageEditor', composeStories(egoFormStories)),
    ...from('InformationStageEditor', composeStories(informationStories)),
  ];

  it.each(stories)('has no heading skip in %s', async (_name, Story) => {
    render(<Story />);

    await expectHeadingOrder(1);
  });
});
