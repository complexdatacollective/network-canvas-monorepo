import { configureStore } from '@reduxjs/toolkit';
import { render, renderHook, screen } from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import {
  asEntityAttributeReference,
  type FormField,
  type LocaleTag,
  type LocalizationDeclaration,
  type LocalizedString,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui from '../../store/modules/ui';
import { useVariableLabels } from '../buildVariableLabels';
import useProtocolForm from '../useProtocolForm';

const NODE_TYPE = 'person';
const ENGLISH_ONLY: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en'],
};
const ENGLISH_AND_FRENCH: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en', 'fr'],
};

function makeWrapper(
  localization: LocalizationDeclaration = ENGLISH_ONLY,
  locale: LocaleTag | null = null,
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
        localization,
        codebook: {
          node: {
            [NODE_TYPE]: {
              name: NODE_TYPE,
              label: { en: 'Person', fr: 'Personne' },
              variables: {
                age: {
                  name: 'age_years',
                  label: 'Age',
                  type: 'number',
                  component: 'Number',
                },
                siblings: {
                  name: 'sibling_count',
                  label: 'Siblings',
                  type: 'number',
                  component: 'Number',
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
        <TestProtocolLocalization localization={localization} locale={locale}>
          <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
            {children}
          </CurrentStepProvider>
        </TestProtocolLocalization>
      </Provider>
    );
  };
}

const field = (variable: string, prompt: LocalizedString): FormField => ({
  variable: asEntityAttributeReference(variable),
  prompt,
});

function Fields({ fields }: { fields: FormField[] }) {
  const { fieldComponents } = useProtocolForm({
    fields,
    subject: { entity: 'node', type: NODE_TYPE },
  });
  return <Form onSubmit={() => ({ success: true })}>{fieldComponents}</Form>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The variable names the comparison validators receive with the form. */
function variableLabelsOf(fields: FormField[], wrapper = makeWrapper()) {
  const { result } = renderHook(
    () =>
      useProtocolForm({
        fields,
        subject: { entity: 'node', type: NODE_TYPE },
      }).fieldComponents,
    { wrapper },
  );
  const element = Array.isArray(result.current)
    ? result.current[0]
    : result.current;
  if (!isValidElement(element) || !isRecord(element.props)) return undefined;
  const { validationContext } = element.props;
  return isRecord(validationContext)
    ? validationContext.variableLabels
    : undefined;
}

/**
 * What a field is called has one rule, `authoredFieldLabel`, and two outputs:
 * the caption the participant reads, and the name a comparison validator may
 * use for the same variable in an error message. They are derived from one
 * computation so a participant can never be sent to fix "your answer to X"
 * when nothing on the screen is called X.
 */
describe('the caption and the validator name come from one rule', () => {
  it('captions a field with the prompt the researcher authored', () => {
    render(<Fields fields={[field('age', { en: 'How old are you?' })]} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByLabelText('How old are you?')).toBeInTheDocument();
  });

  it('captions a field whose prompt is blank with the codebook label, never the variable name', () => {
    render(<Fields fields={[field('age', { en: '   ' })]} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByLabelText('Age')).toBeInTheDocument();
    expect(screen.queryByText('age_years')).not.toBeInTheDocument();
  });

  it('does not offer that fallback caption to a validator', () => {
    // The participant sees "Age" because something has to name the control,
    // but the researcher wrote no question, so no error message may repeat a
    // caption back as though they had.
    expect(variableLabelsOf([field('age', { en: '   ' })])).toEqual({});
  });

  it('names a variable in an error exactly as the field captions it', () => {
    const fields = [
      field('age', { en: 'How old are you?' }),
      field('siblings', { en: 'How many siblings?' }),
    ];
    render(<Fields fields={fields} />, { wrapper: makeWrapper() });

    expect(variableLabelsOf(fields)).toEqual({
      age: 'How old are you?',
      siblings: 'How many siblings?',
    });
    expect(screen.getByLabelText('How old are you?')).toBeInTheDocument();
    expect(screen.getByLabelText('How many siblings?')).toBeInTheDocument();
  });

  it('captions and names a field in the interview language, and falls back to the untranslated attribute label', () => {
    const fields = [
      field('age', { en: 'How old are you?', fr: 'Quel âge avez-vous ?' }),
      field('siblings', { en: '' }),
    ];
    const wrapper = makeWrapper(ENGLISH_AND_FRENCH, 'fr');
    render(<Fields fields={fields} />, { wrapper });

    expect(screen.getByLabelText('Quel âge avez-vous ?')).toBeInTheDocument();
    expect(screen.getByLabelText('Siblings')).toBeInTheDocument();
    expect(variableLabelsOf(fields, wrapper)).toEqual({
      age: 'Quel âge avez-vous ?',
    });
  });

  it('prefers a composer field label over a prompt when a field carries both', () => {
    const { result } = renderHook(
      () =>
        useVariableLabels([
          {
            variable: 'age',
            label: { en: 'Age' },
            prompt: { en: 'How old are they?' },
          },
        ]),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <TestProtocolLocalization>{children}</TestProtocolLocalization>
        ),
      },
    );

    expect(result.current).toEqual({ age: 'Age' });
  });
});
