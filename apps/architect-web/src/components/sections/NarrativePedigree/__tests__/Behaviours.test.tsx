import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

vi.mock('redux-form', () => ({
  Field: ({
    name,
    label,
  }: {
    name: string;
    label?: string;
    component: unknown;
  }) => (
    <div data-testid={`field-${name}`}>{label && <span>{label}</span>}</div>
  ),
  FormSection: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('~/components/EditorLayout', () => ({
  Row: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Section: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title: string;
  }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

vi.mock('~/components/Form/Fields', () => ({
  Toggle: () => <div data-testid="toggle" />,
}));

vi.mock('../IssueAnchor', () => ({
  default: () => null,
}));

vi.mock('../../IssueAnchor', () => ({
  default: () => null,
}));

import Behaviours from '../Behaviours';

const renderSection = () => {
  const store = configureStore({ reducer: { noop: () => ({}) } });
  return render(
    <Provider store={store}>
      <Behaviours
        form="edit-stage"
        stagePath={null}
        interfaceType="NarrativePedigree"
      />
    </Provider>,
  );
};

describe('Behaviours', () => {
  it('renders the Behaviours section title', () => {
    renderSection();
    expect(screen.getByText('Behaviours')).toBeDefined();
  });

  it('renders the allowFocalReselection field', () => {
    renderSection();
    expect(screen.getByTestId('field-allowFocalReselection')).toBeDefined();
  });

  it('labels the allowFocalReselection field correctly', () => {
    renderSection();
    const field = screen.getByTestId('field-allowFocalReselection');
    expect(field.textContent).toContain(
      'Allow the participant to change the focal position',
    );
  });
});
