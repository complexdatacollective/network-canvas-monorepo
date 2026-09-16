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
 * The title claims focus from nobody, on any stage.
 *
 * A stage being created used to open with the cursor in its name, because
 * naming it was the first thing there was to do. It arrives already named now,
 * so a new stage is an ordinary route arrival: `RouteFocus` lands on the
 * route's heading, and a control that took focus from it would move a screen
 * reader's cursor past the one thing that says which stage was opened.
 *
 * Asked of a title drawn once the stage is EDITABLE, which is what makes it
 * answerable at all: a title mounted beside an editor still waiting on its
 * acquire draws a DISABLED control, and a control that cannot take focus
 * proves nothing about whether anything tried to give it.
 */
const editableTitle = {
  sections: <></>,
  header: ({ readOnly }: { readOnly: boolean }) =>
    readOnly ? null : <StageTitle />,
} as const;

describe('where the researcher starts', () => {
  it.each([
    ['a stage being created', { create: { type: 'Information', position: 2 } }],
    ['a stage the interview already holds', { stageId: 'information-1' }],
  ] as const)('claims no focus on %s', async (_case, opened) => {
    const harness = renderStageEditor({ ...opened, ...editableTitle });
    await harness.opened();

    const name = screen.getByRole('textbox', { name: 'Stage name' });
    // Enabled, so it COULD have taken focus.
    expect(name).toBeEnabled();
    expect(name).not.toHaveFocus();
    // And nothing else in the title took it either, so the route's own
    // landing point is still free to have it.
    expect(document.body).toHaveFocus();
  });
});
