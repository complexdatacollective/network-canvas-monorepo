import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
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
