import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
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
});
