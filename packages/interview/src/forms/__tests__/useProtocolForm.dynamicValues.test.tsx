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
import { entityAttributesProperty } from '@codaco/shared-consts';

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

  it('shows what a new person will be created with', () => {
    renderForm(
      { newEntityAttributes: { close: true } },
      '{close, select, missing {Anyone} yes {Someone close} other {Someone}}',
    );
    expect(screen.getByText('Someone close')).toBeInTheDocument();
  });
});
