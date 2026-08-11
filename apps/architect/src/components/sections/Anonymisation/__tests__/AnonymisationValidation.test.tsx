import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { reducer as formReducer, reduxForm } from 'redux-form';
import { describe, expect, it } from 'vitest';

import AnonymisationValidation from '../AnonymisationValidation';

const FORM_NAME = 'anonymisation-validation-test';

// The section reads only `form`; the rest of StageEditorSectionProps is the
// stage-editor context every section receives.
const sectionProps = {
  form: FORM_NAME,
  stagePath: 'stages[0]',
  stagePosition: 0,
  interfaceType: 'Anonymisation',
} as const;

const Harness = reduxForm({ form: FORM_NAME })(() => (
  <AnonymisationValidation {...sectionProps} />
));

// A collapsed toggleable Section unmounts its children, and redux-form only
// fails a submit over errors on REGISTERED fields — so a sync error keyed at
// `validation` while the section is shut would be silently inert, exactly the
// bug ValidationSection was fixed for. The Anonymisation form ships no such
// validate today; this harness supplies one so the wiring is pinned rather
// than left accidentally safe.
const renderSection = ({ withError }: { withError: boolean }) => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  const ValidatingHarness = reduxForm({
    form: FORM_NAME,
    validate: () => (withError ? { validation: 'Contradictory rules' } : {}),
  })(() => <AnonymisationValidation {...sectionProps} />);

  const Component = withError ? ValidatingHarness : Harness;

  render(
    <Provider store={store}>
      <Component />
    </Provider>,
  );
};

// Audit sweep: AnonymisationValidation had ValidationSection's pre-fix shape —
// a toggleable Section keyed only on `startExpanded={!!hasValidation}` — so
// the class is closed here too rather than left depending on the absence of a
// form-level validate.
describe('AnonymisationValidation', () => {
  it('stays collapsed with no rules and no sync error', () => {
    renderSection({ withError: false });

    expect(
      screen.queryByRole('group', { name: 'Limits' }),
    ).not.toBeInTheDocument();
  });

  it('opens while a validation sync error stands', () => {
    renderSection({ withError: true });

    expect(screen.getByRole('group', { name: 'Limits' })).toBeInTheDocument();
  });

  it('offers only the length limits', () => {
    renderSection({ withError: true });

    expect(
      screen.queryByRole('group', { name: 'Requirements' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Compare to another variable' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Minimum length' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Maximum length' }),
    ).toBeInTheDocument();
  });
});

// The stage editor form reinitializes in place when the edited stage changes
// (`enableReinitialize`), and its sections are keyed by interface type and
// position in the section list — so moving between two Anonymisation stages
// keeps this very component instance mounted. The passphrase is not a codebook
// variable, so the rule list has no variable id to scope its uncommitted row
// state by; without stage identity that state would outlive the stage it was
// typed into, and take precedence over the next stage's saved rules.
type StageProps = { stageIndex: number };

const StageHarness = reduxForm<Record<string, unknown>, StageProps>({
  form: FORM_NAME,
  enableReinitialize: true,
})(({ stageIndex }: StageProps) => (
  <AnonymisationValidation
    form={FORM_NAME}
    stagePath={`stages[${stageIndex}]`}
    stagePosition={stageIndex}
    interfaceType="Anonymisation"
  />
));

describe('AnonymisationValidation across a stage change', () => {
  it('leaves no rule state behind on the next Anonymisation stage', () => {
    const store = configureStore({
      reducer: { form: formReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });

    const stage = (stageIndex: number, validation: Record<string, number>) => (
      <Provider store={store}>
        <StageHarness stageIndex={stageIndex} initialValues={{ validation }} />
      </Provider>
    );

    const { rerender } = render(stage(0, { minLength: 4 }));

    // An edit still in flight, plus a rule switched on but not yet given a
    // value: both live only in the rule list's own state.
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Minimum length' }),
      {
        target: { value: '9' },
      },
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Maximum length' }));

    rerender(stage(1, { minLength: 2 }));

    expect(
      screen.getByRole('spinbutton', { name: 'Minimum length' }),
    ).toHaveValue(2);
    expect(
      screen.getByRole('switch', { name: 'Maximum length' }),
    ).not.toBeChecked();
  });
});
