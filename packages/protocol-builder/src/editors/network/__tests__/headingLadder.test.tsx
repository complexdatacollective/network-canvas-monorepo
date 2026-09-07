import { composeStories } from '@storybook/react-vite';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import { harnessEditor } from './editorFixtures.tsx';
import * as geospatialEditorStories from '../GeospatialStageEditor.stories.tsx';
import * as narrativeEditorStories from '../NarrativeStageEditor.stories.tsx';
import * as composerEditorStories from '../NetworkComposerStageEditor.stories.tsx';
import { NetworkComposerStageEditor } from '../NetworkComposerStageEditor.tsx';
import * as sociogramEditorStories from '../SociogramStageEditor.stories.tsx';

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
 * one owns the network family's stories.
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
   * a heading that is not the stage name.
   */
  it('counts a connection type’s form from the section that lists them', async () => {
    const { type, fields } = loadFixtureStage('network-composer-1');

    renderStageEditor({
      stage: {
        id: 'network-composer-edges',
        type,
        // The fixture ticks no connection type, and the forms section only
        // exists once one is ticked — so the nesting under test is not on
        // screen at all without this.
        fields: {
          ...fields,
          edges: [
            {
              id: 'composer-edge-1',
              subject: { entity: 'edge', type: 'knows' },
            },
          ],
        },
      },
      editor: harnessEditor(NetworkComposerStageEditor, 'NetworkComposer'),
    });

    expect(headingLadder()).toEqual([
      'h2: Stage name',
      'h3: Node type',
      'h3: Adding and arranging nodes',
      'h4: Node attributes',
      'h3: Connections',
      'h4: Connection attributes',
      'h5: Attributes for "knows" connections',
      'h3: Background',
      'h3: Skip logic',
      'h3: Interviewer guidance',
    ]);
    await expectHeadingOrder(10);
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
describe('every story of a network editor that writes its own heading', () => {
  const from = (
    surface: string,
    composed: Record<string, () => ReactNode>,
  ): [string, () => ReactNode][] =>
    Object.entries(composed).map(([name, Story]) => [
      `${surface}/${name}`,
      Story,
    ]);

  const stories = [
    ...from('SociogramStageEditor', composeStories(sociogramEditorStories)),
    ...from(
      'NetworkComposerStageEditor',
      composeStories(composerEditorStories),
    ),
    ...from('NarrativeStageEditor', composeStories(narrativeEditorStories)),
    ...from('GeospatialStageEditor', composeStories(geospatialEditorStories)),
  ];

  it.each(stories)('has no heading skip in %s', async (_name, Story) => {
    render(<Story />);

    await expectHeadingOrder(1);
  });
});
