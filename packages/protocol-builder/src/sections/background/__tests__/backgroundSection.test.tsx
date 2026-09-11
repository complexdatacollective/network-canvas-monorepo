import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { background } from '../background.tsx';
import {
  CANVAS_IMAGE_ID,
  CANVAS_IMAGE_NAME,
  canvasImageAssets,
  stageWithImageBackground,
} from './canvasImageFixture.ts';

const Background = background();

const openCircles = () => ({
  stageId: 'sociogram-1' as const,
  sections: <Background />,
  assets: canvasImageAssets,
});

const openImage = () => ({
  stage: stageWithImageBackground('sociogram-1'),
  sections: <Background />,
  assets: canvasImageAssets,
});

/** What the stage holds behind its nodes, read as tolerantly as the editor does. */
const backgroundOf = (
  stage: Record<string, unknown>,
): Record<string, unknown> =>
  typeof stage.background === 'object' && stage.background !== null
    ? (stage.background as Record<string, unknown>)
    : {};

describe('what the participant sees behind the nodes', () => {
  it('saves the circles background it opened, unchanged', async () => {
    const harness = renderStageEditor(openCircles());

    // The stage's name, the type it arranges, what it asks and how it arranges
    // belong to sections this mount does not include.
    await harness.roundTrip({
      unowned: ['label', 'subject', 'prompts', 'behaviours'],
    });
  });

  it('saves the image background it opened, unchanged', async () => {
    const harness = renderStageEditor(openImage());

    expect(
      await screen.findByRole('button', { name: 'Change the image' }),
    ).toBeVisible();
    await harness.roundTrip({
      unowned: ['label', 'subject', 'prompts', 'behaviours'],
    });
  });

  it('changes the number of circles the researcher asked for', async () => {
    const harness = renderStageEditor(openCircles());

    const circles = await screen.findByRole('spinbutton', {
      name: 'Number of concentric circles',
    });
    await harness.user.clear(circles);
    await harness.user.type(circles, '2');

    const saved = await harness.submit();
    expect(backgroundOf(saved?.stageDocument ?? {})).toEqual({
      concentricCircles: 2,
      skewedTowardCenter: true,
    });
  });

  /**
   * A count typed with a fraction in it reaches the rule that refuses one.
   *
   * The box parsed with `Number.parseInt`, which stops at the decimal point,
   * so 2.5 became 2 before `Number.isInteger` was ever asked: the refusal the
   * researcher should have been given never fired, and the stage saved a
   * number of rings nobody entered. Both halves are asserted — the box still
   * showing what was typed, and the save refused in the section's own words —
   * because a field that simply blanked itself would also stop the save, and
   * would take the researcher's entry with it.
   */
  it('refuses a number of circles typed with a fraction, and keeps it on screen', async () => {
    const harness = renderStageEditor(openCircles());

    const circles = await screen.findByRole('spinbutton', {
      name: 'Number of concentric circles',
    });
    await harness.user.clear(circles);
    await harness.user.type(circles, '2.5');

    expect(circles).toHaveDisplayValue('2.5');
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'Enter the number of circles as a whole number of zero or more.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * And the other half of the same rule: zero rings is a canvas with none
   * drawn on it, which is allowed, and a negative count is not a number of
   * rings at all.
   */
  it('refuses a negative number of circles', async () => {
    const harness = renderStageEditor(openCircles());

    const circles = await screen.findByRole('spinbutton', {
      name: 'Number of concentric circles',
    });
    await harness.user.clear(circles);
    await harness.user.type(circles, '-1');

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'Enter the number of circles as a whole number of zero or more.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The schema refuses a background holding both kinds, so the keys belonging
   * to the kind being left have to go. A value merely left behind by an
   * unmounted field is replayed into the saved stage, and is then refused
   * against a path long after the researcher made the choice that created it.
   */
  it('leaves no trace of the circles when the background becomes an image', async () => {
    const harness = renderStageEditor(openCircles());

    await harness.user.click(
      await screen.findByRole('option', { name: /Image/ }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: CANVAS_IMAGE_NAME }),
    );

    const saved = await harness.submit();
    expect(backgroundOf(saved?.stageDocument ?? {})).toEqual({
      image: CANVAS_IMAGE_ID,
    });
  });

  it('leaves no trace of the image when the background becomes circles', async () => {
    const harness = renderStageEditor(openImage());

    await harness.user.click(
      await screen.findByRole('option', { name: /Concentric Circles/ }),
    );
    await harness.user.type(
      await screen.findByRole('spinbutton', {
        name: 'Number of concentric circles',
      }),
      '3',
    );

    const saved = await harness.submit();
    expect(backgroundOf(saved?.stageDocument ?? {})).toEqual({
      concentricCircles: 3,
    });
  });

  it('refuses to save a background that is neither', async () => {
    const harness = renderStageEditor(openImage());

    await harness.user.click(
      await screen.findByRole('option', { name: /Concentric Circles/ }),
    );

    expect(await harness.submit()).toBeNull();
  });

  /**
   * The researcher switches to an image, thinks better of it, and comes back.
   *
   * What must not happen is the circles being there again. The switch throws
   * the branch it leaves out of the stage rather than leaving it to the field
   * unmounting, so the way back finds an empty box — and a save from there is
   * refused rather than quietly writing the old count under a picture.
   */
  it('leaves the circles gone when the researcher switches away and back', async () => {
    const harness = renderStageEditor(openCircles());
    expect(
      await screen.findByRole('spinbutton', {
        name: 'Number of concentric circles',
      }),
    ).toHaveDisplayValue('4');

    await harness.user.click(
      await screen.findByRole('option', { name: /Image/ }),
    );
    await screen.findByRole('button', { name: 'Select an image' });
    await harness.user.click(
      await screen.findByRole('option', { name: /Concentric Circles/ }),
    );

    expect(
      await screen.findByRole('spinbutton', {
        name: 'Number of concentric circles',
      }),
    ).toHaveDisplayValue('');
    expect(await harness.submit()).toBeNull();
  });
});
