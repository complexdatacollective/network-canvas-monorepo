import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

import FramingConfig from '../FramingConfig';

const renderSection = (committedStage: Record<string, unknown>) =>
  renderStageForm({
    committedStage: asStage(committedStage),
    children: (
      <FramingConfig
        stagePath={null}
        stagePosition={0}
        interfaceType="FamilyPedigree"
      />
    ),
  });

describe('FramingConfig', () => {
  it('selects the committed mode in the radio group', () => {
    renderSection({ framing: { mode: 'fixed', value: 'gamete' } });
    expect(screen.getByRole('radio', { name: 'Fixed framing' })).toBeChecked();
  });

  it('shows the terminology select when mode is fixed', () => {
    renderSection({ framing: { mode: 'fixed', value: 'gamete' } });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('does not show the terminology select when mode is participantChoice', () => {
    renderSection({ framing: { mode: 'participantChoice' } });
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('clears the framing value from the saved output when switched to participantChoice', () => {
    const view = renderSection({
      framing: { mode: 'fixed', value: 'gendered' },
    });

    fireEvent.click(
      screen.getByRole('radio', { name: 'Let the participant choose' }),
    );

    expect(view.getFormValues().framing).toEqual({
      mode: 'participantChoice',
    });
  });

  it('defaults the terminology to gamete-based when switched back to fixed', () => {
    const view = renderSection({ framing: { mode: 'participantChoice' } });

    fireEvent.click(screen.getByRole('radio', { name: 'Fixed framing' }));

    expect(view.getFormValues().framing).toEqual({
      mode: 'fixed',
      value: 'gamete',
    });
  });

  it('updates the saved output when a different terminology is selected', () => {
    const view = renderSection({
      framing: { mode: 'fixed', value: 'gamete' },
    });

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'gendered' },
    });

    expect(view.getFormValues().framing).toEqual({
      mode: 'fixed',
      value: 'gendered',
    });
  });
});
