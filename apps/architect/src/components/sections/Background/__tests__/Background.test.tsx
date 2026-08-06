import { fireEvent, screen } from '@testing-library/react';
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

describe('Background', () => {
  it('switches to the image type and clears the concentric-circle fields', () => {
    const stage = {
      id: 'sociogram-1',
      label: 'Sociogram',
      type: 'Sociogram',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 4, skewedTowardCenter: true },
      prompts: [],
    } satisfies Stage;

    const { getFormValues } = renderStageForm({
      committedStage: asStage(stage),
      children: (
        <Background
          stagePath="stages[0]"
          stagePosition={0}
          interfaceType="Sociogram"
        />
      ),
    });

    fireEvent.click(screen.getByRole('option', { name: /^Image/ }));

    const values = getFormValues() as unknown as {
      background?: Record<string, unknown>;
    };
    expect(values.background?.concentricCircles).toBeUndefined();
    expect(values.background?.skewedTowardCenter).toBeUndefined();
  });
});
