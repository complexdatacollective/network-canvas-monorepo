import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import {
  asEntityAttributeReference,
  type Codebook,
  type Form as TForm,
  type Variable,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../../contexts/CurrentStepContext';
import type { ProtocolPayload } from '../../../../contract/types';
import { writeSubmissionResult } from '../../../../forms/writeSubmissionResult';
import protocol from '../../../../store/modules/protocol';
import session, {
  addNode as addSessionNode,
  type SessionState,
} from '../../../../store/modules/session';
import ui from '../../../../store/modules/ui';
import type { StageProps } from '../../../../types';
import { TestProtocolLocalization } from '../../../__tests__/TestProtocolLocalization';
import NodeForm from '../NodeForm';

vi.mock('../../../../hooks/useCelebrate', () => ({
  useCelebrate: () => vi.fn(),
}));

// jsdom lacks ResizeObserver; the dialog's ScrollArea observes its viewport.
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});

const NODE_TYPE = 'person';
const VARIABLE = 'answer';
const FIELD_LABEL = 'Your answer';
const UNIQUE_ERROR = 'Must be unique.';

const form: TForm = {
  title: { en: 'Add a person' },
  fields: [
    {
      variable: asEntityAttributeReference(VARIABLE),
      prompt: { en: FIELD_LABEL },
    },
  ],
};

type NameGeneratorStage = StageProps<'NameGenerator'>['stage'];

const stage: NameGeneratorStage = {
  id: 'name-generator-stage',
  type: 'NameGenerator',
  label: { en: 'Add people' },
  subject: { entity: 'node', type: NODE_TYPE },
  form,
  prompts: [{ id: 'prompt-1', text: { en: 'Who do you know?' } }],
};

function buildProtocol(variable: Variable): ProtocolPayload {
  const codebook: Codebook = {
    node: {
      [NODE_TYPE]: {
        name: 'Person',
        label: { en: 'Person' },
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        icon: 'add-a-person',
        variables: { [VARIABLE]: variable },
      },
    },
    edge: {},
    ego: { variables: {} },
  };
  return {
    id: 'protocol',
    hash: 'hash',
    importedAt: '2024-01-01T00:00:00.000Z',
    assets: [],
    name: 'Test protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook,
    stages: [stage],
  };
}

const emptySession: SessionState = {
  id: 'session',
  startTime: '2024-01-01T00:00:00.000Z',
  finishTime: null,
  exportTime: null,
  lastUpdated: '2024-01-01T00:00:00.000Z',
  localePreference: null,
  locale: null,
  network: {
    ego: {
      [entityPrimaryKeyProperty]: 'ego',
      [entityAttributesProperty]: {},
    },
    nodes: [],
    edges: [],
  },
};

/**
 * Render the alter form over a real session store, with `addNode` wired to
 * the session's own add-node action — so every alter the form adds is stored
 * exactly as the interview stores it, and the next entry is validated
 * against those stored values.
 */
function renderNodeForm(
  variable: Variable,
  {
    addNode: addNodeOverride,
  }: {
    addNode?: (
      attributes: NcNode[typeof entityAttributesProperty],
    ) => Promise<FormSubmissionResult>;
  } = {},
) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: emptySession,
      protocol: buildProtocol(variable),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  const addNode = async (attributes: NcNode[typeof entityAttributesProperty]) =>
    writeSubmissionResult(
      await store.dispatch(
        addSessionNode({
          type: NODE_TYPE,
          attributeData: attributes,
          currentStep: 0,
        }),
      ),
    );

  const onClose = vi.fn();

  render(
    <Provider store={store}>
      <TestProtocolLocalization>
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <NodeForm
            selectedNode={null}
            form={form}
            disabled={false}
            onClose={onClose}
            addNode={addNodeOverride ?? addNode}
          />
        </CurrentStepProvider>
      </TestProtocolLocalization>
    </Provider>,
  );

  const storedAnswers = () =>
    store
      .getState()
      .session.network.nodes.map(
        (node) => node[entityAttributesProperty][VARIABLE],
      );

  return { storedAnswers, onClose };
}

const openForm = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Add a person' }));
  await screen.findByRole('dialog');
};

const finish = () =>
  userEvent.click(screen.getByRole('button', { name: 'Done' }));

const waitForDialogToClose = () =>
  waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

// ── Driving each control the way a participant does ────────────────────────

const typeInto = async (role: 'textbox' | 'spinbutton', text: string) => {
  const input = screen.getByRole(role, { name: FIELD_LABEL });
  await userEvent.clear(input);
  await userEvent.type(input, text);
};

const pickRadio = (name: string) =>
  userEvent.click(screen.getByRole('radio', { name }));

const toggleCheckbox = (name: string) =>
  userEvent.click(screen.getByRole('checkbox', { name }));

const setDate = async (value: string) => {
  fireEvent.change(screen.getByLabelText(FIELD_LABEL), { target: { value } });
};

type Answer = {
  /** Enter this answer into the open form. */
  enter: () => Promise<void>;
  /** What the interview stores for it. */
  stored: unknown;
};

type UniqueCase = {
  variable: Variable;
  first: Answer;
  /**
   * Enter the first answer a second time, into a fresh form. Defaults to
   * `first.enter`; a multi-select overrides it to pick the same options in
   * a different order.
   */
  enterFirstAgain?: () => Promise<void>;
  /** A distinct answer, entered into the form that just refused the duplicate. */
  second: Answer;
};

/**
 * One case per variable type that accepts "Must be unique", each rendered with
 * the control the interview renders for it. The answers are entered through
 * that control, so the value the rule is asked about is the one the control
 * constructs — a raw string for a number input, a boolean for a Yes/No pair,
 * the codebook's own option values for radios and checkboxes.
 */
const cases: Record<string, UniqueCase> = {
  text: {
    variable: {
      name: 'Name',
      label: 'Name',
      type: 'text',
      component: 'Text',
      validation: { unique: true },
    },
    first: { enter: () => typeInto('textbox', 'Alice'), stored: 'Alice' },
    second: { enter: () => typeInto('textbox', 'Bob'), stored: 'Bob' },
  },
  number: {
    // The reported case: an "Alter ID#" number that must be unique. The
    // input hands the form '12' while the first alter stores 12.
    variable: {
      name: 'Alter ID',
      label: 'Alter ID',
      type: 'number',
      component: 'Number',
      validation: { unique: true },
    },
    first: { enter: () => typeInto('spinbutton', '12'), stored: 12 },
    second: { enter: () => typeInto('spinbutton', '13'), stored: 13 },
  },
  datetime: {
    variable: {
      name: 'Birthday',
      label: 'Birthday',
      type: 'datetime',
      component: 'DatePicker',
      validation: { unique: true },
    },
    first: { enter: () => setDate('2024-01-15'), stored: '2024-01-15' },
    second: { enter: () => setDate('2024-01-16'), stored: '2024-01-16' },
  },
  boolean: {
    variable: {
      name: 'Employed',
      label: 'Employed',
      type: 'boolean',
      component: 'Boolean',
      validation: { unique: true },
    },
    first: { enter: () => pickRadio('Yes'), stored: true },
    second: { enter: () => pickRadio('No'), stored: false },
  },
  ordinal: {
    variable: {
      name: 'Closeness',
      label: 'Closeness',
      type: 'ordinal',
      component: 'RadioGroup',
      options: [
        { label: { en: 'Low' }, value: 1 },
        { label: { en: 'High' }, value: 2 },
      ],
      validation: { unique: true },
    },
    first: { enter: () => pickRadio('Low'), stored: 1 },
    second: { enter: () => pickRadio('High'), stored: 2 },
  },
  categorical: {
    variable: {
      name: 'Contexts',
      label: 'Contexts',
      type: 'categorical',
      component: 'CheckboxGroup',
      options: [
        { label: { en: 'Family' }, value: 'family' },
        { label: { en: 'Work' }, value: 'work' },
        { label: { en: 'School' }, value: 'school' },
      ],
      validation: { unique: true },
    },
    first: {
      enter: async () => {
        await toggleCheckbox('Family');
        await toggleCheckbox('Work');
      },
      stored: ['family', 'work'],
    },
    // The same selection made in the other order is the same answer.
    enterFirstAgain: async () => {
      await toggleCheckbox('Work');
      await toggleCheckbox('Family');
    },
    // Unticking Family leaves a different selection.
    second: { enter: () => toggleCheckbox('Family'), stored: ['work'] },
  },
};

describe('NodeForm while a person is being saved', () => {
  it('can neither be left nor submitted again until the save settles', async () => {
    const pending: ((result: FormSubmissionResult) => void)[] = [];
    const addNode = vi.fn(
      () =>
        new Promise<FormSubmissionResult>((resolve) => {
          pending.push(resolve);
        }),
    );
    const { onClose } = renderNodeForm(
      { name: 'answer', label: 'answer', type: 'text', component: 'Text' },
      { addNode },
    );

    await openForm();
    await typeInto('textbox', 'Alice');
    await finish();
    await waitFor(() => expect(addNode).toHaveBeenCalledTimes(1));

    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await finish();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(addNode).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending[0]?.({ success: true });
    });
    await waitForDialogToClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('NodeForm honours "Must be unique" for every variable type that accepts it', () => {
  it.each(Object.entries(cases))(
    '%s: refuses an answer another alter already holds and accepts a distinct one',
    async (_type, { variable, first, enterFirstAgain, second }) => {
      const { storedAnswers } = renderNodeForm(variable);

      // The first alter's answer is stored the way the interview stores it.
      await openForm();
      await first.enter();
      await finish();
      await waitFor(() => expect(storedAnswers()).toEqual([first.stored]));
      await waitForDialogToClose();

      // The same answer for a second alter is refused: the field is marked
      // invalid, the form stays open and nothing is added.
      await openForm();
      await (enterFirstAgain ?? first.enter)();
      await finish();
      await waitFor(() =>
        expect(screen.getByTestId(`${VARIABLE}-field-error`)).toHaveTextContent(
          UNIQUE_ERROR,
        ),
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(storedAnswers()).toEqual([first.stored]);

      // A distinct answer in the same form is accepted.
      await second.enter();
      await finish();
      await waitFor(() =>
        expect(storedAnswers()).toEqual([first.stored, second.stored]),
      );
    },
  );
});
