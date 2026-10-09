import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createMessageError } from '@codaco/app-i18n/messages';
import { formMessages } from '@codaco/fresco-ui/form/hooks/useForm';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import {
  asEntityAttributeReference,
  type FormField,
} from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import * as attributePatch from '../../../forms/formValuesToAttributePatch';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import PersonForm, { type PersonFormResult } from '../components/PersonForm';
import { readFamily } from '../model';
import type { OwnedOptionLabels } from '../options';
import { PedigreeWordsProvider } from '../pedigreeWords';
import { config, person } from './fixtures';
import { pedigreeWordsIn } from './pedigreeWords';

const OPTION_LABELS: OwnedOptionLabels = {
  sexAssignedAtBirth: {
    female: 'Female',
    male: 'Male',
    intersex: 'Intersex',
    unknown: 'Don’t know',
    preferNotToSay: 'Prefer not to say',
  },
  parentKind: {
    biological: 'Biological parent',
    adoptive: 'Adoptive parent',
    social: 'Step or social parent',
    donor: 'Egg or sperm donor',
    surrogate: 'Surrogate',
  },
};

// The form's error list animates into view, which jsdom cannot observe.
beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
});

const FORM_ID = 'person-form';
const NICKNAME = 'nickname';

const nicknameField: FormField = {
  variable: asEntityAttributeReference(NICKNAME),
  prompt: { en: 'Nickname' },
};

type Setup = {
  nodes: NcNode[];
  nameValidation?: Record<string, unknown>;
  formFields?: FormField[];
  /** Each encrypted name decrypted, by person id. */
  decryptedNames?: ReadonlyMap<string, string>;
  optionLabels?: OwnedOptionLabels;
  /** What storing the submission comes to. */
  submitted?: Promise<FormSubmissionResult>;
};

/** The pedigree's side panel, editing `editing`, in an interview whose network
 * holds `nodes`. */
function renderPersonForm(
  editing: string,
  {
    nodes,
    nameValidation,
    formFields = [],
    decryptedNames = new Map(),
    optionLabels = OPTION_LABELS,
    submitted = Promise.resolve({ success: true }),
  }: Setup,
) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes,
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
            person: {
              name: 'person',
              label: { en: 'Person' },
              variables: {
                name: {
                  name: 'name',
                  type: 'text',
                  component: 'Text',
                  ...(nameValidation ? { validation: nameValidation } : {}),
                },
                [NICKNAME]: {
                  name: NICKNAME,
                  type: 'text',
                  component: 'Text',
                },
                sex: { name: 'sex', type: 'categorical', options: [] },
                gender: { name: 'gender', type: 'categorical', options: [] },
              },
            },
          },
        },
        stages: [
          {
            id: 'pedigree',
            type: 'FamilyPedigree',
            subject: { entity: 'node', type: 'person' },
          },
        ],
      } as never,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });

  const family = readFamily(nodes, [], config);
  const edited = family.byId.get(editing);
  if (!edited) throw new Error(`No person ${editing}`);
  const onSubmit = vi
    .fn<(result: PersonFormResult) => Promise<FormSubmissionResult>>()
    .mockImplementation(() => submitted);

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <TestProtocolLocalization>
      <PedigreeWordsProvider value={pedigreeWordsIn()}>
        <Provider store={store}>
          <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
            <FormStoreProvider>{children}</FormStoreProvider>
          </CurrentStepProvider>
        </Provider>
      </PedigreeWordsProvider>
    </TestProtocolLocalization>
  );

  render(
    <>
      <PersonForm
        formId={FORM_ID}
        mode={{ kind: 'edit', person: edited, missing: [], unavailable: [] }}
        family={family}
        config={{ ...config, genderIdentity: undefined }}
        framing="gendered"
        genderIdentityOptions={[]}
        optionLabels={optionLabels}
        formFields={formFields}
        generatedLabels={{}}
        decryptedNames={decryptedNames}
        displayName={(id) => id}
        nameField={{
          prompt: { en: 'Name (optional)' },
          hint: { en: 'A first name or nickname is fine.' },
        }}
        onSubmit={onSubmit}
      />
      <SubmitButton form={FORM_ID}>Save</SubmitButton>
    </>,
    { wrapper: Wrapper },
  );
  return { onSubmit, user: userEvent.setup() };
}

const save = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Save' }));

const nameField = () => screen.getByRole('textbox', { name: /^Name/ });

describe('the person form', () => {
  it('refuses to save when a researcher answer cannot be stored, saving none of it', async () => {
    const reject = vi
      .spyOn(attributePatch, 'formValuesToAttributePatch')
      .mockReturnValue({
        success: false,
        error: { code: 'invalid-variable-value', fieldNames: [NICKNAME] },
      });
    try {
      const { onSubmit, user } = renderPersonForm('bea', {
        nodes: [person('bea', { sex: ['female'] })],
        formFields: [nicknameField],
      });
      await user.type(screen.getByRole('textbox', { name: /Nickname/ }), 'Bee');
      await save(user);

      await waitFor(() => expect(reject).toHaveBeenCalled());
      expect(
        await screen.findByText('An error occurred while submitting the form.'),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    } finally {
      reject.mockRestore();
    }
  });

  // The value the validators accepted is the value stored.
  it.each([
    {
      rule: 'unique',
      validation: { unique: true },
      typed: ' Julie ',
    },
    {
      rule: 'a minimum length',
      validation: { minLength: 5 },
      typed: '  Ann ',
    },
  ])(
    'stores a name with $rule exactly as it was validated',
    async ({ validation, typed }) => {
      const { onSubmit, user } = renderPersonForm('sis', {
        nodes: [
          person('mum', { name: 'Julie', sex: ['female'] }),
          person('sis', { sex: ['female'] }),
        ],
        nameValidation: validation,
      });
      await user.type(nameField(), typed);
      await save(user);

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0]?.[0].set.name).toBe(typed);
    },
  );

  it('keeps the answers and shows why when they could not be stored', async () => {
    const { onSubmit, user } = renderPersonForm('sis', {
      nodes: [person('sis', { sex: ['female'] })],
      submitted: Promise.resolve({
        success: false,
        formErrors: [createMessageError(formMessages.submitFailed)],
      }),
    });
    await user.type(nameField(), 'Ann');
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(
      await screen.findByText('An error occurred while submitting the form.'),
    ).toBeInTheDocument();
    expect(nameField()).toHaveValue('Ann');
  });

  it('offers the answers about sex assigned at birth as the codebook labels them', () => {
    renderPersonForm('sis', {
      nodes: [person('sis', { name: 'Bea', sex: ['female'] })],
      optionLabels: {
        ...OPTION_LABELS,
        sexAssignedAtBirth: {
          ...OPTION_LABELS.sexAssignedAtBirth,
          female: 'Assigned female at birth',
        },
      },
    });
    expect(
      screen.getByRole('radio', { name: 'Assigned female at birth' }),
    ).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Female' })).toBeNull();
  });

  it('leaves a name of only spaces unnamed', async () => {
    const { onSubmit, user } = renderPersonForm('sis', {
      nodes: [person('sis', { name: 'Bea', sex: ['female'] })],
    });
    await user.clear(nameField());
    await user.type(nameField(), '   ');
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [result] = onSubmit.mock.calls[0] ?? [];
    expect(result?.set).not.toHaveProperty('name');
    expect(result?.unset).toContain('name');
  });

  it('compares a name with the unique rule against the others decrypted', async () => {
    const { onSubmit, user } = renderPersonForm('sis', {
      nodes: [
        person('mum', { name: [1, 2, 3], sex: ['female'] }),
        person('sis', { sex: ['female'] }),
      ],
      nameValidation: { unique: true },
      decryptedNames: new Map([['mum', 'Julie']]),
    });
    await user.type(nameField(), 'Julie');
    await save(user);

    expect(await screen.findByText('Must be unique.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
