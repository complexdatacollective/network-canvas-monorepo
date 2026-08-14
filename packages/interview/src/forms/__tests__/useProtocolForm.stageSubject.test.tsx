import { configureStore } from '@reduxjs/toolkit';
import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import {
  asEntityAttributeReference,
  type ComposerFormField,
  type FormField,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui from '../../store/modules/ui';
import useProtocolForm from '../useProtocolForm';

const NODE_TYPE = 'person';
const NAME_VAR = 'name';
const DISPLAY_NAME_VAR = 'displayName';
const ALIAS_VAR = 'alias';
const DOTTED_VAR = 'favorite.color';
const DANGEROUS_VARS = ['__proto__', 'constructor', 'prototype'];

// A FamilyPedigree stage has no top-level subject, so getStageSubject — and
// therefore the base validation context's stageSubject — is null.
function makeWrapper() {
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
        schemaVersion: 8,
        codebook: {
          node: {
            [NODE_TYPE]: {
              name: NODE_TYPE,
              variables: {
                [NAME_VAR]: {
                  name: NAME_VAR,
                  type: 'text',
                  component: 'Text',
                  validation: { unique: true },
                },
                [DISPLAY_NAME_VAR]: {
                  name: DISPLAY_NAME_VAR,
                  type: 'text',
                  component: 'Text',
                },
                [ALIAS_VAR]: {
                  name: ALIAS_VAR,
                  type: 'text',
                  component: 'Text',
                  validation: { sameAs: DISPLAY_NAME_VAR },
                },
                [DOTTED_VAR]: {
                  name: DOTTED_VAR,
                  type: 'text',
                  component: 'Text',
                },
                ['__proto__']: {
                  name: '__proto__',
                  type: 'text',
                  component: 'Text',
                },
                constructor: {
                  name: 'constructor',
                  type: 'text',
                  component: 'Text',
                },
                prototype: {
                  name: 'prototype',
                  type: 'text',
                  component: 'Text',
                },
              },
            },
          },
        },
        stages: [{ id: 'stage1', type: 'FamilyPedigree' }],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
          {children}
        </CurrentStepProvider>
      </Provider>
    );
  };
}

const fields: FormField[] = [
  { variable: asEntityAttributeReference(NAME_VAR), prompt: 'Name' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function firstFieldStageSubject(node: ReactNode): unknown {
  const element = Array.isArray(node) ? node[0] : node;
  if (!isValidElement(element)) return undefined;
  if (!isRecord(element.props)) return undefined;
  const validationContext = element.props.validationContext;
  if (!isRecord(validationContext)) return undefined;
  return validationContext.stageSubject;
}

function firstFieldProp(node: ReactNode, prop: string): unknown {
  const element = Array.isArray(node) ? node[0] : node;
  if (!isValidElement(element)) return undefined;
  if (!isRecord(element.props)) return undefined;
  return element.props[prop];
}

function firstFieldValidationContext(node: ReactNode): unknown {
  return firstFieldProp(node, 'validationContext');
}

describe('useProtocolForm stageSubject', () => {
  it('uses the provided subject as the validation stageSubject on a subjectless stage', () => {
    const { result } = renderHook(
      () =>
        useProtocolForm({
          fields,
          subject: { entity: 'node', type: NODE_TYPE },
        }),
      { wrapper: makeWrapper() },
    );

    const stageSubject = firstFieldStageSubject(result.current.fieldComponents);

    // Without the fix the stageSubject would be null (from the subjectless
    // stage), which the unique/sameAs/differentFrom validators dereference.
    expect(stageSubject).toEqual({
      entity: 'node',
      type: NODE_TYPE,
    });
  });

  it('aliases live form values without changing validation references', () => {
    const comparisonFields: FormField[] = [
      {
        variable: asEntityAttributeReference(ALIAS_VAR),
        prompt: 'Alias',
      },
    ];
    const { result } = renderHook(
      () =>
        useProtocolForm({
          fields: comparisonFields,
          subject: { entity: 'node', type: NODE_TYPE },
          formValueAliases: { [DISPLAY_NAME_VAR]: NAME_VAR },
        }),
      { wrapper: makeWrapper() },
    );

    expect(firstFieldProp(result.current.fieldComponents, 'sameAs')).toBe(
      DISPLAY_NAME_VAR,
    );
    expect(firstFieldValidationContext(result.current.fieldComponents)).toEqual(
      expect.objectContaining({
        formValueAliases: { [DISPLAY_NAME_VAR]: NAME_VAR },
      }),
    );
  });

  it('submits a dotted protocol variable identifier as one output key', async () => {
    const onSubmit = vi.fn();
    const dottedFields: FormField[] = [
      {
        variable: asEntityAttributeReference(DOTTED_VAR),
        prompt: 'Favorite color',
      },
    ];

    function Harness() {
      const { fieldComponents } = useProtocolForm({
        fields: dottedFields,
        subject: { entity: 'node', type: NODE_TYPE },
      });

      return (
        <Form
          onSubmit={(values) => {
            onSubmit(values);
            return { success: true };
          }}
        >
          {fieldComponents}
          <SubmitButton>Submit</SubmitButton>
        </Form>
      );
    }

    const { container } = render(<Harness />, { wrapper: makeWrapper() });
    const input = container.querySelector(`input[name="${DOTTED_VAR}"]`);
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Dotted protocol field was not rendered');
    }

    fireEvent.change(input, { target: { value: 'blue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ 'favorite.color': 'blue' });
    });
  });

  it.each(DANGEROUS_VARS)(
    'submits the protocol variable identifier %s as an inert own key',
    async (variable) => {
      const onSubmit = vi.fn();
      const prototypeDescriptor = Object.getOwnPropertyDescriptor(
        Object.prototype,
        variable,
      );
      const dangerousFields: FormField[] = [
        {
          variable: asEntityAttributeReference(variable),
          prompt: 'Legacy variable',
        },
      ];

      function Harness() {
        const { fieldComponents } = useProtocolForm({
          fields: dangerousFields,
          subject: { entity: 'node', type: NODE_TYPE },
        });

        return (
          <Form
            onSubmit={(values) => {
              onSubmit(values);
              return { success: true };
            }}
          >
            {fieldComponents}
            <SubmitButton>Submit</SubmitButton>
          </Form>
        );
      }

      const { container } = render(<Harness />, { wrapper: makeWrapper() });
      const input = container.querySelector(`input[name="${variable}"]`);
      if (!(input instanceof HTMLInputElement)) {
        throw new Error('Legacy protocol field was not rendered');
      }

      fireEvent.change(input, { target: { value: 'preserved' } });
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ [variable]: 'preserved' });
      });
      expect(
        Object.getOwnPropertyDescriptor(Object.prototype, variable),
      ).toEqual(prototypeDescriptor);
    },
  );
});

/**
 * Issue #1385: comparison errors named the codebook variable to the
 * participant. The validation context now carries only authored,
 * participant-facing text, so there is nothing else for a validator to reach
 * for.
 */
describe('useProtocolForm variableLabels', () => {
  it('carries only authored participant-facing text', () => {
    const { result } = renderHook(
      () =>
        useProtocolForm({
          fields: [
            {
              variable: asEntityAttributeReference(NAME_VAR),
              prompt: 'What is your name?',
            },
            // A NetworkComposer field with no authored label: the codebook
            // variable's name must NOT stand in for one.
            {
              variable: asEntityAttributeReference(DISPLAY_NAME_VAR),
              component: 'Text',
            } as ComposerFormField,
          ],
          subject: { entity: 'node', type: NODE_TYPE },
        }),
      { wrapper: makeWrapper() },
    );

    const context = firstFieldValidationContext(result.current.fieldComponents);
    expect(isRecord(context) ? context.variableLabels : undefined).toEqual({
      [NAME_VAR]: 'What is your name?',
    });
  });
});
