import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/EditorLayout', () => ({
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

vi.mock('~/components/EditableList', () => ({
  default: ({
    fieldName,
  }: {
    fieldName: string;
    editComponent: unknown;
    previewComponent: unknown;
    normalize: unknown;
    itemSelector: unknown;
    onChange: unknown;
    form: string;
  }) => <div data-testid="editable-list" data-fieldname={fieldName} />,
  formName: 'editable-list-form',
}));

vi.mock('~/components/sections/Form/FieldFields', () => ({
  default: () => null,
}));

vi.mock('~/components/sections/Form/FieldPreview', () => ({
  default: () => null,
}));

vi.mock('~/components/sections/Form/helpers', () => ({
  itemSelector: vi.fn(() => vi.fn()),
  normalizeField: vi.fn((v: unknown) => v),
}));

import { ComposerNodeFormComponent } from '../ComposerNodeForm';

const renderSection = (entity = 'node', type = 'Person') =>
  render(
    <ComposerNodeFormComponent
      form="edit-stage"
      stagePath="stages[0]"
      interfaceType="NetworkComposer"
      entity={entity}
      type={type}
      handleChangeFields={vi.fn()}
    />,
  );

describe('ComposerNodeForm', () => {
  it('renders a section with "Node attributes" title', () => {
    renderSection();
    expect(
      screen.getByRole('heading', { name: /node attributes/i }),
    ).toBeDefined();
  });

  it('renders the EditableList bound to nodeForm.fields', () => {
    renderSection();
    const list = screen.getByTestId('editable-list');
    expect(list).toBeDefined();
    expect(list.getAttribute('data-fieldname')).toBe('nodeForm.fields');
  });

  it('does not render a form title input', () => {
    renderSection();
    expect(screen.queryByRole('textbox', { name: /title/i })).toBeNull();
    expect(document.querySelector('[name="nodeForm.title"]')).toBeNull();
    expect(document.querySelector('[name="form.title"]')).toBeNull();
  });
});
