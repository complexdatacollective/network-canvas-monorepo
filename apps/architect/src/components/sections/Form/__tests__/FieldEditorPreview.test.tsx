import { render, screen } from '@testing-library/react';
import type * as ReactRedux from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

const mocks = vi.hoisted(() => ({
  variables: {
    age: {
      name: 'Age',
      type: 'number',
    },
  },
}));

vi.mock('react-redux', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRedux>()),
  useSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

vi.mock('~/selectors/codebook', () => ({
  getVariablesForSubjectSelector: () => mocks.variables,
}));

vi.mock('~/selectors/protocol', () => ({
  getProtocol: () => undefined,
}));

import FieldEditorPreview from '../FieldEditorPreview';

const existingVariableMessage =
  'When selecting an existing variable, changes you make to the input control or validation options will also change other uses of this variable.';

const renderPreview = (item: Record<string, unknown>) =>
  render(
    <Form onSubmit={() => ({ success: true })}>
      <FieldEditorPreview entity="node" type="person" item={item} />
    </Form>,
  );

describe('FieldEditorPreview', () => {
  it('shows the existing-variable notice in the preview pane', () => {
    renderPreview({ variable: 'age' });

    const preview = screen.getByRole('region', {
      name: 'Interactive preview',
    });

    expect(preview).toHaveTextContent(existingVariableMessage);
  });

  it('does not show the notice while creating a variable', () => {
    renderPreview({
      variable: 'New variable',
      _createNewVariable: 'New variable',
    });

    expect(screen.queryByText(existingVariableMessage)).not.toBeInTheDocument();
  });
});
