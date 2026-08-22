import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import NameGeneratorPrompts from '~/components/sections/NameGeneratorPrompts/NameGeneratorPrompts';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

/**
 * Assigning an additional attribute, through the REAL attribute picker.
 *
 * The picker is deliberately not mocked here, unlike in the sibling specs: the
 * bug this pins lived at the picker's portal boundary, and a stand-in control
 * that renders inline cannot reach it. React delivers a portal's events to the
 * tree that RENDERED it, so opening the spotlight handed the enclosing array
 * field a focusout — and the field, taking that for the researcher leaving it,
 * validated a row they had just added and were on their way to filling in. The
 * whole section went red before anything had been chosen, and the re-render
 * that followed could swallow the very click that was about to choose it, so
 * the pick appeared to need a second go.
 */

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'c',
      variables: {
        close: { name: 'Close', type: 'boolean' },
        nearby: { name: 'Nearby', type: 'boolean' },
      },
    },
  },
};

const INCOMPLETE_MESSAGE =
  'Every additional attribute needs both an attribute and a value.';

const asStage = (values: Record<string, unknown>) => values as unknown as Stage;

const openPromptEditor = () => {
  const prompt = { id: 'p1', text: 'Who do you know?' };
  const stages = [
    {
      id: 's1',
      type: 'NameGenerator',
      label: 'N',
      subject: { entity: 'node', type: 'person' },
      prompts: [prompt],
    },
  ];

  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: { codebook: CODEBOOK, stages } }) =>
        state,
      stageEditorDraft,
    },
  });

  render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={asStage({
            subject: { entity: 'node', type: 'person' },
            prompts: [prompt],
          })}
          stageId="stage-1"
          formId="edit-stage"
        >
          <NameGeneratorPrompts
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType="NameGenerator"
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }));
};

describe('assigning an additional attribute', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
    // fresco-ui's default `onSubmitInvalid` scrolls the first invalid field
    // into view; jsdom implements no scrolling at all.
    Element.prototype.scrollTo ??= () => undefined;
  });

  it('applies the first pick, and says nothing while the picker is open', async () => {
    openPromptEditor();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add new attribute to assign',
      }),
    );

    // Focused first, as a click does: it is the focus LEAVING this button for
    // the picker that used to be read as leaving the field.
    const trigger = await screen.findByRole('button', {
      name: 'Select attribute',
    });
    trigger.focus();
    fireEvent.click(trigger);

    const results = await screen.findAllByTestId('spotlight-list-item');
    expect(results).toHaveLength(2);

    // Nothing has been chosen yet, and the researcher is inside the picker
    // choosing it. Accusing the row of being incomplete here is accusing them
    // of not having done what they are in the middle of doing.
    await waitFor(() =>
      expect(screen.queryByText(INCOMPLETE_MESSAGE)).toBeNull(),
    );

    // Moving around inside the picker is not leaving the field either.
    results[0]!.focus();
    await waitFor(() =>
      expect(screen.queryByText(INCOMPLETE_MESSAGE)).toBeNull(),
    );

    fireEvent.click(results[0]!);

    // One click: the attribute is on the row, and the value control it needs
    // next has appeared.
    await waitFor(() =>
      expect(screen.queryByTestId('spotlight-list-item')).toBeNull(),
    );
    expect(
      screen.getByRole('button', { name: 'Change attribute' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Value to assign')).toBeInTheDocument();
    expect(screen.queryByText(INCOMPLETE_MESSAGE)).toBeNull();
  });

  it('still refuses to save the row it never complained about', async () => {
    // The complaint is not gone, only deferred to the moment it is about
    // something the researcher has finished doing.
    openPromptEditor();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add new attribute to assign',
      }),
    );
    const trigger = await screen.findByRole('button', {
      name: 'Select attribute',
    });
    trigger.focus();
    fireEvent.click(trigger);
    const results = await screen.findAllByTestId('spotlight-list-item');
    fireEvent.click(results[0]!);
    await screen.findByLabelText('Value to assign');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(INCOMPLETE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
