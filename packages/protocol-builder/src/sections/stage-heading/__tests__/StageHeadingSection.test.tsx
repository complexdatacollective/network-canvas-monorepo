import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { interfaceDocumentationUrl } from '../../../interfaces/documentation.ts';
import { defaultStageImage } from '../../../interfaces/StageTypeImage.tsx';
import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import StageHeadingSection from '../StageHeadingSection.tsx';

const DOCUMENTATION_URL = interfaceDocumentationUrl('information');

const heading = <StageHeadingSection documentationUrl={DOCUMENTATION_URL} />;

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

  /**
   * Which of nineteen interfaces is open, at a glance.
   *
   * Architect draws the interface's own screenshot on a decorative rail beside
   * the stage name (`StageHeading.tsx:72-91`), and the rebuilt heading dropped
   * it — leaving a researcher clicking through a timeline with the stage's
   * name and a type badge to tell a Sociogram from a Narrative.
   *
   * Every interface the fixture protocol holds is asked, and the placeholder
   * is refused: a heading that had stopped reading the stage's type would
   * render the Default screenshot for all of them and a test that only counted
   * images would still pass.
   */
  it.each(fixtureStageIds())(
    'shows the interface screenshot for %s',
    (stageId) => {
      const { container } = renderStageEditor({ stageId, sections: heading });

      const image = container.querySelector('img');
      expect(image, stageId).not.toBeNull();
      expect(image?.getAttribute('src'), stageId).not.toBe(
        defaultStageImage.src,
      );

      // Decorative: the interface is named in the badge beside it, so the
      // picture says nothing a reader who cannot see it is not already told.
      expect(image?.getAttribute('alt'), stageId).toBe('');
      expect(screen.queryAllByRole('img')).toEqual([]);
    },
  );

  /** The one thing an interface does tell the heading. */
  it('points at the documentation for this interface', () => {
    renderStageEditor({ stageId: 'information-1', sections: heading });

    expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute(
      'href',
      DOCUMENTATION_URL,
    );
  });

  /**
   * The other thing an interface may tell it: what a proposed name is derived
   * from. Handed straight through to the name section, and nothing else in
   * this package passes it yet — so without a case here a family passing
   * `autoName` would get silence rather than a proposal, and the suite would
   * stay green.
   *
   * `propose` is the half that can be observed from outside a family: the
   * default answer for an EXISTING stage is "do not propose", so a heading
   * that dropped the prop would leave the emptied name empty.
   */
  it('hands a family’s naming rule to the name section', async () => {
    renderStageEditor({
      stage: {
        id: 'information-unnamed',
        type: 'Information',
        fields: { label: '', title: 'Welcome', items: [] },
      },
      sections: (
        <StageHeadingSection
          documentationUrl={DOCUMENTATION_URL}
          autoName={{ propose: true }}
        />
      ),
    });

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
        'Information #2',
      ),
    );
  });

  it('proposes nothing for the same stage when no rule is given', async () => {
    renderStageEditor({
      stage: {
        id: 'information-unnamed',
        type: 'Information',
        fields: { label: '', title: 'Welcome', items: [] },
      },
      sections: heading,
    });

    const name = screen.getByRole('textbox', { name: 'Stage name' });
    await waitFor(() => expect(name).toHaveValue(''));
  });
});

/**
 * Where a researcher's cursor is when a stage editor opens.
 *
 * Naming the stage is the first thing there is to do in a stage that does not
 * exist yet, and the name field is the page's own heading — so a keyboard or
 * screen-reader researcher who has just chosen an interface should already be
 * in it rather than tabbing through the shell to find it. Asked through the
 * heading rather than the name section, because the heading is what every
 * editor actually composes: a section that focused correctly on its own but
 * was never told to would leave every editor unfocused and the suite green.
 */
describe('where the researcher starts', () => {
  it('puts the cursor in the name of a stage being created', () => {
    renderStageEditor({
      create: { type: 'Information', position: 2 },
      sections: heading,
    });

    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveFocus();
  });

  /**
   * An existing stage's name is already the researcher's, and they clicked a
   * stage in the timeline to look at it rather than to rename it. Stealing
   * focus into a text field would also move a screen reader's cursor past the
   * editor's own heading, so it never says which stage was opened.
   */
  it('leaves focus alone for a stage the interview already holds', () => {
    renderStageEditor({ stageId: 'information-1', sections: heading });

    expect(
      screen.getByRole('textbox', { name: 'Stage name' }),
    ).not.toHaveFocus();
  });
});
