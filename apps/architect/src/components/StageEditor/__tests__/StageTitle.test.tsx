import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { stageTypeDocumentationUrl } from '@codaco/protocol-builder/interfaces/documentation';
import {
  fixtureStageIds,
  loadFixtureStage,
} from '@codaco/protocol-builder/testing/protocolFixture';
import { renderStageEditor } from '@codaco/protocol-builder/testing/renderStageEditor';
import { STAGE_HERO_HEIGHT_VARIABLE } from '~/utils/stageHeroHeight';

import StageTitle from '../StageTitle';

/**
 * Architect's own stage title, mounted through the editor's HEADER slot as the
 * route mounts it. `sections` is empty so the harness mounts the shell alone:
 * a whole named editor would be three hundred controls of noise.
 */
const openTitle = (stageId: string) =>
  renderStageEditor({
    stageId,
    sections: <></>,
    header: () => <StageTitle />,
  });

describe('the stage title', () => {
  /**
   * Which of nineteen interfaces is open, at a glance. The screenshot has to
   * be the one captured from THIS interface: a title that had stopped reading
   * the stage's type would show one real screenshot on all nineteen.
   */
  it.each(fixtureStageIds())(
    'shows the interface screenshot for %s',
    (stageId) => {
      const { type } = loadFixtureStage(stageId);
      const { container } = openTitle(stageId);

      const image = container.querySelector('img');
      expect(image, stageId).not.toBeNull();

      // `@codaco/interface-images` names every file after the interface it was
      // captured from (`Sociogram.4x3.960.webp`), so the name is the evidence.
      const file = image?.getAttribute('src')?.split('/').pop() ?? '';
      expect(file, stageId).toMatch(new RegExp(`^${type}\\.`));

      // Decorative: the badge beside it names the interface.
      expect(image?.getAttribute('alt'), stageId).toBe('');
      expect(screen.queryAllByRole('img')).toEqual([]);
    },
  );

  /**
   * And the documentation link is this stage's interface too: nineteen
   * distinct URLs, so a title that had settled on one fails eighteen.
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

const publishedHeight = () =>
  document.documentElement.style.getPropertyValue(STAGE_HERO_HEIGHT_VARIABLE);

afterEach(() => {
  document.documentElement.style.removeProperty(STAGE_HERO_HEIGHT_VARIABLE);
});

/**
 * The route starts the list of the stage's sections, in the column beside the
 * editor, below this title — which means knowing how much room the title took
 * (`~/utils/stageHeroHeight`). So the title measures itself and says.
 */
describe('the height the stage title publishes', () => {
  it('is the measured height of the title, on the document root', async () => {
    renderStageEditor({ stageId: 'information-1', ...editableTitle });

    // 600px is the height the test environment's `ResizeObserver` reports for
    // every element it is asked about; what matters is that the published
    // value is the OBSERVED one and carries a unit, not a constant written
    // into the component.
    await waitFor(() => {
      expect(publishedHeight()).toBe('600px');
    });
  });

  it('never publishes a title of no height', () => {
    // `openTitle`, not `editableTitle`: this one has to read the variable in
    // the tick the title MOUNTS in, and `editableTitle` draws nothing until
    // the stage has been acquired — so there would be no title to have
    // measured zero, and the assertion would hold with the measuring taken
    // out altogether.
    openTitle('information-1');

    // Read synchronously: the title measures zero here, and a zero published
    // would pull the section list back up level with the top of the column —
    // the fault this exists to fix — for as long as the zero stood. The
    // stylesheet's starting value holds instead, so the variable resolves.
    expect(publishedHeight()).not.toBe('0px');
  });

  it('takes the value away again when the editor goes', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      ...editableTitle,
    });

    await waitFor(() => {
      expect(publishedHeight()).toBe('600px');
    });

    // Every other route lays out no title at all, so the value must not
    // outlive this one and pad a column that has nothing above it.
    await harness.cancel();

    expect(publishedHeight()).toBe('');
  });
});
