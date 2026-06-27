import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import { FOCAL_POSITIONS } from '@codaco/shared-consts';

vi.mock('redux-form', () => ({
  Field: ({
    name,
    options,
  }: {
    name: string;
    options?: { value: string; label: string }[];
    component: unknown;
  }) => (
    <div data-testid={`field-${name}`}>
      {options?.map((o) => (
        <span key={o.value} data-testid={`checkbox-option-${o.value}`}>
          {o.label}
        </span>
      ))}
    </div>
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

vi.mock('~/components/Form/ValidatedField', () => ({
  default: ({
    name,
    componentProps,
  }: {
    name: string;
    componentProps?: {
      label?: string;
      options?: { value: string; label: string }[];
    };
  }) => (
    <div data-testid={`field-${name}`}>
      {componentProps?.label && <span>{componentProps.label}</span>}
      {componentProps?.options?.map((o) => (
        <span key={o.value} data-testid={`option-${o.value}`}>
          {o.label}
        </span>
      ))}
    </div>
  ),
}));

vi.mock('~/components/IssueAnchor', () => ({
  default: () => null,
}));

import PresetFields from '../PresetFields';

const diseaseOptions = [
  { value: 'disease-1', label: 'Huntington Disease' },
  { value: 'disease-2', label: 'BRCA1' },
];

const renderFields = () => {
  const store = configureStore({ reducer: { noop: () => ({}) } });
  return render(
    <Provider store={store}>
      <PresetFields diseaseOptions={diseaseOptions} />
    </Provider>,
  );
};

describe('PresetFields', () => {
  it('renders the Preset Label section', () => {
    renderFields();
    expect(screen.getByText('Preset Label')).toBeDefined();
  });

  it('renders the label field', () => {
    renderFields();
    expect(screen.getByTestId('field-label')).toBeDefined();
  });

  it('renders the Diseases section', () => {
    renderFields();
    expect(screen.getByText('Diseases')).toBeDefined();
  });

  it('renders the diseases multi-select field with disease options', () => {
    renderFields();
    expect(screen.getByTestId('checkbox-option-disease-1')).toBeDefined();
    expect(screen.getByTestId('checkbox-option-disease-2')).toBeDefined();
  });

  it('renders the Focal Position section', () => {
    renderFields();
    expect(screen.getByText('Focal Position')).toBeDefined();
  });

  it('renders all FOCAL_POSITIONS as options', () => {
    renderFields();
    const focalField = screen.getByTestId('field-focal');
    for (const position of FOCAL_POSITIONS) {
      expect(
        focalField.querySelector(`[data-testid="option-${position}"]`),
      ).toBeDefined();
    }
  });
});
