import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

vi.mock('redux-form', () => ({
  FormSection: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('~/components/EditorLayout', () => ({
  Row: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Section: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('~/components/IssueAnchor', () => ({
  default: () => null,
}));

vi.mock('~/components/Form/ValidatedField', () => ({
  default: ({
    name,
    componentProps,
  }: {
    name: string;
    componentProps?: { label?: string };
  }) => <div data-testid={`field-${name}`}>{componentProps?.label}</div>,
}));

vi.mock('~/components/Form/Fields/NativeSelect', () => ({
  default: () => <div data-testid="native-select" />,
}));

import BoundaryOptions from '../BoundaryOptions';

const renderSection = () => {
  const store = configureStore({ reducer: { noop: () => ({}) } });
  return render(
    <Provider store={store}>
      <BoundaryOptions
        form="edit-stage"
        stagePath={null}
        interfaceType="FamilyPedigree"
      />
    </Provider>,
  );
};

describe('BoundaryOptions', () => {
  it('renders a field for requireGrandparents', () => {
    renderSection();
    expect(screen.getByTestId('field-requireGrandparents')).toBeDefined();
  });

  it('renders a field for requireChildrenContributors', () => {
    renderSection();
    expect(
      screen.getByTestId('field-requireChildrenContributors'),
    ).toBeDefined();
  });

  it('labels the grandparents field correctly', () => {
    renderSection();
    expect(
      screen.getByTestId('field-requireGrandparents').textContent,
    ).toContain('Require Grandparents');
  });

  it('labels the children contributors field correctly', () => {
    renderSection();
    expect(
      screen.getByTestId('field-requireChildrenContributors').textContent,
    ).toContain('Require Children Contributors');
  });
});
