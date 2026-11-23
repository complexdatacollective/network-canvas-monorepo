import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import {
  asEntityAttributeReference,
  type FormField,
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

const NODE_TYPE = testTypeId('person');
const KNOWS = testTypeId('knows');
const NAME = testVariableId('name');
const CLOSE = testVariableId('close');
const NOTE = testVariableId('note');
const KINDS = testVariableId('kinds');
const EDGE_NOTE = testVariableId('edge-note');
const EDGE_CLOSENESS = testVariableId('edge-closeness');

const stage = {
  id: 'stage',
  type: 'NameGenerator',
  label: { en: 'People' },
  subject: { entity: 'node', type: NODE_TYPE },
  dynamicValues: {
    name: { path: `node.${NAME}` },
    close: { path: `node.${CLOSE}`, cases: { yes: true } },
    label: { path: 'node.$label' },
  },
  prompts: [{ id: 'prompt', text: { en: 'Who?' } }],
} as unknown as Stage;

function renderForm(
  options: Pick<
    Parameters<typeof useProtocolForm>[0],
    'precedingVariables' | 'newEntityAttributes' | 'labelNode'
  >,
  prompt: string,
  /** The node type's own label, where the test gives it one. */
  dynamicLabel?: unknown,
) {
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
                    { value: 'aunt', label: { en: 'Aunt' } },
                    { value: 'cousin', label: { en: 'Cousin' } },
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

  const fields: FormField[] = [
    {
      id: testId('field-L97'),
      variable: asEntityAttributeReference(NOTE),
      prompt: { en: prompt },
    },
  ];

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
  it("shows the answer to a control the interface asks before the form's fields", () => {
    renderForm(
      { precedingVariables: [NAME] },
      '{name, select, missing {About them} other {About {name}}}',
    );
    expect(screen.getByText('About them')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Their name' }), {
      target: { value: 'Ada' },
    });
    const value = screen.getByText('Ada', { selector: 'bdi' });
    expect(value.closest('[data-dynamic-value]')).not.toBeNull();
  });

  it('names the node being created by its label as it is typed', () => {
    renderForm({ precedingVariables: [NAME] }, 'How old is {label}?');
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
      'How old is {label}?',
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
    renderForm({ precedingVariables: [KINDS] }, 'How old is {label}?', {
      text: { en: '{kind, select, aunt {An aunt} other {Someone}}' },
      dynamicValues: {
        kind: { path: `node.${KINDS}`, cases: { aunt: 'aunt' } },
      },
    });
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
      '{close, select, missing {Anyone} yes {Someone close} other {Someone}}',
    );
    expect(screen.getByText('Someone close')).toBeInTheDocument();
  });
});

describe('useProtocolForm dynamic values on an edge form', () => {
  const edgeStage = {
    id: 'edges',
    type: 'AlterEdgeForm',
    label: { en: 'Ties' },
    subject: { entity: 'edge', type: KNOWS },
    dynamicValues: {
      from: { path: 'edge.from.$label' },
      to: { path: 'edge.to.$label' },
      closeness: { path: `edge.${EDGE_CLOSENESS}` },
    },
    form: { fields: [] },
  } as unknown as Stage;

  function renderEdgeForm(prompt: string, edgeAttributes: object = {}) {
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
        fields: [
          {
            id: testId('field-1'),
            variable: asEntityAttributeReference(EDGE_NOTE),
            prompt: { en: prompt },
          },
        ],
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
    renderEdgeForm('How did {from} meet {to}?');

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
      '{closeness, select, missing {How close?} other {Closeness: {closeness}}}',
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
