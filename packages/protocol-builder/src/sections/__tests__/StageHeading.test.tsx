import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import { fixtureStageIds } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import StageHeading from '../StageHeading.tsx';

const DOCUMENTATION_URL = interfaceDocumentationUrl('information');

const heading = <StageHeading documentationUrl={DOCUMENTATION_URL} />;

describe('the stage heading', () => {
  /**
   * Orientation is not an interface's own decision.
   *
   * The position line used to be a name generator's private component, so a
   * researcher clicking through one timeline was told where they were on some
   * stages and not on others. Every interface the fixture protocol holds is
   * asked here, so an interface added later is asked too.
   *
   * The expected number is derived from the stage order rather than written
   * out, because the heading reads it from the protocol the editor is already
   * holding — a test that hard-coded it would agree with a heading that had
   * stopped reading the protocol at all.
   */
  it.each(fixtureStageIds())(
    'says where %s sits in the interview',
    (stageId) => {
      const order = fixtureStageIds();
      renderStageEditor({ stageId, sections: heading });

      expect(
        screen.getByText(
          `Stage ${order.indexOf(stageId) + 1} of ${order.length}`,
        ),
      ).toBeInTheDocument();
    },
  );

  /**
   * A stage being created is not in the interview yet, so it has no position
   * to state — and stating one would name a place the researcher could still
   * change before the stage is saved.
   */
  it('states no position for a stage the interview does not hold yet', () => {
    renderStageEditor({
      create: { type: 'Information', position: 2 },
      sections: heading,
    });

    // The heading itself is mounted — otherwise the absence below would be the
    // absence of the whole component rather than of the position line.
    expect(
      screen.getByRole('textbox', { name: 'Stage name' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Stage \d+ of \d+$/)).toBeNull();
  });

  /** The one thing an interface does tell the heading. */
  it('points at the documentation for this interface', () => {
    renderStageEditor({ stageId: 'information-1', sections: heading });

    expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute(
      'href',
      DOCUMENTATION_URL,
    );
  });
});
