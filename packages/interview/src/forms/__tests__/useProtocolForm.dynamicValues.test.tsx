import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
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

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import { StageDynamicValues } from '../../dynamicValues/DynamicValueScope';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui from '../../store/modules/ui';
import useProtocolForm from '../useProtocolForm';

const NODE_TYPE = 'person';

const stage = {
  id: 'stage',
  type: 'NameGenerator',
  label: { en: 'People' },
  subject: { entity: 'node', type: NODE_TYPE },
  dynamicValues: {
    name: { path: 'node.name' },
    close: { path: 'node.close', cases: { yes: true } },
    label: { path: 'node.$label' },
  },
  prompts: [{ id: 'prompt', text: { en: 'Who?' } }],
} as unknown as Stage;

function renderForm(
  options: Pick<
    Parameters<typeof useProtocolForm>[0],
    'precedingVariables' | 'newEntityAttributes'
  >,
  prompt: string,
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
              name: NODE_TYPE,
              label: { en: 'Person' },
              variables: {
                name: { name: 'name', type: 'text', component: 'Text' },
                close: { name: 'close', type: 'boolean' },
                note: { name: 'note', type: 'text', component: 'Text' },
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
    { variable: asEntityAttributeReference('note'), prompt: { en: prompt } },
  ];

  function PersonFields() {
    const { fieldComponents } = useProtocolForm({ fields, ...options });
    return (
      <>
        {/* A control the interface asks before the protocol's fields. */}
        <Field
          component={InputField}
          name="name"
          nameMode="opaque"
          label="Their name"
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
      { precedingVariables: ['name'] },
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
    renderForm({ precedingVariables: ['name'] }, 'How old is {label}?');
    // With no name yet, the node shows its type's.
    expect(
      screen.getByText('Person', { selector: 'bdi' }).closest('label'),
    ).toHaveTextContent(/^How old is Person/);

    fireEvent.change(screen.getByRole('textbox', { name: 'Their name' }), {
      target: { value: 'Ada' },
    });
    expect(
      screen.getByText('Ada', { selector: 'bdi' }).closest('label'),
    ).toHaveTextContent(/^How old is Ada/);
    expect(screen.queryByText('Person', { selector: 'bdi' })).toBeNull();
  });

  it('shows what a new person will be created with', () => {
    renderForm(
      { newEntityAttributes: { close: true } },
      '{close, select, missing {Anyone} yes {Someone close} other {Someone}}',
    );
    expect(screen.getByText('Someone close')).toBeInTheDocument();
  });
});

describe('useProtocolForm dynamic values on an edge form', () => {
  it('names both nodes the edge joins by their labels', () => {
    const edgeStage = {
      id: 'edges',
      type: 'AlterEdgeForm',
      label: { en: 'Ties' },
      subject: { entity: 'edge', type: 'knows' },
      dynamicValues: {
        from: { path: 'edge.from.$label' },
        to: { path: 'edge.to.$label' },
      },
      form: { fields: [] },
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
                [entityAttributesProperty]: { name: 'Ada' },
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
                type: 'knows',
                from: 'n1',
                to: 'n2',
                [entityAttributesProperty]: {},
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
                name: NODE_TYPE,
                label: { en: 'Person' },
                variables: {
                  name: { name: 'name', type: 'text', component: 'Text' },
                },
              },
            },
            edge: {
              knows: {
                name: 'knows',
                label: { en: 'Knows' },
                variables: {
                  note: { name: 'note', type: 'text', component: 'Text' },
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
            variable: asEntityAttributeReference('note'),
            prompt: { en: 'How did {from} meet {to}?' },
          },
        ],
        subject: { entity: 'edge', type: 'knows' },
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

    // The second node has no name, so it shows its type's.
    expect(
      screen.getByText('Ada', { selector: 'bdi' }).closest('label'),
    ).toHaveTextContent(/^How did Ada.* meet Person/);
    expect(screen.getByText('Person', { selector: 'bdi' })).toBeInTheDocument();
  });
});
