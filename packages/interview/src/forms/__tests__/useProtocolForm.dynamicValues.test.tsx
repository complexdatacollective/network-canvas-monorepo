import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import {
  asEntityAttributeReference,
  dynamicValueNameFor,
  type FormField,
  optionCaseKey,
  type Stage,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { testId, testTypeId, testVariableId } from '../../__tests__/testIds';
import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import { StageDynamicValues } from '../../dynamicValues/DynamicValueScope';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui from '../../store/modules/ui';
import useProtocolForm from '../useProtocolForm';

// How many times a form's dynamic value scope is drawn, so that a test can
// tell whether the form puts its fields in one.
const formScopes = vi.hoisted(() => ({ drawn: 0 }));
vi.mock('../../dynamicValues/FormDynamicValues', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../dynamicValues/FormDynamicValues')
    >();
  return {
    ...actual,
    FormDynamicValues: (
      props: Parameters<typeof actual.FormDynamicValues>[0],
    ) => {
      formScopes.drawn += 1;
      return createElement(actual.FormDynamicValues, props);
    },
  };
});

const NODE_TYPE = testTypeId('person');
const KNOWS = testTypeId('knows');
const NAME = testVariableId('name');
const CLOSE = testVariableId('close');
const NOTE = testVariableId('note');
const KINDS = testVariableId('kinds');
const EDGE_NOTE = testVariableId('edge-note');
const EDGE_CLOSENESS = testVariableId('edge-closeness');
const AUNT = testId('option aunt');
const COUSIN = testId('option cousin');

/** The names text gives the values it shows. */
const NAMES = {
  name: dynamicValueNameFor({
    kind: 'attribute',
    role: 'node',
    variableId: NAME,
  }),
  close: dynamicValueNameFor({
    kind: 'attribute',
    role: 'node',
    variableId: CLOSE,
  }),
  kinds: dynamicValueNameFor({
    kind: 'attribute',
    role: 'node',
    variableId: KINDS,
  }),
  label: dynamicValueNameFor({ kind: 'label', role: 'node' }),
  from: dynamicValueNameFor({ kind: 'label', role: 'edgeFrom' }),
  to: dynamicValueNameFor({ kind: 'label', role: 'edgeTo' }),
  closeness: dynamicValueNameFor({
    kind: 'attribute',
    role: 'edge',
    variableId: EDGE_CLOSENESS,
  }),
};

/** A stage whose form's field is captioned `prompt`. */
const stageShowing = (prompt: string) =>
  ({
    id: 'stage',
    type: 'NameGenerator',
    label: { en: 'People' },
    subject: { entity: 'node', type: NODE_TYPE },
    form: {
      fields: [
        {
          id: testId('field-L97'),
          variable: asEntityAttributeReference(NOTE),
          prompt: { en: prompt },
        },
      ],
    },
    prompts: [{ id: 'prompt', text: { en: 'Who?' } }],
  }) as unknown as Stage;

function renderForm(
  options: Pick<
    Parameters<typeof useProtocolForm>[0],
    'precedingVariables' | 'newEntityAttributes' | 'labelNode'
  >,
  prompt: string,
  /** The node type's own label, where the test gives it one. */
  dynamicLabel?: unknown,
) {
  const stage = stageShowing(prompt);
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: [],
          edges: [],
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 9,
        localization: { defaultLocale: 'en', locales: ['en'] },
        codebook: {
          node: {
            [NODE_TYPE]: {
              name: 'person',
              ...(dynamicLabel === undefined ? {} : { dynamicLabel }),
              variables: {
                [NAME]: { name: 'name', type: 'text', component: 'Text' },
                [CLOSE]: { name: 'close', type: 'boolean' },
                [NOTE]: { name: 'note', type: 'text', component: 'Text' },
                [KINDS]: {
                  name: 'kinds',
                  type: 'categorical',
                  component: 'CheckboxGroup',
                  options: [
                    { id: AUNT, value: 'aunt', label: { en: 'Aunt' } },
                    { id: COUSIN, value: 'cousin', label: { en: 'Cousin' } },
                  ],
                },
              },
            },
          },
          edge: {},
          ego: { variables: {} },
        },
        stages: [stage],
      } as never,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });

  const fields = (stage as unknown as { form: { fields: FormField[] } }).form
    .fields;

  function PersonFields() {
    const { fieldComponents } = useProtocolForm({ fields, ...options });
    return (
      <>
        {/* A control the interface asks before the protocol's fields. */}
        <Field
          component={InputField}
          name={NAME}
          nameMode="opaque"
          label="Their name"
        />
        {/* A categorical one, stored as an array of the options chosen. */}
        <Field
          component={CheckboxGroupField}
          name={KINDS}
          nameMode="opaque"
          label="How they are related"
          options={[
            { value: 'aunt', label: 'Aunt' },
            { value: 'cousin', label: 'Cousin' },
          ]}
        />
        {fieldComponents}
      </>
    );
  }

  render(
    <TestProtocolLocalization>
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
          <StageDynamicValues stage={stage}>
            <Form onSubmit={() => ({ success: true })}>
              <PersonFields />
            </Form>
          </StageDynamicValues>
        </CurrentStepProvider>
      </Provider>
    </TestProtocolLocalization>,
  );
}

describe('useProtocolForm dynamic values', () => {
  it('leaves the fields of a stage whose text shows no values out of a dynamic value scope', () => {
    formScopes.drawn = 0;
    renderForm({ precedingVariables: [NAME] }, 'About them');
    expect(screen.getByText('About them')).toBeInTheDocument();
    expect(formScopes.drawn).toBe(0);

    // The same form on a stage whose text shows a value is in one.
    renderForm(
      { precedingVariables: [NAME] },
      `{${NAMES.name}, select, missing {About someone} other {About {${NAMES.name}}}}`,
    );
    expect(screen.getByText('About someone')).toBeInTheDocument();
    expect(formScopes.drawn).toBeGreaterThan(0);
  });

  it("shows the answer to a control the interface asks before the form's fields", () => {
    renderForm(
      { precedingVariables: [NAME] },
      `{${NAMES.name}, select, missing {About them} other {About {${NAMES.name}}}}`,
    );
    expect(screen.getByText('About them')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Their name' }), {
      target: { value: 'Ada' },
    });
    const value = screen.getByText('Ada', { selector: 'bdi' });
    expect(value.closest('[data-dynamic-value]')).not.toBeNull();
  });

  it('names the node being created by its label as it is typed', () => {
    renderForm({ precedingVariables: [NAME] }, `How old is {${NAMES.label}}?`);
    // With no name yet, the node is unnamed.
    expect(
      screen.getByText('Unnamed', { selector: 'bdi' }).closest('label'),
    ).toHaveTextContent(/^How old is Unnamed/);

    fireEvent.change(screen.getByRole('textbox', { name: 'Their name' }), {
      target: { value: 'Ada' },
    });
    expect(
      screen.getByText('Ada', { selector: 'bdi' }).closest('label'),
    ).toHaveTextContent(/^How old is Ada/);
    expect(screen.queryByText('Unnamed', { selector: 'bdi' })).toBeNull();
  });

  it('names the node by the interface’s own label in place of the codebook’s rules, from every answer as it is given', () => {
    const labelNode = vi.fn((attributes: Readonly<Record<string, unknown>>) => {
      const kinds = attributes[KINDS];
      return Array.isArray(kinds) && kinds.length > 0
        ? `Their ${kinds.join(' and ')}`
        : 'Their relative';
    });
    renderForm(
      { precedingVariables: [NAME, KINDS], labelNode },
      `How old is {${NAMES.label}}?`,
    );
    const shownLabel = () =>
      screen
        .getByText(/^How old is/)
        .closest('label')
        ?.querySelector('[data-dynamic-value] bdi')?.textContent;
    // Not the word the codebook's rules give a node with no name.
    expect(shownLabel()).toBe('Their relative');
    expect(screen.queryByText('Unnamed', { selector: 'bdi' })).toBeNull();

    // Nor its name, which the codebook's rules would show.
    fireEvent.change(screen.getByRole('textbox', { name: 'Their name' }), {
      target: { value: 'Ada' },
    });
    expect(shownLabel()).toBe('Their relative');
    // With which of the form's questions hold an answer, so that one typed
    // to match a stored value can be told from it.
    expect(labelNode).toHaveBeenLastCalledWith(
      expect.objectContaining({ [NAME]: 'Ada' }),
      expect.objectContaining({ [NAME]: true }),
    );

    // A categorical answer reaches it as it is given, as the array it is
    // stored as.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Aunt' }));
    expect(shownLabel()).toBe('Their aunt');
    expect(labelNode).toHaveBeenLastCalledWith(
      expect.objectContaining({ [NAME]: 'Ada', [KINDS]: ['aunt'] }),
      expect.objectContaining({ [NAME]: true, [KINDS]: true }),
    );
  });

  // A node type's own label can test any of the node's attributes, so the
  // node the form labels has to carry every answer, not only the text and
  // numbers a default label is read from.
  it('labels the node being created by its own label, from an answer that is a list of options', () => {
    renderForm(
      { precedingVariables: [KINDS] },
      `How old is {${NAMES.label}}?`,
      {
        text: {
          en: `{${NAMES.kinds}, select, ${optionCaseKey(AUNT)} {An aunt} other {Someone}}`,
        },
      },
    );
    expect(
      screen.getByText('Someone', { selector: 'bdi' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Aunt' }));
    expect(
      screen.getByText('An aunt', { selector: 'bdi' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Someone', { selector: 'bdi' })).toBeNull();
  });

  it('shows what a new person will be created with', () => {
    renderForm(
      { newEntityAttributes: { [CLOSE]: true } },
      `{${NAMES.close}, select, missing {Anyone} true {Someone close} other {Someone}}`,
    );
    expect(screen.getByText('Someone close')).toBeInTheDocument();
  });
});

describe('useProtocolForm dynamic values on an edge form', () => {
  function renderEdgeForm(prompt: string, edgeAttributes: object = {}) {
    const fields: FormField[] = [
      {
        id: testId('field-1'),
        variable: asEntityAttributeReference(EDGE_NOTE),
        prompt: { en: prompt },
      },
    ];
    const edgeStage = {
      id: 'edges',
      type: 'AlterEdgeForm',
      label: { en: 'Ties' },
      subject: { entity: 'edge', type: KNOWS },
      form: { fields },
    } as unknown as Stage;
    const store = configureStore({
      reducer: { session, protocol, ui },
      preloadedState: {
        session: {
          id: 's',
          promptIndex: 0,
          network: {
            nodes: [
              {
                [entityPrimaryKeyProperty]: 'n1',
                type: NODE_TYPE,
                [entityAttributesProperty]: { [NAME]: 'Ada' },
              },
              {
                [entityPrimaryKeyProperty]: 'n2',
                type: NODE_TYPE,
                [entityAttributesProperty]: {},
              },
            ],
            edges: [
              {
                [entityPrimaryKeyProperty]: 'e1',
                type: KNOWS,
                from: 'n1',
                to: 'n2',
                [entityAttributesProperty]: edgeAttributes,
              },
            ],
            ego: { [entityAttributesProperty]: {} },
          },
        } as never,
        protocol: {
          id: 'p',
          hash: 'h',
          schemaVersion: 9,
          localization: { defaultLocale: 'en', locales: ['en'] },
          codebook: {
            node: {
              [NODE_TYPE]: {
                name: 'person',
                variables: {
                  [NAME]: { name: 'name', type: 'text', component: 'Text' },
                },
              },
            },
            edge: {
              [KNOWS]: {
                name: 'knows',
                variables: {
                  [EDGE_NOTE]: {
                    name: 'note',
                    type: 'text',
                    component: 'Text',
                  },
                  [EDGE_CLOSENESS]: {
                    name: 'closeness',
                    type: 'text',
                    component: 'Text',
                  },
                },
              },
            },
            ego: { variables: {} },
          },
          stages: [edgeStage],
        } as never,
      },
      middleware: (getDefault) => getDefault({ serializableCheck: false }),
    });

    function EdgeFields() {
      const { fieldComponents } = useProtocolForm({
        fields,
        subject: { entity: 'edge', type: KNOWS },
        currentEntityId: 'e1',
      });
      return <>{fieldComponents}</>;
    }

    render(
      <TestProtocolLocalization>
        <Provider store={store}>
          <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
            <StageDynamicValues stage={edgeStage}>
              <Form onSubmit={() => ({ success: true })}>
                <EdgeFields />
              </Form>
            </StageDynamicValues>
          </CurrentStepProvider>
        </Provider>
      </TestProtocolLocalization>,
    );
  }

  it('names both nodes the edge joins by their labels', () => {
    renderEdgeForm(`How did {${NAMES.from}} meet {${NAMES.to}}?`);

    // The second node has no name, so it is unnamed.
    expect(
      screen.getByText('Ada', { selector: 'bdi' }).closest('label'),
    ).toHaveTextContent(/^How did Ada.* meet Unnamed/);
    expect(
      screen.getByText('Unnamed', { selector: 'bdi' }),
    ).toBeInTheDocument();
  });

  it('shows an attribute of the edge the form is about', () => {
    renderEdgeForm(
      `{${NAMES.closeness}, select, missing {How close?} other {Closeness: {${NAMES.closeness}}}}`,
      { [EDGE_CLOSENESS]: 'EDGE_SENTINEL' },
    );

    const value = screen.getByText('EDGE_SENTINEL', { selector: 'bdi' });
    expect(value.closest('[data-dynamic-value]')).not.toBeNull();
    expect(value.closest('label')).toHaveTextContent(
      /^Closeness: EDGE_SENTINEL/,
    );
    expect(screen.queryByText('How close?')).toBeNull();
  });
});
