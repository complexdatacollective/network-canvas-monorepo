import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
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
   *
   * Leaving the CIRCLES behind is a different thing, and it stays. It is an
   * edit the researcher made with no staged resource behind it, so nothing
   * holds it back and it reached the host when it happened — the same rule a
   * capability switched off by hand follows (`resetCarriesItsCause`: "still
   * sends a switch-off that has no staged file behind it"). A cancel drops
   * what was WITHHELD; it is not an undo of everything the session did.
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
    // The switch, and nothing that could name the file that is gone.
    expect(
      harness.pendingCommands().flatMap((batch) => [...batch.commands]),
    ).toEqual([{ op: 'unset', key: 'background' }]);
  });
});

/**
 * Leaving a background behind is a decision the SESSION holds, not a clear the
 * form makes on its own.
 *
 * `useDiscardStageValues` is the one seam that decision goes through, and the
 * three claims below are what a form-only clear cannot make: the branch leaves
 * the draft as one edit, it is still gone from the draft after the researcher
 * has switched away and back, and one undo brings back the values AND the mode
 * they belong to.
 *
 * The switch back is asked about the DRAFT rather than about the control,
 * because the control cannot fail it: a cleared field parks its emptiness in
 * the form store, which outlives the field and is what a re-mount is restored
 * from. That record is only as good as the form holding it, and the form is
 * not where the stage lives — the draft is, and it is the draft a re-opened
 * editor, a live-applying host and the session's own undo all read.
 *
 * No cause travels with the discard, because this stage has no discriminant
 * field to carry: the two backgrounds are told apart by which of their own
 * keys are present, so the unsets are the switch.
 */
describe('the batch a background switch makes', () => {
  const draftOf = (harness: StageEditorHarness) =>
    harness.session.getSnapshot().editedSection.fields;

  const commandsOf = (harness: StageEditorHarness) =>
    harness.pendingCommands().flatMap((batch) => [...batch.commands]);

  const chooseBackground = async (
    harness: StageEditorHarness,
    name: RegExp,
  ) => {
    await harness.user.click(await screen.findByRole('option', { name }));
  };

  const circlesBox = () =>
    screen.findByRole('spinbutton', { name: 'Number of concentric circles' });

  it('throws the whole circles branch out of the draft in one batch', async () => {
    const harness = renderStageEditor(openCircles());
    await circlesBox();

    await chooseBackground(harness, /Image/);

    await waitFor(() => expect(harness.pendingCommands()).toHaveLength(1));
    // Both circle keys and the container they emptied, which is what the save
    // would have had to unset anyway.
    expect(commandsOf(harness)).toEqual([{ op: 'unset', key: 'background' }]);
    expect(draftOf(harness)).not.toHaveProperty('background');
  });

  /**
   * The researcher switches to an image, thinks better of it, and comes back.
   *
   * What must not happen is the circles being there again — and "there" means
   * in the draft, which is what the next reader of this stage is answered
   * from. A form-only clear leaves the old count sitting in it while the empty
   * box on screen says otherwise, and the two disagree until something reads
   * the draft.
   */
  it('leaves the circles gone from the draft when the researcher switches away and back', async () => {
    const harness = renderStageEditor(openCircles());
    expect(await circlesBox()).toHaveDisplayValue('4');

    await chooseBackground(harness, /Image/);
    await screen.findByRole('button', { name: 'Select an image' });
    await chooseBackground(harness, /Concentric circles/);

    expect(draftOf(harness)).not.toHaveProperty('background');
    // And no second batch for the way back. This section's reset carries no
    // cause — the two backgrounds are told apart by their own keys, so the
    // unsets ARE the switch — and the image branch was never filled in, so the
    // return has nothing whatever to say and spends no step of the session's
    // history. A reset that has a cause sends it either way.
    expect(commandsOf(harness)).toEqual([{ op: 'unset', key: 'background' }]);
    expect(await circlesBox()).toHaveDisplayValue('');
  });

  /**
   * Undo is the researcher's way back from a background they did not mean, and
   * it has to bring back BOTH halves: the keys that described the old
   * background, and the mode the section is showing. One batch is what makes
   * that a single step, and the mode follows because the form was re-seeded
   * from a draft this form did not write.
   */
  it('comes back whole, mode included, when the session undoes it', async () => {
    const harness = renderStageEditor(openCircles());
    await circlesBox();
    await chooseBackground(harness, /Image/);
    await screen.findByRole('button', { name: 'Select an image' });
    // What the undo below has to find. A clear that never reached the session
    // leaves the circles sitting in the draft, and the assertions after the
    // undo would then be describing a background nothing ever took away.
    await waitFor(() =>
      expect(draftOf(harness)).not.toHaveProperty('background'),
    );

    act(() => {
      harness.session.undo();
    });

    await waitFor(() =>
      expect(draftOf(harness).background).toEqual({
        concentricCircles: 4,
        skewedTowardCenter: true,
      }),
    );
    // And on screen: the picker is gone, and the count is the one the undo
    // restored rather than an empty box over a draft that has it.
    expect(await circlesBox()).toHaveDisplayValue('4');
    expect(
      screen.queryByRole('button', { name: 'Select an image' }),
    ).not.toBeInTheDocument();
  });
});
