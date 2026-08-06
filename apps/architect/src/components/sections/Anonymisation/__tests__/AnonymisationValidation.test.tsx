import { act, screen } from '@testing-library/react';
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

// Audit sweep: AnonymisationValidation had ValidationSection's pre-fix shape —
// a toggleable Section keyed only on `startExpanded={!!hasValidation}` — so
// the class is closed here too rather than left depending on the absence of a
// forced-open sync error.
describe('AnonymisationValidation', () => {
  it('stays collapsed with no rules and no sync error', () => {
    renderStageForm({
      committedStage: asStage({ id: 'stage-1', type: 'Anonymisation' }),
      children: <AnonymisationValidation {...sectionProps} />,
    });

    expect(
      screen.queryByRole('button', { name: 'Add new' }),
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

    expect(screen.getByRole('button', { name: 'Add new' })).toBeInTheDocument();
  });

  it('opens while a validation sync error stands', () => {
    const { getStoreApi } = renderStageForm({
      committedStage: asStage({ id: 'stage-1', type: 'Anonymisation' }),
      children: <AnonymisationValidation {...sectionProps} />,
    });

    expect(
      screen.queryByRole('button', { name: 'Add new' }),
    ).not.toBeInTheDocument();

    // A collapsed toggleable Section unmounts its children, and
    // `validateForm` only fails a submit over errors on REGISTERED fields —
    // so a sync error keyed at `validation` while the section is shut would
    // be silently inert without the forced expansion this pins.
    act(() => {
      getStoreApi()
        .getState()
        .setErrors({
          formErrors: [],
          fieldErrors: { validation: ['Contradictory rules'] },
        });
    });

    expect(screen.getByRole('button', { name: 'Add new' })).toBeInTheDocument();
  });
});
