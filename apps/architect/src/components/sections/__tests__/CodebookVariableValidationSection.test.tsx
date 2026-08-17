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

    // The negative of the expanded case below. This used to query an "Add
    // new" button, which this section has never rendered — the rule list is a
    // switch group — so the assertion passed no matter what was on screen.
    expect(
      screen.queryByRole('group', { name: 'Requirements' }),
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

    expect(
      screen.getByRole('group', { name: 'Requirements' }),
    ).toBeInTheDocument();
  });

  it('commits an added rule back to the codebook variable via updateVariableAsync, marking the draft dirty', async () => {
    codebookVariables.current = {
      v1: { id: 'v1', name: 'Age', type: 'number' } as Variable & {
        id: string;
      },
    };
    updateVariableAsync.mockClear();

    renderSection();

    // No existing rules: the section starts collapsed, so its toggle has to
    // be opened before the rule list is reachable. `Section`'s toggle
    // handler is async (it awaits `handleToggleChange`), so the resulting
    // `setInternalOpen` lands a microtask after the click.
    fireEvent.click(screen.getByRole('switch', { name: 'Validation' }));
    fireEvent.click(
      await screen.findByRole('switch', { name: 'Required', hidden: true }),
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

    renderSection();

    // Existing rules: the section starts expanded, so this click turns it off.
    fireEvent.click(screen.getByRole('switch', { name: 'Validation' }));

    await waitFor(() => {
      expect(updateVariableAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          variable: 'v1',
          configuration: { validation: {} },
          replaceProperties: ['validation'],
        }),
      );
    });
  });

  it('writes a numeric rule with its valid initial value', async () => {
    codebookVariables.current = {
      v1: { id: 'v1', name: 'Age', type: 'number' } as Variable & {
        id: string;
      },
    };
    updateVariableAsync.mockClear();

    renderSection();

    fireEvent.click(screen.getByRole('switch', { name: 'Validation' }));
    fireEvent.click(
      await screen.findByRole('switch', {
        name: 'Minimum value',
        hidden: true,
      }),
    );

    await waitFor(() => {
      expect(updateVariableAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          variable: 'v1',
          configuration: { validation: { minValue: 0 } },
          replaceProperties: ['validation'],
        }),
      );
    });
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(0);
    expect(
      screen.queryByText(
        'Enter a value for "Minimum value", or switch the rule off.',
      ),
    ).not.toBeInTheDocument();
  });

  it('does not write a contradictory pair, then writes it once corrected', async () => {
    codebookVariables.current = {
      v1: {
        id: 'v1',
        name: 'Age',
        type: 'number',
        validation: { maxValue: 6 },
      } as Variable & { id: string },
    };
    updateVariableAsync.mockClear();

    renderSection();

    fireEvent.click(
      await screen.findByRole('switch', {
        name: 'Minimum value',
        hidden: true,
      }),
    );
    await waitFor(() => {
      expect(updateVariableAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: { validation: { maxValue: 6, minValue: 6 } },
        }),
      );
    });
    updateVariableAsync.mockClear();

    const input = screen.getByRole('spinbutton', { name: 'Minimum value' });
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(
        screen.getAllByText(/minValue \(10\) is greater than maxValue \(6\)/)
          .length,
      ).toBeGreaterThan(0);
    });
    expect(updateVariableAsync).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(updateVariableAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          variable: 'v1',
          configuration: { validation: { maxValue: 6, minValue: 2 } },
          replaceProperties: ['validation'],
        }),
      );
    });
  });

  // Adversarial review: this surface has no save to refuse, so a rule it is
  // holding back has no later moment to be explained. Clearing a rule's value
  // is "switched on, not answered yet" — it must SAY so, not just quietly
  // stop writing.
  it('says so, and writes nothing, when a rule’s value is cleared', async () => {
    codebookVariables.current = {
      v1: {
        id: 'v1',
        name: 'Age',
        type: 'number',
        validation: { minValue: 10, maxValue: 20 },
      } as Variable & { id: string },
    };
    updateVariableAsync.mockClear();

    renderSection();

    const input = await screen.findByRole('spinbutton', {
      name: 'Maximum value',
    });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(
        screen.getAllByText(
          'Enter a value for "Maximum value", or switch the rule off.',
        ).length,
      ).toBeGreaterThan(0);
    });
    expect(updateVariableAsync).not.toHaveBeenCalled();

    // Switching the rule off is the way to actually drop the bound, and that
    // does reach the codebook.
    fireEvent.click(
      screen.getByRole('switch', { name: 'Maximum value', hidden: true }),
    );

    await waitFor(() => {
      expect(updateVariableAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: { validation: { minValue: 10 } },
        }),
      );
    });
  });

  it('writes nothing for a variable whose section is never opened', async () => {
    codebookVariables.current = {
      v1: { id: 'v1', name: 'Age', type: 'number' } as Variable & {
        id: string;
      },
    };
    updateVariableAsync.mockClear();

    renderSection();

    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Validation' }),
      ).toBeInTheDocument();
    });

    expect(updateVariableAsync).not.toHaveBeenCalled();
  });
});
