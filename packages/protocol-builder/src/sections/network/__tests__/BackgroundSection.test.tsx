import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import BackgroundSection from '../BackgroundSection.tsx';
import {
  CANVAS_IMAGE_ID,
  CANVAS_IMAGE_NAME,
  canvasImageAssets,
  stageWithImageBackground,
} from './canvasFixtures.ts';

const background = <BackgroundSection allowsImage />;

const openCircles = () => ({
  stageId: 'narrative-1',
  sections: background,
  assets: canvasImageAssets,
});

const openImage = () => ({
  stage: stageWithImageBackground('narrative-1'),
  sections: background,
  assets: canvasImageAssets,
});

const backgroundOf = (
  stage: Record<string, unknown>,
): Record<string, unknown> =>
  typeof stage.background === 'object' && stage.background !== null
    ? (stage.background as Record<string, unknown>)
    : {};

describe('what the participant sees behind the nodes', () => {
  it('saves the circles background it opened, unchanged', async () => {
    const harness = renderStageEditor(openCircles());

    // The stage's name, the type it draws, the views it offers and how it
    // behaves belong to sections this mount does not include.
    await harness.roundTrip({
      unowned: ['label', 'subject', 'presets', 'behaviours'],
    });
  });

  it('saves the image background it opened, unchanged', async () => {
    const harness = renderStageEditor(openImage());

    expect(
      await screen.findByRole('button', { name: 'Change the image' }),
    ).toBeVisible();
    await harness.roundTrip({
      unowned: ['label', 'subject', 'presets', 'behaviours'],
    });
  });

  it('offers no choice to a canvas that cannot draw an image', async () => {
    renderStageEditor({
      stageId: 'narrative-1',
      sections: <BackgroundSection />,
    });

    expect(
      await screen.findByRole('spinbutton', {
        name: 'Number of concentric circles',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('listbox', { name: 'Background type' }),
    ).not.toBeInTheDocument();
  });

  it('changes the number of circles the researcher asked for', async () => {
    const harness = renderStageEditor(openCircles());

    const circles = await screen.findByRole('spinbutton', {
      name: 'Number of concentric circles',
    });
    await harness.user.clear(circles);
    await harness.user.type(circles, '2');

    const request = await harness.submit();
    expect(backgroundOf(request?.stageDocument ?? {})).toEqual({
      concentricCircles: 2,
      skewedTowardCenter: true,
    });
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

    const request = await harness.submit();
    expect(backgroundOf(request?.stageDocument ?? {})).toEqual({
      image: CANVAS_IMAGE_ID,
    });
  });

  it('leaves no trace of the image when the background becomes circles', async () => {
    const harness = renderStageEditor(openImage());

    await harness.user.click(
      await screen.findByRole('option', { name: /Concentric circles/ }),
    );
    await harness.user.type(
      await screen.findByRole('spinbutton', {
        name: 'Number of concentric circles',
      }),
      '3',
    );

    const request = await harness.submit();
    expect(backgroundOf(request?.stageDocument ?? {})).toEqual({
      concentricCircles: 3,
    });
  });

  it('refuses to save a background that is neither', async () => {
    const harness = renderStageEditor(openImage());

    await harness.user.click(
      await screen.findByRole('option', { name: /Concentric circles/ }),
    );

    expect(await harness.submit()).toBeNull();
  });

  /**
   * An import is held outside the protocol until the stage is finished, so
   * abandoning the edit has to leave the host holding nothing — and no command
   * waiting to name what it no longer holds.
   */
  it('leaves nothing imported behind when the edit is abandoned', async () => {
    const harness = renderStageEditor(openCircles());

    await harness.user.click(
      await screen.findByRole('option', { name: /Image/ }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    await harness.user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
    );
    await waitFor(() =>
      expect(harness.session.getSnapshot().stagedResources).not.toHaveLength(0),
    );

    await harness.cancel();

    expect(harness.session.getSnapshot().stagedResources).toEqual([]);
    expect(harness.gateway.getStagingResidue()).toEqual([]);
    expect(harness.pendingCommands()).toEqual([]);
  });
});
