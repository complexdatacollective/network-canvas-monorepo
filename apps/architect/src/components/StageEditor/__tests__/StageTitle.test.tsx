import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { stageTypeDocumentationUrl } from '@codaco/protocol-builder/interfaces/documentation';
import {
  fixtureStageIds,
  loadFixtureStage,
} from '@codaco/protocol-builder/testing/protocolFixture';
import { renderStageEditor } from '@codaco/protocol-builder/testing/renderStageEditor';

import StageTitle from '../StageTitle';

/**
 * Architect's own stage title, over the package's editor harness.
 *
 * Mounted through the editor's HEADER slot, which is where the route mounts
 * it: the title is drawn above the form and inside the form's provider, and
 * everything it reads — the name, the interface, whether the stage is being
 * created — comes from the open edit rather than from props.
 *
 * `sections` is an empty fragment so the harness mounts the shell alone: what
 * is under test is the title, and a whole named editor would be three hundred
 * controls of noise around it.
 */
const openTitle = (stageId: string) =>
  renderStageEditor({
    stageId,
    sections: <></>,
    header: () => <StageTitle />,
  });

describe('the stage title', () => {
  /**
   * Which of nineteen interfaces is open, at a glance.
   *
   * Every interface the fixture protocol holds is asked, the placeholder is
   * refused, and the screenshot has to be the one captured from THIS
   * interface. Refusing the placeholder alone is not enough: a title that had
   * stopped reading the stage's type would show one real screenshot on all
   * nineteen and still pass.
   */
  it.each(fixtureStageIds())(
    'shows the interface screenshot for %s',
    (stageId) => {
      const { type } = loadFixtureStage(stageId);
      const { container } = openTitle(stageId);

      const image = container.querySelector('img');
      expect(image, stageId).not.toBeNull();

      // `@codaco/interface-images` names every generated file after the
      // interface it was captured from (`Sociogram.4x3.960.webp`), so the file's
      // own name is the evidence that the title read this stage's type rather
      // than some fixed one.
      const file = image?.getAttribute('src')?.split('/').pop() ?? '';
      expect(file, stageId).toMatch(new RegExp(`^${type}\\.`));

      // Decorative: the interface is named in the badge beside it, so the
      // picture says nothing a reader who cannot see it is not already told.
      expect(image?.getAttribute('alt'), stageId).toBe('');
      expect(screen.queryAllByRole('img')).toEqual([]);
    },
  );

  /**
   * And the documentation link is this stage's interface too.
   *
   * The expected URL is derived from the stage's own type through the slug
   * table, which is a different lookup from the one the title makes but the
   * same fact — and nineteen distinct URLs, so a title that had settled on one
   * interface fails eighteen of them.
   */
  it.each(fixtureStageIds())(
    'points %s at its own documentation',
    (stageId) => {
      const { type } = loadFixtureStage(stageId);
      openTitle(stageId);

      expect(
        screen.getByRole('link', { name: 'Documentation' }),
        stageId,
      ).toHaveAttribute('href', stageTypeDocumentationUrl(type));
    },
  );
});

/**
 * Where a researcher's cursor is when a stage editor opens.
 *
 * Naming the stage is the first thing there is to do in a stage that does not
 * exist yet, and the name field is the page's own heading — so a keyboard or
 * screen-reader researcher who has just chosen an interface should already be
 * in it rather than tabbing through the shell to find it. An existing stage's
 * name is already theirs, and they opened it to look at it rather than to
 * rename it.
 *
 * Both are asked of a title drawn once the stage is EDITABLE, which is what
 * makes the second one answerable at all. A title mounted alongside an editor
 * still waiting on its acquire draws a disabled control, and `autoFocus` on a
 * disabled control is a no-op — so an editor that autofocused unconditionally
 * would pass a naive version of the second assertion for a reason that has
 * nothing to do with the rule, and would steal focus the moment a host
 * answered its acquire synchronously. Drawing the title when the slot says the
 * stage may be written is a thing a host may legitimately do, and it puts the
 * decision back where the test can see it.
 */
const editableTitle = {
  sections: <></>,
  header: ({ readOnly }: { readOnly: boolean }) =>
    readOnly ? null : <StageTitle />,
} as const;

describe('where the researcher starts', () => {
  it('puts the cursor in the name of a stage being created', async () => {
    const harness = renderStageEditor({
      create: { type: 'Information', position: 2 },
      ...editableTitle,
    });
    await harness.opened();

    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveFocus();
  });

  /**
   * Stealing focus into a text field would also move a screen reader's cursor
   * past the route's own heading, so it never says which stage was opened.
   */
  it('leaves focus alone for a stage the interview already holds', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      ...editableTitle,
    });
    await harness.opened();

    const name = screen.getByRole('textbox', { name: 'Stage name' });
    // Enabled, so the control COULD have taken focus — which is what makes the
    // assertion below about the rule rather than about the timing.
    expect(name).toBeEnabled();
    expect(name).not.toHaveFocus();
  });
});
