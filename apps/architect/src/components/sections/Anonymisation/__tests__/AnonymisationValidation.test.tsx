import { act, fireEvent, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

import AnonymisationValidation from '../AnonymisationValidation';

beforeAll(() => {
  // fresco-ui's default `onSubmitInvalid` scrolls the first invalid field
  // into view; jsdom implements no scrolling (see ArchitectField.test.tsx).
  Element.prototype.scrollTo ??= () => undefined;
});

const sectionProps = {
  stagePath: 'stages[0]',
  stagePosition: 0,
  interfaceType: 'Anonymisation',
} as const;

describe('AnonymisationValidation', () => {
  it('stays collapsed with no rules and no sync error', () => {
    renderStageForm({
      committedStage: asStage({ id: 'stage-1', type: 'Anonymisation' }),
      children: <AnonymisationValidation {...sectionProps} />,
    });

    expect(
      screen.queryByRole('group', { name: 'Limits' }),
    ).not.toBeInTheDocument();
  });

  it('opens with an existing rule on the committed stage', () => {
    renderStageForm({
      committedStage: asStage({
        id: 'stage-1',
        type: 'Anonymisation',
        validation: { minLength: 8 },
      }),
      children: <AnonymisationValidation {...sectionProps} />,
    });

    expect(screen.getByRole('group', { name: 'Limits' })).toBeInTheDocument();
  });

  it('stays collapsed when an unregistered validation field receives an error', () => {
    const { getStoreApi } = renderStageForm({
      committedStage: asStage({ id: 'stage-1', type: 'Anonymisation' }),
      children: <AnonymisationValidation {...sectionProps} />,
    });

    expect(
      screen.queryByRole('group', { name: 'Limits' }),
    ).not.toBeInTheDocument();

    // Collapsed fields are deliberately unregistered and excluded from
    // validation under the shared Section contract.
    act(() => {
      getStoreApi()
        .getState()
        .setErrors({
          formErrors: [],
          fieldErrors: { validation: ['Contradictory rules'] },
        });
    });

    expect(
      screen.queryByRole('group', { name: 'Limits' }),
    ).not.toBeInTheDocument();
  });

  it('offers only the length limits', () => {
    renderStageForm({
      committedStage: asStage({
        id: 'stage-1',
        type: 'Anonymisation',
        validation: { minLength: 8 },
      }),
      children: <AnonymisationValidation {...sectionProps} />,
    });

    expect(
      screen.queryByRole('group', { name: 'Requirements' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Compare to another attribute' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Minimum length', hidden: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Maximum length', hidden: true }),
    ).toBeInTheDocument();
  });
});

// The stage editor reinitializes in place when the edited stage changes, and
// its sections are keyed by interface type and position in the section list —
// so moving between two Anonymisation stages keeps this very component
// instance mounted. The passphrase is not a codebook variable, so the rule
// list has no variable id to scope its uncommitted row state by; without stage
// identity (`scopeId`) that state would outlive the stage it was typed into,
// and take precedence over the next stage's saved rules.
describe('AnonymisationValidation across a stage change', () => {
  it('leaves no rule state behind on the next Anonymisation stage', () => {
    const { getStoreApi, renderTree } = renderStageForm({
      committedStage: asStage({
        id: 'stage-1',
        type: 'Anonymisation',
        validation: { minLength: 4 },
      }),
      children: <AnonymisationValidation {...sectionProps} />,
    });

    // An edit still in flight, plus a rule switched on but not yet given a
    // value: both live only in the rule list's own state.
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Minimum length' }),
      { target: { value: '9' } },
    );
    fireEvent.click(
      screen.getByRole('switch', { name: 'Maximum length', hidden: true }),
    );

    // The reinitialize: the next stage's saved rules are written into the form
    // while the section stays mounted, and the section is re-rendered for its
    // new slot.
    act(() => {
      getStoreApi().getState().setFieldValue('validation', { minLength: 2 });
    });
    renderTree(
      <AnonymisationValidation
        stagePath="stages[1]"
        stagePosition={1}
        interfaceType="Anonymisation"
      />,
    );

    expect(
      screen.getByRole('spinbutton', { name: 'Minimum length' }),
    ).toHaveValue(2);
    expect(
      screen.getByRole('switch', { name: 'Maximum length', hidden: true }),
    ).not.toBeChecked();
  });
});
