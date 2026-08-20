import { configureStore } from '@reduxjs/toolkit';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

type SelectStubProps = {
  name?: string;
  value?: unknown;
  onChange?: (value: string) => void;
  options?: { value: string; label: string }[];
};

// Both pickers are stubbed to plain selects so a test can choose a variable or
// an edge type without driving VariableSpotlight's or EntitySelectField's own
// UI through jsdom.
vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  VariablePickerControl: ({
    name,
    value,
    onChange,
    options = [],
  }: SelectStubProps) => (
    <select
      aria-label={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    >
      <option value="">-- select --</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

// The edge picker takes its options from the codebook rather than a prop.
vi.mock(
  '~/components/sections/fields/EntitySelectField/EntitySelectField',
  () => ({
    EntitySelectControl: ({ name, value, onChange }: SelectStubProps) => (
      <select
        aria-label={name}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange?.(event.target.value)}
      >
        <option value="">-- select --</option>
        <option value="friend">Friend</option>
      </select>
    ),
  }),
);

vi.mock('~/components/Form/Fields/RichText/Field', () => ({
  default: ({
    name,
    value,
    onChange,
  }: {
    name?: string;
    value?: unknown;
    onChange?: (value: string) => void;
  }) => (
    <input
      aria-label={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import SociogramPrompts from '../SociogramPrompts';

const PROTOCOL = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {
          flagged: { name: 'Flagged', type: 'boolean' },
          coords: { name: 'Coords', type: 'layout' },
        },
      },
    },
    edge: { friend: { name: 'Friend', color: 'c' } },
  },
  stages: [],
};

const asStage = (values: Record<string, unknown>) => values as unknown as Stage;

const renderSection = (committedStage: Record<string, unknown>) => {
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: PROTOCOL }) => state,
      stageEditorDraft,
    },
  });

  type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;
  let storeApi: StoreApi | null = null;
  const CaptureStore = () => {
    storeApi = useContext(FormStoreContext) ?? null;
    return null;
  };

  const view = render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={asStage(committedStage)}
          stageId="s1"
          formId="edit-stage"
        >
          <CaptureStore />
          <SociogramPrompts
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType="Sociogram"
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );

  return {
    ...view,
    getPrompt: () => {
      if (!storeApi) throw new Error('stage form store was not captured');
      const prompts = storeApi.getState().getFormValues().prompts;
      return (prompts as Record<string, unknown>[] | undefined)?.[0];
    },
  };
};

/** Every `Section` toggle shares one title, so locate it by its heading. */
const sectionToggle = (title: string) => {
  const header = screen.getByText(title).parentElement;
  if (!header) throw new Error(`no header rendered for "${title}"`);
  return within(header).getByRole('switch');
};

const waitForSave = (submitLabel: string) =>
  waitFor(
    () => {
      expect(
        screen.queryByRole('button', { name: submitLabel }),
      ).not.toBeInTheDocument();
    },
    { timeout: 5000 },
  );

const HIGHLIGHT_PROMPT = {
  id: 'p1',
  text: 'Tap to flag',
  layout: { layoutVariable: 'coords' },
  highlight: { allowHighlighting: true, variable: 'flagged' },
};

describe('Sociogram prompt tap behavior', () => {
  // `highlight.allowHighlighting` is what the interview runtime gates the
  // tap-to-toggle branch on. A saved row carrying only `highlight.variable`
  // matches the schema's DISABLED variant and is a runtime no-op.
  it('enables highlighting when Attribute Toggling is chosen for a new prompt', async () => {
    const { getPrompt } = renderSection({
      subject: { entity: 'node', type: 'person' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create new prompt' }));
    fireEvent.change(await screen.findByLabelText('text'), {
      target: { value: 'Tap to flag' },
    });
    fireEvent.change(screen.getByLabelText('layout.layoutVariable'), {
      target: { value: 'coords' },
    });
    fireEvent.click(sectionToggle('Interaction Behavior'));
    fireEvent.click(
      await screen.findByRole('radio', { name: /Attribute Toggling/ }),
    );
    fireEvent.change(await screen.findByLabelText('highlight.variable'), {
      target: { value: 'flagged' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitForSave('Add');

    expect(getPrompt()).toMatchObject({
      highlight: { allowHighlighting: true, variable: 'flagged' },
    });
  });

  // The dialog's submitted `highlight` REPLACES the committed one wholesale
  // (DialogArrayField's mergeEditedRow spreads at the top level), so a save
  // that renders only the variable silently drops the enable flag.
  it('keeps highlighting enabled when an existing prompt is edited without touching the behavior', async () => {
    const { getPrompt } = renderSection({
      subject: { entity: 'node', type: 'person' },
      prompts: [HIGHLIGHT_PROMPT],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }));
    fireEvent.change(await screen.findByLabelText('text'), {
      target: { value: 'Tap to flag them' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitForSave('Save');

    expect(getPrompt()).toMatchObject({
      text: 'Tap to flag them',
      highlight: { allowHighlighting: true, variable: 'flagged' },
    });
  });

  // The mirror failure: clearing only the variable leaves the committed
  // `allowHighlighting: true` to be merged back in, producing a prompt the
  // schema rejects twice over (enabled with no variable, and enabled
  // alongside edges.create).
  it('disables highlighting when an enabled prompt switches to Edge Creation', async () => {
    const { getPrompt } = renderSection({
      subject: { entity: 'node', type: 'person' },
      prompts: [HIGHLIGHT_PROMPT],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }));
    // `SociogramPrompts`' own `PromptFields` renders `<PromptText />` with no
    // `initialValue`, so the required prompt text has to be re-entered before
    // any edit of an existing row can be saved.
    fireEvent.change(await screen.findByLabelText('text'), {
      target: { value: 'Tap to connect' },
    });
    fireEvent.click(
      await screen.findByRole('radio', { name: /Edge Creation/ }),
    );
    fireEvent.change(await screen.findByLabelText('edges.create'), {
      target: { value: 'friend' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitForSave('Save');

    const prompt = getPrompt() as Record<string, unknown>;
    expect(prompt).toMatchObject({ edges: { create: 'friend' } });
    expect(prompt.highlight).toEqual({ allowHighlighting: false });
  });

  // Every canonical sociogram prompt records the flag explicitly: the sample
  // protocol's layout-only and edge-creation prompts all carry
  // `highlight: {allowHighlighting: false}`, which is what the Architect
  // sample-protocol e2e spec authors through this very control.
  it('records highlighting as off for a new edge-creation prompt', async () => {
    const { getPrompt } = renderSection({
      subject: { entity: 'node', type: 'person' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create new prompt' }));
    fireEvent.change(await screen.findByLabelText('text'), {
      target: { value: 'Tap to connect' },
    });
    fireEvent.change(screen.getByLabelText('layout.layoutVariable'), {
      target: { value: 'coords' },
    });
    fireEvent.click(sectionToggle('Interaction Behavior'));
    fireEvent.click(
      await screen.findByRole('radio', { name: /Edge Creation/ }),
    );
    fireEvent.change(await screen.findByLabelText('edges.create'), {
      target: { value: 'friend' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitForSave('Add');

    expect(getPrompt()).toMatchObject({
      edges: { create: 'friend' },
      highlight: { allowHighlighting: false },
    });
  });

  // The layout-only prompts of the canonical protocol are authored with the
  // Interaction Behavior on-then-off dance, which is the only thing that
  // writes their `highlight: {allowHighlighting: false}`.
  it('records highlighting as off when the section is toggled on and back off', async () => {
    const { getPrompt } = renderSection({
      subject: { entity: 'node', type: 'person' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create new prompt' }));
    fireEvent.change(await screen.findByLabelText('text'), {
      target: { value: 'Position everyone' },
    });
    fireEvent.change(screen.getByLabelText('layout.layoutVariable'), {
      target: { value: 'coords' },
    });
    const toggle = sectionToggle('Interaction Behavior');
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitForSave('Add');

    const prompt = getPrompt() as Record<string, unknown>;
    expect(prompt.highlight).toEqual({ allowHighlighting: false });
    expect(prompt).not.toHaveProperty('edges');
  });
});
