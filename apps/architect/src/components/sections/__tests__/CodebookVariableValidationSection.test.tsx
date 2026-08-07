import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

import CodebookVariableValidationSection from '../CodebookVariableValidationSection';

beforeAll(() => {
  // fresco-ui's default `onSubmitInvalid` scrolls the first invalid field
  // into view; jsdom implements no scrolling (see ArchitectField.test.tsx).
  Element.prototype.scrollTo ??= () => undefined;
});

const { updateVariableAsync, codebookVariables } = vi.hoisted(() => ({
  updateVariableAsync: vi.fn((payload: unknown) => ({
    type: 'codebook/updateVariableAsync/mock',
    payload,
  })),
  codebookVariables: {
    current: {} as Record<string, Variable & { id: string }>,
  },
}));

vi.mock('~/ducks/modules/protocol/codebook', () => ({ updateVariableAsync }));

vi.mock('~/selectors/codebook', () => ({
  EMPTY_VARIABLES: {},
  getVariablesForSubjectSelector: () => codebookVariables.current,
}));

const renderSection = (
  props: Partial<Parameters<typeof CodebookVariableValidationSection>[0]> = {},
) => {
  const store = configureStore({ reducer: { stageEditorDraft } });

  const view = render(
    <Provider store={store}>
      <CodebookVariableValidationSection
        fieldName="attribute"
        entity="node"
        type="person"
        variableId="v1"
        {...props}
      />
    </Provider>,
  );

  return { ...view, store };
};

describe('CodebookVariableValidationSection', () => {
  it('renders nothing when no variable is selected', () => {
    codebookVariables.current = {};
    const { container } = renderSection({ variableId: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a variable id absent from the codebook', () => {
    codebookVariables.current = {};
    const { container } = renderSection({ variableId: 'missing' });
    expect(container).toBeEmptyDOMElement();
  });

  it('starts collapsed for a variable with no existing rules', () => {
    codebookVariables.current = {
      v1: { id: 'v1', name: 'Age', type: 'number' } as Variable & {
        id: string;
      },
    };

    renderSection();

    expect(
      screen.queryByRole('button', { name: 'Add new' }),
    ).not.toBeInTheDocument();
  });

  it('starts expanded for a variable that already has rules', () => {
    codebookVariables.current = {
      v1: {
        id: 'v1',
        name: 'Age',
        type: 'number',
        validation: { required: true },
      } as Variable & { id: string },
    };

    renderSection();

    expect(screen.getByRole('button', { name: 'Add new' })).toBeInTheDocument();
  });

  it('commits an added rule back to the codebook variable via updateVariableAsync, marking the draft dirty', async () => {
    codebookVariables.current = {
      v1: { id: 'v1', name: 'Age', type: 'number' } as Variable & {
        id: string;
      },
    };
    updateVariableAsync.mockClear();

    const { store } = renderSection();

    // No existing rules: the section starts collapsed, so its toggle has to
    // be opened before the row editor is reachable. `Section`'s toggle
    // handler is async (it awaits `handleToggleChange`), so the resulting
    // `setInternalOpen` lands a microtask after the click.
    fireEvent.click(
      screen.getByRole('switch', { name: 'Turn this feature on or off' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Add new' }));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'required' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Add validation rule' }),
    );

    await waitFor(() => {
      expect(updateVariableAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          variable: 'v1',
          configuration: { validation: { required: true } },
          replaceProperties: ['validation'],
        }),
      );
    });

    expect(store.getState().stageEditorDraft.ui.externalEditCount).toBe(1);
  });

  it('commits the removal when the section is turned off, so the old rules leave the codebook', async () => {
    codebookVariables.current = {
      v1: {
        id: 'v1',
        name: 'Age',
        type: 'number',
        validation: { required: true },
      } as Variable & { id: string },
    };
    updateVariableAsync.mockClear();

    const { store } = renderSection();

    // Existing rules: the section starts expanded, so this click turns it off.
    fireEvent.click(
      screen.getByRole('switch', { name: 'Turn this feature on or off' }),
    );

    await waitFor(() => {
      expect(updateVariableAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          variable: 'v1',
          configuration: { validation: {} },
          replaceProperties: ['validation'],
        }),
      );
    });

    expect(store.getState().stageEditorDraft.ui.externalEditCount).toBe(1);
  });

  it('writes nothing for a variable whose section is never opened', async () => {
    codebookVariables.current = {
      v1: { id: 'v1', name: 'Age', type: 'number' } as Variable & {
        id: string;
      },
    };
    updateVariableAsync.mockClear();

    const { store } = renderSection();

    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Turn this feature on or off' }),
      ).toBeInTheDocument();
    });

    expect(updateVariableAsync).not.toHaveBeenCalled();
    expect(store.getState().stageEditorDraft.ui.externalEditCount).toBe(0);
  });
});
