import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

const changeForm = vi.fn();

// Capture the onChange handler that ExternalDataSource wires onto its
// data-source field so we can drive handleChangeDataSource directly.
const captured: { onChange?: () => void } = {};

vi.mock('redux-form', () => ({
  change: (form: string, field: string, value: unknown) => ({
    type: 'redux-form/CHANGE',
    form,
    field,
    value,
  }),
}));

vi.mock('react-redux', async () => {
  const actual =
    await vi.importActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    // Inject our spy as the bound `changeForm` prop instead of the real
    // redux-form `change` dispatcher.
    connect:
      () =>
      (Component: React.ComponentType<Record<string, unknown>>) =>
      (props: Record<string, unknown>) => (
        <Component {...props} changeForm={changeForm} />
      ),
  };
});

vi.mock('../../enhancers/withDisabledSubjectRequired', () => ({
  default: (Component: React.ComponentType) => Component,
}));

vi.mock('../../enhancers/withSubject', () => ({
  default: (Component: React.ComponentType) => Component,
}));

vi.mock('../../Form/Fields/DataSource', () => ({
  default: () => <div data-testid="data-source" />,
}));

vi.mock('../../Form/ValidatedField', () => ({
  default: ({ onChange }: { onChange?: () => void }) => {
    captured.onChange = onChange;
    return <div data-testid="validated-field" />;
  },
}));

vi.mock('../../IssueAnchor', () => ({
  default: () => <div data-testid="issue-anchor" />,
}));

vi.mock('~/components/EditorLayout', () => ({
  Row: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Section: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import ExternalDataSource from '../ExternalDataSource';

const renderSection = () => {
  const store = configureStore({ reducer: { noop: () => ({}) } });
  return render(
    <Provider store={store}>
      {/* @ts-expect-error -- StageEditorSectionProps are not needed for this handler-focused test */}
      <ExternalDataSource />
    </Provider>,
  );
};

describe('ExternalDataSource handleChangeDataSource', () => {
  it('resets cardOptions, sortOptions, and searchOptions when the data source changes', () => {
    changeForm.mockClear();

    renderSection();

    const { onChange } = captured;
    expect(onChange).toBeTypeOf('function');
    onChange?.();

    // Exact call list: cardOptions/sortOptions reset to {} so stale
    // matchProperties referencing the previous source's columns are dropped;
    // searchOptions resets to null (not {}) because a truthy {} would
    // auto-expand the optional Search Options section and block save with
    // its now-mounted required fields (see handleChangeDataSource).
    expect(changeForm.mock.calls).toEqual([
      ['edit-stage', 'cardOptions', {}],
      ['edit-stage', 'sortOptions', {}],
      ['edit-stage', 'searchOptions', null],
    ]);
  });
});
