import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

// Strip all connect-based HOCs — pass props straight through
vi.mock('react-redux', async () => {
  const actual =
    await vi.importActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    connect:
      () =>
      (Component: React.ComponentType<Record<string, unknown>>) =>
      (props: Record<string, unknown>) =>
        <Component {...props} />,
  };
});

// withCreateVariableHandlers is a compose of connect + withHandlers — stub it
vi.mock('~/components/enhancers/withCreateVariableHandler', () => ({
  default: (Component: React.ComponentType<Record<string, unknown>>) =>
    (props: Record<string, unknown>) => (
      <Component
        {...props}
        handleCreateVariable={vi.fn()}
        handleDeleteVariable={vi.fn()}
      />
    ),
}));

// Lightweight Section/Row stubs that render their children
vi.mock('~/components/EditorLayout', () => ({
  Row: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Section: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title?: string;
  }) => (
    <div>
      {title && <h2>{title}</h2>}
      {children}
    </div>
  ),
}));

// VariablePicker stub that lists options as data-testid items
vi.mock(
  '~/components/Form/Fields/VariablePicker/VariablePicker',
  () => ({
    default: ({
      options = [],
    }: {
      options?: Array<{ value: string; label: string }>;
    }) => (
      <ul data-testid="variable-picker">
        {options.map(({ value, label }) => (
          <li key={value} data-testid={`option-${value}`}>
            {label}
          </li>
        ))}
      </ul>
    ),
  }),
);

vi.mock('~/components/Form/ValidatedField', () => ({
  default: ({
    componentProps,
    component: Component,
  }: {
    name: string;
    componentProps: Record<string, unknown>;
    component: React.ComponentType<Record<string, unknown>>;
  }) => <Component {...componentProps} />,
}));

vi.mock('~/components/IssueAnchor', () => ({
  default: () => null,
}));

import ComposerLayoutVariable from '../ComposerLayoutVariable';

const LAYOUT_VAR_OPTIONS = [
  { value: 'var-1', label: 'Position', type: 'layout' },
  { value: 'var-2', label: 'Coordinates', type: 'layout' },
];

const renderSection = (
  layoutVariablesForSubject = LAYOUT_VAR_OPTIONS,
  entity = 'node',
  type = 'Person',
) => {
  const store = configureStore({ reducer: { noop: () => ({}) } });

  return render(
    <Provider store={store}>
      <ComposerLayoutVariable
        form="edit-stage"
        stagePath="stages[0]"
        interfaceType="NetworkComposer"
        entity={entity}
        type={type}
        layoutVariablesForSubject={layoutVariablesForSubject}
      />
    </Provider>,
  );
};

describe('ComposerLayoutVariable', () => {
  it('renders a section with "Node positions" title', () => {
    renderSection();
    expect(
      screen.getByRole('heading', { name: /node positions/i }),
    ).toBeDefined();
  });

  it('renders a layout-variable picker bound to the layoutVariable field', () => {
    renderSection();
    expect(screen.getByTestId('variable-picker')).toBeDefined();
  });

  it('lists the layout variables for the subject as picker options', () => {
    renderSection();
    expect(screen.getByTestId('option-var-1')).toBeDefined();
    expect(screen.getByTestId('option-var-2')).toBeDefined();
  });

  it('renders no options when the subject has no layout variables', () => {
    renderSection([]);
    const items = screen.queryAllByTestId(/^option-/);
    expect(items).toHaveLength(0);
  });
});
