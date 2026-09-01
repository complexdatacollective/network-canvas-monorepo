import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Stage,
} from '@codaco/protocol-validation';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

import Background, { allowsBackgroundImage } from '../Background';

describe('allowsBackgroundImage', () => {
  it('allows a background image for Narrative stages', () => {
    expect(allowsBackgroundImage('Narrative')).toBe(true);
  });

  it('allows a background image for Sociogram stages', () => {
    expect(allowsBackgroundImage('Sociogram')).toBe(true);
  });

  it('allows a background image for NetworkComposer stages', () => {
    expect(allowsBackgroundImage('NetworkComposer')).toBe(true);
  });

  it('does not enable background images for unrelated stages', () => {
    expect(allowsBackgroundImage('Information')).toBe(false);
  });

  it('does not mark a legacy Sociogram dirty when the toggle supplies its false default', () => {
    const stage = {
      id: 'sociogram-1',
      label: 'Sociogram',
      type: 'Sociogram',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 4 },
      prompts: [
        {
          id: 'prompt-1',
          text: 'Place the people you named.',
          layout: {
            layoutVariable: asEntityAttributeReference('layout'),
          },
        },
      ],
    } satisfies Stage;

    const { getPresent } = renderStageForm({
      committedStage: asStage(stage),
      children: (
        <Background
          stagePath="stages[0]"
          stagePosition={0}
          interfaceType="Sociogram"
        />
      ),
    });

    // The toggle's `initialValue={false}` default registers the field at its
    // resting value rather than performing a write, so it must not appear as
    // a change against the baseline the bridge seeded on mount.
    const present = getPresent() as unknown as {
      background: { skewedTowardCenter?: boolean };
    };
    expect(present.background.skewedTowardCenter).toBe(false);
  });
});

const circlesStage = {
  id: 'sociogram-1',
  label: 'Sociogram',
  type: 'Sociogram',
  subject: { entity: 'node', type: 'person' },
  background: { concentricCircles: 4, skewedTowardCenter: true },
  prompts: [],
} satisfies Stage;

const renderBackground = () =>
  renderStageForm({
    committedStage: asStage(circlesStage),
    children: (
      <Background
        stagePath="stages[0]"
        stagePosition={0}
        interfaceType="Sociogram"
      />
    ),
  });

const backgroundValues = (values: unknown) =>
  (values as { background?: Record<string, unknown> }).background;

const selectedBackgroundType = () =>
  screen
    .getAllByRole('option')
    .find((option) => option.getAttribute('aria-selected') === 'true')
    ?.textContent;

describe('Background', () => {
  it('switches to the image type and clears the concentric-circle fields', () => {
    const { getFormValues } = renderBackground();

    fireEvent.click(screen.getByRole('option', { name: /^Image/ }));

    const values = backgroundValues(getFormValues());
    expect(values?.concentricCircles).toBeUndefined();
    expect(values?.skewedTowardCenter).toBeUndefined();
  });

  it('puts the concentric circles back on screen when the switch to Image is undone', () => {
    const { getFormValues, getHistory } = renderBackground();

    fireEvent.click(screen.getByRole('option', { name: /^Image/ }));
    expect(selectedBackgroundType()).toMatch(/^Image/);

    act(() => {
      getHistory().undo();
    });

    // Undo restores LEAVES; which group is on screen is local state. Without
    // the restore effect the image picker stays mounted, the restored circle
    // values sit unregistered in dormant storage, and the values the save and
    // the Preview mirror read report a background with nothing in it at all.
    expect(selectedBackgroundType()).toMatch(/^Concentric Circles/);
    expect(backgroundValues(getFormValues())).toEqual({
      concentricCircles: 4,
      skewedTowardCenter: true,
    });
  });

  it('redoes back into image mode without branching the timeline', () => {
    const { getFormValues, getHistory, snapshots, store } = renderBackground();

    fireEvent.click(screen.getByRole('option', { name: /^Image/ }));

    act(() => {
      getHistory().undo();
    });
    expect(getHistory().canRedo).toBe(true);

    act(() => {
      getHistory().redo();
    });

    expect(selectedBackgroundType()).toMatch(/^Image/);
    const values = backgroundValues(getFormValues());
    expect(values).not.toHaveProperty('concentricCircles');
    expect(values).toHaveProperty('image');

    // The restored form values have to agree with the entry that was restored,
    // or the next step's `flushPendingEdit` records the difference as a fresh
    // snapshot — which branches `future` and throws the redo away silently.
    // One snapshot total: the flush that committed the switch before undoing.
    expect(snapshots).toHaveLength(1);
    expect(store.getState().stageEditorDraft.history.future).toHaveLength(0);
    expect(getHistory().canUndo).toBe(true);
  });
});
