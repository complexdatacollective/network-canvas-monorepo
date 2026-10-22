import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import * as attributePatch from '../../../forms/formValuesToAttributePatch';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import {
  encryptionFor,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import { generateSecureAttributes } from '../../Anonymisation/utils';
import PersonForm, {
  type GenderIdentityOption,
  type PersonFormResult,
} from '../components/PersonForm';
import {
  familyWithPlan,
  planAddRelative,
  type Relation,
  readFamily,
  siblingTie,
} from '../model';
import type { OwnedOptionLabels } from '../options';
import { PedigreeWordsProvider } from '../pedigreeWords';
import { config, link, person } from './fixtures';
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
  edges?: NcEdge[];
  /** Adds a relative of the person, rather than editing them. */
  adding?: Relation;
  nameValidation?: Record<string, unknown>;
  /** Overrides the codebook's definition of the nickname variable. */
  nicknameVariable?: Record<string, unknown>;
  formFields?: FormField[];
  /** Each encrypted name decrypted, by person id. */
  decryptedNames?: ReadonlyMap<string, string>;
  optionLabels?: OwnedOptionLabels;
  /** What storing the submission comes to. */
  submitted?: Promise<FormSubmissionResult>;
  /** Asks about gender identity, offering these options. */
  genderIdentityOptions?: GenderIdentityOption[];
  /**
   * The protocol's default language, which its wording is shown in. The
   * fixture's own text is English, so English is declared too.
   */
  protocolLocale?: string;
};

/** The pedigree's side panel, editing `editing` (or adding a relative of
 * them), in an interview whose network holds `nodes` and `edges`. */
function renderPersonForm(
  editing: string,
  {
    nodes,
    edges = [],
    adding,
    nameValidation,
    nicknameVariable = {},
    formFields = [],
    decryptedNames = new Map(),
    optionLabels = OPTION_LABELS,
    submitted = Promise.resolve({ success: true }),
    genderIdentityOptions,
    protocolLocale = 'en',
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
          edges,
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
                  ...nicknameVariable,
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

  // A node with the id `standIn` is one the stage generated.
  const family = readFamily(
    nodes,
    edges,
    config,
    {},
    new Map(),
    new Set(['standIn']),
  );
  const edited = family.byId.get(editing);
  if (!edited) throw new Error(`No person ${editing}`);
  const onSubmit = vi
    .fn<(result: PersonFormResult) => Promise<FormSubmissionResult>>()
    .mockImplementation(() => submitted);

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <TestProtocolLocalization
      localization={{
        defaultLocale: protocolLocale,
        locales: [...new Set([protocolLocale, 'en'])],
      }}
    >
      <PedigreeWordsProvider value={pedigreeWordsIn(protocolLocale)}>
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
        mode={
          adding
            ? {
                kind: 'add',
                relation: adding,
                anchor: edited,
                ids: ['added', 'new-1', 'new-2'],
              }
            : { kind: 'edit', person: edited, unavailable: [] }
        }
        family={family}
        config={
          genderIdentityOptions
            ? config
            : { ...config, genderIdentity: undefined }
        }
        framing="gendered"
        genderIdentityOptions={genderIdentityOptions ?? []}
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
  return { onSubmit, store, user: userEvent.setup() };
}

const save = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Save' }));

const nameField = () => screen.getByRole('textbox', { name: /^Name/ });

/** "Who carried the pregnancy?", asked in the child and sibling forms. */
const whoCarried = () =>
  screen.getByRole('radiogroup', { name: /^Who carried the pregnancy\?/ });
const queryWhoCarried = () =>
  screen.queryByRole('radiogroup', { name: /^Who carried the pregnancy\?/ });

/** The answer to who carried them that names nobody, which can always be
 * given. */
const NOBODY_KNOWN = 'Someone else, or I don’t know';

/** Answers the required question of who carried them: by default with the
 * answer that records no carrier. */
const answerWhoCarried = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string = NOBODY_KNOWN,
) => user.click(within(whoCarried()).getByRole('radio', { name }));

/** Answers who carried them, recording no carrier, while it is asked: it is
 * asked only while a parent the answers give them could have carried. */
const answerWhoCarriedIfAsked = async (
  user: ReturnType<typeof userEvent.setup>,
) => {
  if (queryWhoCarried()) await answerWhoCarried(user);
};

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

  it('saves without a gender identity, which a participant may not know', async () => {
    const { onSubmit, user } = renderPersonForm('dad', {
      nodes: [person('dad', { sex: ['male'] })],
      genderIdentityOptions: [
        { value: 'woman', label: 'Woman' },
        { value: 'man', label: 'Man' },
      ],
    });
    expect(screen.getByRole('radio', { name: 'Man' })).not.toBeChecked();
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [result] = onSubmit.mock.calls[0] ?? [];
    expect(result?.set).not.toHaveProperty('gender');
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

  // #2150: a researcher field is validated by the shared protocol form, which
  // must compare with the others' stored answers decrypted, not as ciphertext.
  describe('with a unique researcher answer stored encrypted', () => {
    const PASSPHRASE = 'pedigree unique passphrase';
    const encryptedNickname = {
      encrypted: true,
      validation: { unique: true },
    };

    async function mumNicknamed(nickname: string): Promise<NcNode> {
      const { encryptedAttributes, secureAttributes } =
        await generateSecureAttributes(
          { [NICKNAME]: nickname },
          {
            [NICKNAME]: {
              name: NICKNAME,
              type: 'text',
              component: 'Text',
              encrypted: true,
            },
          },
          (await encryptionFor(PASSPHRASE)).key,
          'mum',
        );
      return {
        ...person('mum', { ...encryptedAttributes, sex: ['female'] }),
        [entitySecureAttributesMeta]: secureAttributes,
      };
    }

    async function renderWithMum(nickname: string) {
      const rendered = renderPersonForm('sis', {
        nodes: [
          await mumNicknamed(nickname),
          person('sis', { sex: ['female'] }),
        ],
        formFields: [nicknameField],
        nicknameVariable: encryptedNickname,
      });
      await act(() => unlockWith(rendered.store, PASSPHRASE));
      return rendered;
    }

    it('refuses an answer another person already has', async () => {
      const { onSubmit, user } = await renderWithMum('Jules');
      await user.type(
        screen.getByRole('textbox', { name: /Nickname/ }),
        'Jules',
      );
      await save(user);

      expect(await screen.findByText('Must be unique.')).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('accepts an answer nobody else has', async () => {
      const { onSubmit, user } = await renderWithMum('Jules');
      await user.type(screen.getByRole('textbox', { name: /Nickname/ }), 'Jo');
      await save(user);

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(screen.queryByText('Must be unique.')).toBeNull();
    });
  });
});

describe('adding a sibling', () => {
  const sharedParents = () =>
    screen.getByRole('group', { name: /^Which parents do they share/ });

  // The stand-in rule (`planStandIns`) gives anyone with one genetic parent
  // a stand-in for the other, so the form offers the stand-in among the
  // parents recorded, and never a parent "not shown yet".
  it('offers the stand-in for a parent not yet recorded among the parents, none chosen until the participant chooses', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('mum', { sex: ['female'] }),
        person('standIn', { sex: ['male'] }),
      ],
      edges: [
        link('mum', 'ego', 'biological'),
        link('standIn', 'ego', 'biological'),
      ],
      adding: 'sibling',
    });
    const boxes = within(sharedParents()).getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    for (const name of ['mum', 'standIn']) {
      expect(
        within(sharedParents()).getByRole('checkbox', { name }),
      ).not.toBeChecked();
    }
    expect(screen.queryByText(/not shown yet/)).toBeNull();
    for (const name of ['mum', 'standIn']) {
      await user.click(within(sharedParents()).getByRole('checkbox', { name }));
    }
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    await answerWhoCarried(user);
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toEqual(
      expect.objectContaining({
        sharedParentIds: ['mum', 'standIn'],
        sharesOnly: undefined,
      }),
    );
  });

  it('never offers a parent not shown yet, even beside one parent and no stand-in', () => {
    // A family read before its stand-ins are written: the stage adds them on
    // opening, and the form offers only the parents recorded meanwhile.
    renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('mum', { sex: ['female'] }),
      ],
      edges: [link('mum', 'ego', 'biological', { carrier: true })],
      adding: 'sibling',
    });
    expect(within(sharedParents()).getAllByRole('checkbox')).toHaveLength(1);
    expect(
      within(sharedParents()).getByRole('checkbox', { name: 'mum' }),
    ).not.toBeChecked();
    expect(screen.queryByText(/not shown yet/)).toBeNull();
  });

  it('offers no parent not shown yet to someone whose genetic parents are all recorded', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('mum', { sex: ['female'] }),
        person('donor', { sex: ['male'] }),
      ],
      edges: [
        link('mum', 'ego', 'biological', { carrier: true }),
        link('donor', 'ego', 'donor'),
      ],
      adding: 'sibling',
    });
    // The donor is offered too (ruling 20), but nobody not shown yet.
    expect(
      within(sharedParents())
        .getAllByRole('checkbox')
        .map((box) => box.getAttribute('aria-label') ?? box.textContent),
    ).toHaveLength(2);
    expect(
      within(sharedParents()).queryByRole('checkbox', {
        name: /not shown yet/,
      }),
    ).toBeNull();
    await user.click(
      within(sharedParents()).getByRole('checkbox', { name: 'mum' }),
    );
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    await answerWhoCarried(user);
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      sharedParentIds: ['mum'],
    });
  });
});

describe('adding a sibling, as the answers stand', () => {
  it('offers nobody as having carried them while no shared parent is chosen', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['female'] }),
        person('hannah', { name: 'Hannah', sex: ['female'] }),
        person('dan', { sex: ['male'] }),
      ],
      edges: [
        link('hannah', 'ego', 'biological', { carrier: true }),
        link('dan', 'ego', 'donor'),
      ],
      adding: 'sibling',
    });
    const carrier = () =>
      screen.queryByRole('radiogroup', { name: /^Who carried the pregnancy/ });
    const hannah = () =>
      within(
        screen.getByRole('group', { name: /^Which parents do they share/ }),
      ).getByRole('checkbox', { name: 'hannah' });
    // No shared parent starts chosen, so nobody is offered as the carrier.
    expect(hannah()).not.toBeChecked();
    expect(carrier()).toBeNull();
    await user.click(hannah());
    // Who carried them also waits for the kind of sibling to be chosen.
    expect(carrier()).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    await waitFor(() => expect(carrier()).not.toBeNull());
    await user.click(hannah());
    await waitFor(() => expect(carrier()).toBeNull());
  });

  it('says which unnamed parents are added, as the answer about the shared parent stands', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [person('ego', { isEgo: true, sex: ['male'] })],
      adding: 'sibling',
    });
    expect(
      screen.getByText(/so the family tree can show these siblings together/),
    ).toBeVisible();
    await user.click(
      screen.getByRole('radio', { name: 'Only the biological mother' }),
    );
    expect(
      await screen.findByText(
        /The sibling shares the mother, and is given a biological father of their own\./,
      ),
    ).toBeVisible();
    await user.click(
      screen.getByRole('radio', { name: 'Only the biological father' }),
    );
    expect(
      await screen.findByText(
        /The sibling shares the father, and is given a biological mother of their own\./,
      ),
    ).toBeVisible();
  });
});

describe('the kinds a relative can be added as', () => {
  it('adds a child as a donor’s donor-conceived child', async () => {
    const { onSubmit, user } = renderPersonForm('donor', {
      nodes: [
        person('ego', { isEgo: true, sex: ['female'] }),
        person('donor', { sex: ['male'] }),
      ],
      edges: [link('donor', 'ego', 'donor')],
      adding: 'child',
    });
    await user.click(
      screen.getByRole('radio', {
        name: 'A child conceived with an egg or sperm they donated',
      }),
    );
    await user.click(screen.getByRole('radio', { name: 'No other parent' }));
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      parentKind: 'donor',
      otherParent: null,
    });
  });

  it('offers a biological sibling of two mothers, one a step-parent', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('amy', { sex: ['female'] }),
        person('beth', { sex: ['female'] }),
      ],
      edges: [
        link('amy', 'beth', 'partner'),
        link('amy', 'ego', 'biological', { carrier: true }),
        link('beth', 'ego', 'social'),
      ],
      adding: 'sibling',
    });
    const shared = screen.getByRole('group', {
      name: /^Which parents do they share/,
    });
    const beth = within(shared).getByRole('checkbox', { name: 'beth' });
    expect(beth).not.toBeChecked();
    await user.click(beth);
    expect(beth).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'A biological child' }),
    ).toBeEnabled();
  });
});

describe('adding a child', () => {
  const otherParent = () =>
    screen.getByRole('radiogroup', { name: /^Who is the child’s other/ });

  it('offers the current partner and a former one as the other parent, none chosen until the participant chooses', async () => {
    const { onSubmit, user } = renderPersonForm('kayla', {
      nodes: [
        person('kayla', { sex: ['female'] }),
        person('father', { sex: ['male'] }),
        person('tyler', { sex: ['male'] }),
      ],
      edges: [
        link('kayla', 'father', 'partner', { current: false }),
        link('kayla', 'tyler', 'partner', { current: true }),
      ],
      adding: 'child',
    });
    for (const option of within(otherParent()).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
    await user.click(
      within(otherParent()).getByRole('radio', { name: 'tyler' }),
    );
    expect(
      within(otherParent()).getByRole('radio', { name: 'father' }),
    ).not.toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    await user.click(
      within(
        screen.getByRole('radiogroup', {
          name: /^Who is the child’s biological parent/,
        }),
      ).getByRole('radio', { name: 'kayla' }),
    );
    await answerWhoCarried(user);
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      otherParent: 'tyler',
    });
  });

  it('chooses no other parent while it could be either of two current partners', async () => {
    const { onSubmit, user } = renderPersonForm('kayla', {
      nodes: [
        person('kayla', { sex: ['female'] }),
        person('ana', { sex: ['female'] }),
        person('tyler', { sex: ['male'] }),
      ],
      edges: [
        link('kayla', 'ana', 'partner', { current: true }),
        link('kayla', 'tyler', 'partner', { current: true }),
      ],
      adding: 'child',
    });
    for (const option of within(otherParent()).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
    // Left unanswered, it is asked rather than recorded as no other parent.
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);
    await waitFor(() =>
      expect(otherParent()).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('asks whether a step-child’s other parent is their biological parent, assuming neither', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('ben', { name: 'Ben', sex: ['male'] }),
      ],
      edges: [link('ego', 'ben', 'partner')],
      adding: 'child',
    });
    for (const option of within(otherParent()).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
    await user.click(within(otherParent()).getByRole('radio', { name: 'ben' }));
    await user.click(
      screen.getByRole('radio', {
        name: 'A step-child or other child you raise',
      }),
    );
    const question = await screen.findByRole('radiogroup', {
      name: /^Is “ben” the child’s biological parent\?/,
    });
    for (const option of within(question).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
    await user.click(within(question).getByRole('radio', { name: 'Yes' }));
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      otherParent: 'ben',
      parentKind: 'social',
      biologicalParent: 'otherParent',
    });
  });

  it('offers the other parent of an earlier child, who is not a partner', () => {
    renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('theo'),
        person('theoMum', { sex: ['female'] }),
      ],
      edges: [
        link('ego', 'theo', 'biological'),
        link('theoMum', 'theo', 'biological', { carrier: true }),
      ],
      adding: 'child',
    });
    expect(
      within(
        screen.getByRole('radiogroup', { name: /^Who is the child’s other/ }),
      ).getByRole('radio', { name: 'theoMum' }),
    ).toBeInTheDocument();
  });
});

describe('an answer that cannot be chosen', () => {
  it('says which recorded parent rules out a kind of parent', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['female'] }),
        person('shannon', { sex: ['female'] }),
      ],
      edges: [link('shannon', 'ego', 'biological', { carrier: true })],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    const kind = screen.getByRole('radiogroup', {
      name: /^What kind of parent are they\?/,
    });
    await waitFor(() =>
      expect(
        within(kind).getByRole('radio', { name: 'Biological parent' }),
      ).toBeDisabled(),
    );
    expect(kind).toHaveAccessibleDescription(/“shannon”.*“Female” at birth/);
    expect(kind).toHaveAccessibleDescription(
      /“shannon” is recorded as having carried you/,
    );
  });

  it('names the other genetic parent whose sex at birth rules a sex out', () => {
    renderPersonForm('robin', {
      nodes: [
        person('ego', { isEgo: true, sex: ['female'] }),
        person('robin', { sex: ['intersex'] }),
        person('donor', { sex: ['male'] }),
      ],
      edges: [
        link('robin', 'ego', 'biological', { carrier: true }),
        link('donor', 'ego', 'donor'),
      ],
    });
    const sex = screen.getByRole('radiogroup', {
      name: /^Sex assigned at birth/,
    });
    expect(within(sex).getByRole('radio', { name: 'Male' })).toBeDisabled();
    expect(sex).toHaveAccessibleDescription(/“donor”.*“Male” at birth/);
  });
});

// Ruling 19: "carried the pregnancy" is a yes/no answer about any kind of
// parent — biological, adoptive, social or donor — and a surrogate always
// carried.
describe('a parent of any kind who carried the pregnancy', () => {
  const yesTo = (question: RegExp) =>
    within(screen.getByRole('radiogroup', { name: question })).getByRole(
      'radio',
      { name: 'Yes' },
    );

  it('asks whether a new parent carried the pregnancy only once their kind is chosen', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [person('ego', { isEgo: true, sex: ['male'] })],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    expect(
      screen.queryByRole('radiogroup', {
        name: /^Did this parent carry the pregnancy\?/,
      }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Biological parent' }));
    expect(
      screen.getByRole('radiogroup', {
        name: /^Did this parent carry the pregnancy\?/,
      }),
    ).toBeInTheDocument();
  });

  it('asks whether a new step or social parent carried the pregnancy', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [person('ego', { isEgo: true, sex: ['male'] })],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await user.click(
      screen.getByRole('radio', { name: 'Step or social parent' }),
    );
    await user.click(yesTo(/^Did this parent carry the pregnancy\?/));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      parentKind: 'social',
      carriedPregnancy: true,
    });
  });

  it('does not ask whether a new adoptive parent carried the pregnancy', async () => {
    // Someone else carried an adopted child: the model records that the
    // adoptive parent did not (`carrierAnswer`).
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [person('ego', { isEgo: true, sex: ['male'] })],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await user.click(screen.getByRole('radio', { name: 'Adoptive parent' }));
    expect(
      screen.queryByRole('radiogroup', {
        name: /^Did this parent carry the pregnancy\?/,
      }),
    ).toBeNull();
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      parentKind: 'adoptive',
      carriedPregnancy: undefined,
    });
  });

  // Decided gap (9 Oct 2026): not answered records nothing, told apart
  // from "No".
  it('records nothing about carrying for a new parent when the question is left unanswered', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [person('ego', { isEgo: true, sex: ['male'] })],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await user.click(
      screen.getByRole('radio', { name: 'Step or social parent' }),
    );
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const request = onSubmit.mock.calls[0]?.[0].request;
    expect(request).toMatchObject({ parentKind: 'social' });
    expect(request).toHaveProperty('carriedPregnancy', undefined);
  });

  it('shows neither answer to whether a parent carried them when nothing is recorded, and writes nothing on saving', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('amy', { sex: ['female'] }),
        person('ann', { sex: ['female'] }),
      ],
      edges: [
        link('amy', 'ego', 'adoptive'),
        link('ann', 'ego', 'adoptive', { carrier: false }),
      ],
    });
    const unknown = screen.getByRole('radiogroup', {
      name: /^Did amy carry the pregnancy\?/,
    });
    for (const option of within(unknown).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
    expect(
      within(
        screen.getByRole('radiogroup', {
          name: /^Did ann carry the pregnancy\?/,
        }),
      ).getByRole('radio', { name: 'No' }),
    ).toBeChecked();
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].linkUpdates).toEqual([]);
  });

  it('offers a new child’s social parent as having carried them', async () => {
    const { onSubmit, user } = renderPersonForm('jo', {
      nodes: [
        person('jo', { isEgo: true, sex: ['female'] }),
        person('amy', { sex: ['female'] }),
      ],
      edges: [link('jo', 'amy', 'partner')],
      adding: 'child',
    });
    await user.click(
      within(
        screen.getByRole('radiogroup', { name: /^Who is the child’s other/ }),
      ).getByRole('radio', { name: 'amy' }),
    );
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    await user.click(
      within(
        screen.getByRole('radiogroup', {
          name: /^Who is the child’s biological parent/,
        }),
      ).getByRole('radio', { name: 'jo' }),
    );
    await user.click(
      within(
        screen.getByRole('radiogroup', {
          name: /^Who carried the pregnancy\?/,
        }),
      ).getByRole('radio', { name: 'amy' }),
    );
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      biologicalParent: 'anchor',
      carrier: 'otherParent',
    });
  });

  it('offers only answers that make the new person the participant’s sibling', async () => {
    // Someone the parents raise as a step-child shares neither a genetic nor
    // an adoptive parent with the participant, so is not their sibling.
    const nodes = [
      person('ego', { isEgo: true, sex: ['male'] }),
      person('amy', { sex: ['female'] }),
      person('rob', { sex: ['male'] }),
    ];
    const edges = [
      link('amy', 'ego', 'biological', { carrier: true }),
      link('rob', 'ego', 'biological'),
    ];
    const family = readFamily(nodes, edges, config);
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes,
      edges,
      adding: 'sibling',
    });
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    for (const parent of ['amy', 'rob']) {
      await user.click(
        within(
          screen.getByRole('group', { name: /^Which parents do they share/ }),
        ).getByRole('checkbox', { name: parent }),
      );
    }
    const kinds = within(
      screen.getByRole('radiogroup', {
        name: /^To the parents they share, are they…/,
      }),
    ).getAllByRole('radio');
    expect(kinds.length).toBeGreaterThan(0);
    for (const [index, kind] of kinds.entries()) {
      await user.click(kind);
      const carrier = screen.queryByRole('radiogroup', {
        name: /^Who carried the pregnancy\?/,
      });
      if (carrier) {
        await user.click(within(carrier).getAllByRole('radio')[0]!);
      }
      await save(user);
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(index + 1));
      const { request } = onSubmit.mock.calls[index]![0];
      if (!request) throw new Error('No addition saved');
      let counter = 0;
      const plan = planAddRelative({
        family,
        anchorId: 'ego',
        newPersonId: 'added',
        details: {},
        request,
        createId: () => `new-${++counter}`,
        sexAttribute: config.sexAssignedAtBirthAttribute,
      });
      const after = familyWithPlan(
        family,
        plan.people,
        plan.links,
        config.sexAssignedAtBirthAttribute,
      );
      expect(
        siblingTie(after, 'ego', 'added'),
        `answer ${kind.getAttribute('data-value')}`,
      ).toBeDefined();
    }
  });

  // Decided gap (9 Oct 2026), as ruling 20 offers donors.
  it('offers the surrogate who carried the participant among the parents a sibling shares, who then carried the sibling', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('amy', { sex: ['female'] }),
        person('rob', { sex: ['male'] }),
        person('gail', { sex: ['female'] }),
      ],
      edges: [
        link('amy', 'ego', 'biological'),
        link('rob', 'ego', 'biological'),
        link('gail', 'ego', 'surrogate', { carrier: true }),
      ],
      adding: 'sibling',
    });
    const shared = screen.getByRole('group', {
      name: /^Which parents do they share with you\?/,
    });
    const surrogate = within(shared).getByRole('checkbox', { name: 'gail' });
    expect(surrogate).not.toBeChecked();
    // Nobody is offered as having carried them before a parent is shared and
    // a kind of sibling is chosen.
    expect(
      screen.queryByRole('radiogroup', {
        name: /^Who carried the pregnancy\?/,
      }),
    ).toBeNull();
    for (const parent of ['amy', 'rob']) {
      await user.click(within(shared).getByRole('checkbox', { name: parent }));
    }
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    expect(
      await screen.findByRole('radiogroup', {
        name: /^Who carried the pregnancy\?/,
      }),
    ).toBeInTheDocument();
    await user.click(surrogate);
    await waitFor(() =>
      expect(
        screen.queryByRole('radiogroup', {
          name: /^Who carried the pregnancy\?/,
        }),
      ).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      sharedParentIds: ['amy', 'rob', 'gail'],
    });
  });

  it('does not ask who carried a new adopted sibling', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('amy', { sex: ['female'] }),
        person('rob', { sex: ['male'] }),
      ],
      edges: [link('amy', 'ego', 'adoptive'), link('rob', 'ego', 'adoptive')],
      adding: 'sibling',
    });
    for (const parent of ['amy', 'rob']) {
      await user.click(
        within(
          screen.getByRole('group', { name: /^Which parents do they share/ }),
        ).getByRole('checkbox', { name: parent }),
      );
    }
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    expect(
      await screen.findByRole('radiogroup', {
        name: /^Who carried the pregnancy\?/,
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'An adopted child' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('radiogroup', {
          name: /^Who carried the pregnancy\?/,
        }),
      ).not.toBeInTheDocument(),
    );
  });

  it('records that an existing adoptive parent carried the pregnancy', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('amy', { sex: ['female'] }),
      ],
      edges: [link('amy', 'ego', 'adoptive')],
    });
    await user.click(yesTo(/^Did amy carry the pregnancy\?/));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].linkUpdates).toEqual([
      {
        linkId: 'amy-ego-adoptive',
        kind: 'adoptive',
        isGestationalCarrier: true,
        isCurrentPartner: true,
      },
    ]);
  });
});

// An adopted sibling's adoptive parents are recorded as not having carried
// them; that "No" rests on the adoption, so it goes once the parent is
// recorded as another kind (Joshua, 22 Oct 2026).
describe('carrying recorded for an adoptive parent', () => {
  it('asks again whether a parent carried the pregnancy once they are no longer an adoptive parent', async () => {
    const { onSubmit, user } = renderPersonForm('sib', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('sib', { sex: ['female'] }),
        person('amy', { sex: ['female'] }),
      ],
      edges: [link('amy', 'sib', 'adoptive', { carrier: false })],
    });
    const carried = () =>
      screen.getByRole('radiogroup', {
        name: /^Did amy carry the pregnancy\?/,
      });
    expect(within(carried()).getByRole('radio', { name: 'No' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Biological parent' }));
    await waitFor(() => {
      for (const option of within(carried()).getAllByRole('radio')) {
        expect(option).not.toBeChecked();
      }
    });
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].linkUpdates).toEqual([
      {
        linkId: 'amy-sib-adoptive',
        kind: 'biological',
        isGestationalCarrier: undefined,
        isCurrentPartner: true,
      },
    ]);
  });
});

// Ruling 21: an answer that would record a second carrier is unavailable,
// with a reason naming who carried them.
describe('a second carrier', () => {
  it('shows an existing parent’s carrying question unavailable, naming who carried them', () => {
    renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('mum', { sex: ['female'] }),
        person('amy', { sex: ['female'] }),
      ],
      edges: [
        link('mum', 'ego', 'biological', { carrier: true }),
        link('amy', 'ego', 'adoptive'),
      ],
    });
    const question = screen.getByRole('radiogroup', {
      name: /^Did amy carry the pregnancy\?/,
    });
    expect(within(question).getByRole('radio', { name: 'Yes' })).toBeDisabled();
    expect(question).toHaveAccessibleDescription(
      /“mum” is recorded as having carried you/,
    );
    // Only "Yes" would record a second carrier: "No" stays, and is the
    // answer.
    const no = within(question).getByRole('radio', { name: 'No' });
    expect(no).toBeEnabled();
    expect(no).toBeChecked();
  });

  it('shows a parent’s carrying question unavailable while a surrogate who is not their parent carried a twin, naming them', () => {
    // Sue carried Sam, the participant's twin, as a surrogate: twins come
    // from one pregnancy, so Mum cannot have carried the participant.
    renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('sam', { sex: ['male'] }),
        person('mum', { sex: ['female'] }),
        person('dad', { sex: ['male'] }),
        person('sue', { sex: ['female'] }),
      ],
      edges: [
        link('mum', 'ego', 'biological'),
        link('dad', 'ego', 'biological'),
        link('mum', 'sam', 'biological'),
        link('dad', 'sam', 'biological'),
        link('sue', 'sam', 'surrogate', { carrier: true }),
        link('ego', 'sam', 'unknownZygosityTwin'),
      ],
    });
    const question = screen.getByRole('radiogroup', {
      name: /^Did mum carry the pregnancy\?/,
    });
    expect(within(question).getByRole('radio', { name: 'Yes' })).toBeDisabled();
    expect(question).toHaveAccessibleDescription(
      /“sue” is recorded as having carried “sam”/,
    );
    expect(within(question).getByRole('radio', { name: 'No' })).toBeChecked();
  });

  it('gives only the sex at birth as the reason a parent who could not have carried cannot be a surrogate', () => {
    renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('mum', { sex: ['female'] }),
        person('dad', { sex: ['male'] }),
      ],
      edges: [
        link('mum', 'ego', 'biological', { carrier: true }),
        link('dad', 'ego', 'biological'),
      ],
    });
    const dad = screen.getByRole('radiogroup', { name: /^dad is your…/ });
    const surrogate = within(dad).getByRole('radio', { name: 'Surrogate' });
    expect(surrogate).toBeDisabled();
    expect(surrogate).toHaveAccessibleDescription(
      /^“Surrogate” is unavailable because “dad” is recorded as “Male” at birth, so they cannot have carried a pregnancy\. To choose it, first change their sex at birth\.$/,
    );
  });

  it('gives only the sex at birth as the reason a new parent who could not have carried cannot be a surrogate', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('mum', { sex: ['female'] }),
      ],
      edges: [link('mum', 'ego', 'biological', { carrier: true })],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Male' }));
    const surrogate = screen.getByRole('radio', { name: 'Surrogate' });
    expect(surrogate).toBeDisabled();
    expect(surrogate).toHaveAccessibleDescription(
      /^“Surrogate” is unavailable because this person is recorded as “Male” at birth, so they cannot have carried a pregnancy\. To choose it, first change their sex at birth\.$/,
    );
  });

  it('shows a new parent’s carrying question unavailable while someone carried a twin, naming them and the twin', async () => {
    // Twins come from one pregnancy: Sue carried Sam, so carried the
    // participant too.
    const { user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('sam', { sex: ['male'] }),
        person('sue', { sex: ['female'] }),
      ],
      edges: [
        link('sue', 'sam', 'surrogate', { carrier: true }),
        link('ego', 'sam', 'unknownZygosityTwin'),
      ],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    expect(screen.getByRole('radio', { name: 'Surrogate' })).toBeDisabled();
    await user.click(
      screen.getByRole('radio', { name: 'Step or social parent' }),
    );
    const question = await screen.findByRole('radiogroup', {
      name: /^Did this parent carry the pregnancy\?/,
    });
    expect(within(question).getByRole('radio', { name: 'Yes' })).toBeDisabled();
    expect(question).toHaveAccessibleDescription(
      /“sue” is recorded as having carried “sam”/,
    );
  });

  it('shows a new parent’s carrying question unavailable, naming who carried them', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('mum', { sex: ['female'] }),
      ],
      edges: [link('mum', 'ego', 'biological', { carrier: true })],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await user.click(
      screen.getByRole('radio', { name: 'Step or social parent' }),
    );
    const question = await screen.findByRole('radiogroup', {
      name: /^Did this parent carry the pregnancy\?/,
    });
    const yes = within(question).getByRole('radio', { name: 'Yes' });
    expect(yes).toBeDisabled();
    expect(question).toHaveAccessibleDescription(
      /“mum” is recorded as having carried you/,
    );
    expect(yes).toHaveAccessibleDescription(
      /^“Yes” is unavailable because “mum” is recorded as having carried you/,
    );
    const no = within(question).getByRole('radio', { name: 'No' });
    expect(no).toBeEnabled();
    expect(no).toBeChecked();
  });
});

// Rule: each unavailable answer gets its own clear reason, said once,
// naming the answers it disables, from the point of view of the panel's own
// person.
describe('reasons an answer is unavailable', () => {
  it('says once that an answer is unavailable for the two children the participant carried', () => {
    renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['female'] }),
        person('ava', { name: 'Ava' }),
        person('ben', { name: 'Ben' }),
      ],
      edges: [
        link('ego', 'ava', 'biological', { carrier: true }),
        link('ego', 'ben', 'biological', { carrier: true }),
      ],
    });
    const sex = screen.getByRole('radiogroup', {
      name: /^Sex assigned at birth/,
    });
    expect(sex).toHaveAccessibleDescription(
      /“Male” is unavailable because you are recorded as having carried ava and ben, and nobody recorded as “Male” at birth can carry a pregnancy\./,
    );
    const hint = sex.getAttribute('aria-describedby') ?? '';
    const text = hint
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    expect(text.match(/is unavailable/g)).toHaveLength(1);
    expect(
      within(sex).getByRole('radio', { name: 'Male' }),
    ).toHaveAccessibleDescription(/^“Male” is unavailable because/);
  });

  it('explains a sex at birth ruled out on a parent’s own panel from their point of view', () => {
    renderPersonForm('robert', {
      nodes: [
        person('ego', { isEgo: true, sex: ['female'] }),
        person('linda', { name: 'Linda', sex: ['female'] }),
        person('robert', { name: 'Robert', sex: ['male'] }),
        person('sam', { name: 'Sam', sex: ['male'] }),
      ],
      edges: [
        link('linda', 'ego', 'biological', { carrier: true }),
        link('robert', 'ego', 'biological'),
        link('linda', 'sam', 'biological', { carrier: true }),
        link('robert', 'sam', 'biological'),
      ],
    });
    const sex = screen.getByRole('radiogroup', {
      name: /^Sex assigned at birth/,
    });
    expect(sex).toHaveAccessibleDescription(
      /“Female” is unavailable because this person and “linda” are both your genetic parents, and “linda” is recorded as “Female” at birth\./,
    );
    // Sam's parents are the same two people, so the conflict is said once.
    expect(sex).not.toHaveAccessibleDescription(/genetic parents of sam/);
    expect(sex).not.toHaveAccessibleDescription(/your genetic parent, is/);
  });

  it('ties each unavailable kind of parent to its own reason', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['female'] }),
        person('claire', { name: 'Claire', sex: ['female'] }),
        person('robin', { name: 'Robin', sex: ['male'] }),
      ],
      edges: [
        link('claire', 'ego', 'biological', { carrier: true }),
        link('robin', 'ego', 'biological'),
      ],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    const kind = screen.getByRole('radiogroup', {
      name: /^What kind of parent are they\?/,
    });
    await waitFor(() =>
      expect(
        within(kind).getByRole('radio', { name: 'Biological parent' }),
      ).toBeDisabled(),
    );
    for (const name of ['Biological parent', 'Egg or sperm donor']) {
      expect(
        within(kind).getByRole('radio', { name }),
      ).toHaveAccessibleDescription(
        /^Biological parent and Egg or sperm donor are unavailable because you already have two genetic parents recorded, “claire” and “robin”\./,
      );
    }
    expect(
      within(kind).getByRole('radio', { name: 'Surrogate' }),
    ).toHaveAccessibleDescription(
      /^“Surrogate” is unavailable because “claire” is recorded as having carried you/,
    );
    expect(
      within(kind).getByRole('radio', { name: 'Adoptive parent' }),
    ).not.toHaveAttribute('aria-describedby');
  });
});

// Rulings 20, 24, 25 and 26 in the sibling and parent forms.
describe('stand-ins and shared parents in the forms', () => {
  const sharedParentsGroup = () =>
    screen.getByRole('group', { name: /^Which parents do they share/ });

  // Ruling 25: a stand-in gives way to a genetic parent recorded in their
  // place, and is never offered as a partner.
  it('offers a biological parent in a stand-in’s place, and never the stand-in as their partner', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('mum', { name: 'Julie', sex: ['female'] }),
        person('standIn', { sex: ['male'] }),
      ],
      edges: [
        link('mum', 'ego', 'biological', { carrier: true }),
        link('standIn', 'ego', 'biological'),
      ],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Male' }));
    // Nothing is asked about a partner before the kind of parent is chosen.
    expect(
      screen.queryByRole('radiogroup', {
        name: /^Are they the partner of another parent\?/,
      }),
    ).toBeNull();
    const biological = screen.getByRole('radio', {
      name: 'Biological parent',
    });
    expect(biological).toBeEnabled();
    await user.click(biological);
    const partner = screen.getByRole('radiogroup', {
      name: /^Are they the partner of another parent\?/,
    });
    expect(
      within(partner).queryByRole('radio', { name: 'standIn' }),
    ).toBeNull();
    // Ruling 25: a partnership between biological parents is never assumed,
    // so the question starts unanswered, and left so records none.
    for (const option of within(partner).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
  });

  it('records no partnership for a new biological parent when the partner question is left unanswered', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('grace', { name: 'Grace', sex: ['female'] }),
        person('standIn', { sex: ['male'] }),
      ],
      edges: [
        link('grace', 'ego', 'biological', { carrier: true }),
        link('standIn', 'ego', 'biological'),
      ],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Male' }));
    await user.click(screen.getByRole('radio', { name: 'Biological parent' }));
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      parentKind: 'biological',
      partnerId: null,
    });
  });

  it('assumes nothing about whether a new adoptive parent is the partner of the one adoptive parent', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('ann', { name: 'Ann', sex: ['female'] }),
      ],
      edges: [link('ann', 'ego', 'adoptive')],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Male' }));
    await user.click(screen.getByRole('radio', { name: 'Adoptive parent' }));
    const partner = screen.getByRole('radiogroup', {
      name: /^Are they the partner of another parent\?/,
    });
    for (const option of within(partner).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
    await user.click(screen.getByRole('radio', { name: 'Biological parent' }));
    for (const option of within(partner).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
  });

  // A stand-in gives way as one person: the genetic parent recorded in
  // their place takes it for everyone they stood in for.
  it('shows a half sibling who shares the stand-in a new parent replaces as their child too, and says why', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('mum', { name: 'Julie', sex: ['female'] }),
        person('standIn', { sex: ['male'] }),
        person('jess', { name: 'Jess', sex: ['female'] }),
        person('jessMum', { name: 'Ann', sex: ['female'] }),
      ],
      edges: [
        link('mum', 'ego', 'biological', { carrier: true }),
        link('standIn', 'ego', 'biological'),
        link('standIn', 'jess', 'biological'),
        link('jessMum', 'jess', 'biological', { carrier: true }),
      ],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Male' }));
    const alsoParentOf = screen.getByRole('group', {
      name: /^Are they also the parent of/,
    });
    const jess = within(alsoParentOf).getByRole('checkbox', { name: 'jess' });
    await waitFor(() => expect(jess).toBeChecked());
    expect(jess).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText(/^jess has the same unnamed parent as you/),
    ).toBeVisible();

    // Another kind of parent takes nobody's place, and lets them go.
    await user.click(screen.getByRole('radio', { name: 'Adoptive parent' }));
    await waitFor(() => expect(jess).not.toBeChecked());
    expect(jess).not.toHaveAttribute('aria-disabled', 'true');

    await user.click(screen.getByRole('radio', { name: 'Biological parent' }));
    await waitFor(() => expect(jess).toBeChecked());
    await user.click(
      within(
        screen.getByRole('radiogroup', {
          name: /^Are they the partner of another parent\?/,
        }),
      ).getByRole('radio', { name: 'No' }),
    );
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      alsoParentOf: ['jess'],
    });
  });

  // Ruling 20.
  it('offers the participant’s donors among the parents a sibling may share', () => {
    renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('amy', { name: 'Amy', sex: ['female'] }),
        person('beth', { name: 'Beth', sex: ['female'] }),
        person('donor', { sex: ['male'] }),
      ],
      edges: [
        link('amy', 'ego', 'biological', { carrier: true }),
        link('beth', 'ego', 'social'),
        link('donor', 'ego', 'donor'),
      ],
      adding: 'sibling',
    });
    expect(
      within(sharedParentsGroup()).getByRole('checkbox', { name: 'donor' }),
    ).not.toBeChecked();
  });

  // Ruling 24.
  it('offers no unnamed parent beside the one adoptive parent of someone adopted', () => {
    renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('amy', { name: 'Amy', sex: ['female'] }),
      ],
      edges: [link('amy', 'ego', 'adoptive')],
      adding: 'sibling',
    });
    expect(within(sharedParentsGroup()).getAllByRole('checkbox')).toHaveLength(
      1,
    );
  });

  // Ruling 26.
  it('asks which of two mothers is a biological sibling’s biological parent', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('ann', { name: 'Ann', sex: ['female'] }),
        person('bea', { name: 'Bea', sex: ['female'] }),
      ],
      edges: [link('ann', 'ego', 'adoptive'), link('bea', 'ego', 'adoptive')],
      adding: 'sibling',
    });
    for (const parent of ['ann', 'bea']) {
      await user.click(
        within(sharedParentsGroup()).getByRole('checkbox', { name: parent }),
      );
    }
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    const question = screen.getByRole('radiogroup', {
      name: /^Which of them is the sibling’s biological parent\?/,
    });
    // Nothing is chosen for them: the required question is answered.
    for (const option of within(question).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
    // Who carried them is answered, so only this question stops the save.
    await answerWhoCarried(user);
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);
    await waitFor(() =>
      expect(question).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(whoCarried()).not.toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(within(question).getByRole('radio', { name: 'bea' }));
    // One answer settles both genetic parents here.
    expect(
      screen.queryByRole('radiogroup', {
        name: /^Which of them is the sibling’s other biological parent\?/,
      }),
    ).toBeNull();
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      biologicalParentIds: ['bea'],
    });
  });

  it('asks for the other biological parent while one answer leaves two who could be', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('sarah', { name: 'Sarah', sex: ['female'] }),
        person('tom', { name: 'Tom', sex: ['male'] }),
        person('raj', { name: 'Raj', sex: ['male'] }),
      ],
      edges: [
        link('sarah', 'ego', 'biological', { carrier: true }),
        link('tom', 'ego', 'biological'),
        link('raj', 'ego', 'social'),
      ],
      adding: 'sibling',
    });
    for (const parent of ['sarah', 'tom', 'raj']) {
      await user.click(
        within(sharedParentsGroup()).getByRole('checkbox', { name: parent }),
      );
    }
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    const first = screen.getByRole('radiogroup', {
      name: /^Which of them is the sibling’s biological parent\?/,
    });
    for (const option of within(first).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
    await user.click(within(first).getByRole('radio', { name: 'sarah' }));
    const second = await screen.findByRole('radiogroup', {
      name: /^Which of them is the sibling’s other biological parent\?/,
    });
    expect(within(second).getAllByRole('radio')).toHaveLength(2);
    expect(within(second).getByRole('radio', { name: 'tom' })).toBeVisible();
    for (const option of within(second).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
    await user.click(within(second).getByRole('radio', { name: 'raj' }));
    await answerWhoCarried(user);
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      biologicalParentIds: ['sarah', 'raj'],
    });
  });
});

// Ruling 16: twins are recorded as identical, fraternal or not known to be
// either, in the sibling form and in the person's panel.
describe('twins', () => {
  const parents = [
    person('mum', { name: 'Julie', sex: ['female'] }),
    person('dad', { name: 'Rob', sex: ['male'] }),
  ];
  const parentLinks = (childId: string) => [
    link('mum', childId, 'biological', { carrier: true }),
    link('dad', childId, 'biological'),
  ];

  it('asks whether a new sibling is a twin, and records the answer', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [person('ego', { isEgo: true, sex: ['male'] }), ...parents],
      edges: parentLinks('ego'),
      adding: 'sibling',
    });
    const question = screen.getByRole('radiogroup', {
      name: /^Are they your twin\?/,
    });
    for (const option of within(question).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
    await user.click(screen.getByRole('checkbox', { name: 'mum' }));
    await user.click(screen.getByRole('checkbox', { name: 'dad' }));
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    await user.click(
      within(question).getByRole('radio', { name: 'Yes, identical twins' }),
    );
    await user.click(screen.getByRole('radio', { name: 'Male' }));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      twin: 'identical',
    });
  });

  // An adopted sibling of someone born to the parents they share is not
  // their twin, and someone else carried them.
  it('does not ask whether a new adopted sibling is the twin of someone born to their parents', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [person('ego', { isEgo: true, sex: ['male'] }), ...parents],
      edges: parentLinks('ego'),
      adding: 'sibling',
    });
    await user.click(screen.getByRole('checkbox', { name: 'mum' }));
    await user.click(screen.getByRole('checkbox', { name: 'dad' }));
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    await user.click(
      within(
        screen.getByRole('radiogroup', { name: /^Are they your twin\?/ }),
      ).getByRole('radio', { name: 'Yes, identical twins' }),
    );
    await user.click(screen.getByRole('radio', { name: 'An adopted child' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('radiogroup', { name: /^Are they your twin\?/ }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('radiogroup', {
        name: /^Who carried the pregnancy\?/,
      }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Male' }));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const { request } = onSubmit.mock.calls[0]![0];
    expect(request).toMatchObject({ parentKind: 'adoptive', carrier: null });
    expect(request).not.toHaveProperty('twin', expect.anything());
  });

  it('asks whether a new adopted sibling is the twin of someone the same parents adopted', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [person('ego', { isEgo: true, sex: ['male'] }), ...parents],
      edges: [link('mum', 'ego', 'adoptive'), link('dad', 'ego', 'adoptive')],
      adding: 'sibling',
    });
    await user.click(screen.getByRole('checkbox', { name: 'mum' }));
    await user.click(screen.getByRole('checkbox', { name: 'dad' }));
    await user.click(screen.getByRole('radio', { name: 'An adopted child' }));
    expect(
      screen.getByRole('radiogroup', { name: /^Are they your twin\?/ }),
    ).toBeInTheDocument();
  });

  it('asks only whether a sibling who would not share both parents is a twin, who is then fraternal', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [person('ego', { isEgo: true, sex: ['male'] }), ...parents],
      edges: parentLinks('ego'),
      adding: 'sibling',
    });
    await user.click(screen.getByRole('checkbox', { name: 'mum' }));
    const question = screen.getByRole('radiogroup', {
      name: /^Are they your twin\?/,
    });
    expect(within(question).getAllByRole('radio')).toHaveLength(2);
    expect(
      within(question).queryByRole('radio', { name: 'Yes, identical twins' }),
    ).toBeNull();
    expect(
      within(question).queryByRole('radio', {
        name: 'Yes, but I don’t know if they are identical',
      }),
    ).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    await user.click(
      within(question).getByRole('radio', {
        name: 'Yes, fraternal (non-identical) twins',
      }),
    );
    await user.click(screen.getByRole('radio', { name: 'Male' }));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      twin: 'fraternal',
    });
  });

  it('does not ask whether a sibling who would not share whoever carried the person is a twin, until they do', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [person('ego', { isEgo: true, sex: ['male'] }), ...parents],
      edges: parentLinks('ego'),
      adding: 'sibling',
    });
    await user.click(screen.getByRole('checkbox', { name: 'dad' }));
    expect(
      screen.queryByRole('radiogroup', { name: /^Are they your twin\?/ }),
    ).toBeNull();

    await user.click(screen.getByRole('checkbox', { name: 'mum' }));
    const question = screen.getByRole('radiogroup', {
      name: /^Are they your twin\?/,
    });
    for (const answer of [
      'No',
      'Yes, identical twins',
      'Yes, fraternal (non-identical) twins',
      'Yes, but I don’t know if they are identical',
    ]) {
      expect(
        within(question).getByRole('radio', { name: answer }),
      ).toBeEnabled();
    }
  });

  it('does not ask whether a sibling who cannot have the surrogate who carried a twin is a twin', () => {
    // Sue carried Sam, the participant's twin, as a surrogate, but is not
    // recorded for the participant, so a new sibling cannot have her as a
    // parent and cannot come from the same pregnancy.
    renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('sam', { sex: ['male'] }),
        person('sue', { sex: ['female'] }),
        ...parents,
      ],
      edges: [
        link('mum', 'ego', 'biological'),
        link('dad', 'ego', 'biological'),
        link('mum', 'sam', 'biological'),
        link('dad', 'sam', 'biological'),
        link('sue', 'sam', 'surrogate', { carrier: true }),
        link('ego', 'sam', 'unknownZygosityTwin'),
      ],
      adding: 'sibling',
    });
    expect(
      screen.queryByRole('radiogroup', { name: /^Are they your twin\?/ }),
    ).toBeNull();
  });

  it('records which siblings are someone’s twins, and of what kind', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('sam', { name: 'Sam', sex: ['male'] }),
        person('kim', { name: 'Kim', sex: ['female'] }),
        ...parents,
      ],
      edges: [
        ...parentLinks('ego'),
        ...parentLinks('sam'),
        ...parentLinks('kim'),
        link('ego', 'kim', 'unknownZygosityTwin'),
      ],
    });
    const twins = screen.getByRole('group', {
      name: /^Which of your siblings, if any, are your twins\?/,
    });
    expect(within(twins).getByRole('checkbox', { name: 'kim' })).toBeChecked();
    await user.click(within(twins).getByRole('checkbox', { name: 'sam' }));
    await user.click(
      within(
        await screen.findByRole('radiogroup', {
          name: /^Are you and “sam” identical twins\?/,
        }),
      ).getByRole('radio', { name: 'Yes, identical' }),
    );
    // Kim's sex at birth differs from the participant's, so they could not
    // be identical: they are fraternal, and are not asked.
    expect(
      screen.queryByRole('radiogroup', {
        name: /^Are you and “kim” identical twins\?/,
      }),
    ).toBeNull();
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // Sam is identical to the participant, so is to Kim what they are.
    expect(onSubmit.mock.calls[0]?.[0].twinChanges).toEqual({
      added: [
        { source: 'ego', target: 'sam', zygosity: 'identical' },
        { source: 'kim', target: 'sam', zygosity: 'fraternal' },
      ],
      changed: [
        { linkId: 'ego-kim-unknownZygosityTwin', zygosity: 'fraternal' },
      ],
      removedLinkIds: [],
    });
  });

  it('offers no step-sibling as a twin', async () => {
    // Ash shares only a step-parent with the participant, so is no sibling
    // the kinship model knows, and could not be their twin.
    renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('ash', { name: 'Ash', sex: ['male'] }),
        ...parents,
      ],
      edges: [
        link('mum', 'ego', 'biological', { carrier: true }),
        link('dad', 'ego', 'social'),
        link('dad', 'ash', 'biological'),
      ],
    });
    expect(
      screen.queryByRole('group', {
        name: /^Which of your siblings, if any, are your twins\?/,
      }),
    ).not.toBeInTheDocument();
  });

  it('offers no sibling someone else carried as a twin, since twins share one pregnancy', async () => {
    // Mum carried the participant, and Sue carried Sam as a surrogate, so
    // Sam could not be their twin; Kim, whom Mum carried too, could.
    renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('sam', { name: 'Sam', sex: ['male'] }),
        person('kim', { name: 'Kim', sex: ['female'] }),
        person('sue', { name: 'Sue', sex: ['female'] }),
        ...parents,
      ],
      edges: [
        ...parentLinks('ego'),
        ...parentLinks('kim'),
        link('mum', 'sam', 'biological'),
        link('dad', 'sam', 'biological'),
        link('sue', 'sam', 'surrogate', { carrier: true }),
      ],
    });
    const twins = screen.getByRole('group', {
      name: /^Which of your siblings, if any, are your twins\?/,
    });
    expect(
      within(twins).getByRole('checkbox', { name: 'kim' }),
    ).toBeInTheDocument();
    expect(
      within(twins).queryByRole('checkbox', { name: 'sam' }),
    ).not.toBeInTheDocument();
  });

  it('offers as a twin a half sibling with nobody recorded as carrying them', () => {
    // Mum carried the participant; Hal shares only Dad, and nobody is
    // recorded as carrying him, so nothing records another pregnancy.
    renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('hal', { name: 'Hal', sex: ['male'] }),
        person('jo', { name: 'Jo', sex: ['female'] }),
        ...parents,
      ],
      edges: [
        ...parentLinks('ego'),
        link('dad', 'hal', 'biological'),
        link('jo', 'hal', 'biological'),
      ],
    });
    const twins = screen.getByRole('group', {
      name: /^Which of your siblings, if any, are your twins\?/,
    });
    expect(
      within(twins).getByRole('checkbox', { name: 'hal' }),
    ).toBeInTheDocument();
  });

  it('offers no sibling someone else carried than whoever carried a twin already chosen, until that twin is not', async () => {
    // Nobody is recorded as carrying the participant, but Sue carried Sam,
    // their twin, as a surrogate, and Mum carried Kim: Kim could not join
    // them while Sam is their twin.
    const { user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('sam', { name: 'Sam', sex: ['male'] }),
        person('kim', { name: 'Kim', sex: ['female'] }),
        person('sue', { name: 'Sue', sex: ['female'] }),
        ...parents,
      ],
      edges: [
        link('mum', 'ego', 'biological'),
        link('dad', 'ego', 'biological'),
        ...parentLinks('kim'),
        link('mum', 'sam', 'biological'),
        link('dad', 'sam', 'biological'),
        link('sue', 'sam', 'surrogate', { carrier: true }),
        link('ego', 'sam', 'unknownZygosityTwin'),
      ],
    });
    const twins = screen.getByRole('group', {
      name: /^Which of your siblings, if any, are your twins\?/,
    });
    const sam = within(twins).getByRole('checkbox', { name: 'sam' });
    expect(sam).toBeChecked();
    expect(
      within(twins).queryByRole('checkbox', { name: 'kim' }),
    ).not.toBeInTheDocument();

    await user.click(sam);
    expect(
      within(twins).getByRole('checkbox', { name: 'kim' }),
    ).toBeInTheDocument();
  });

  it('does not ask whether a twin who would bring an identical twin of another sex at birth is identical, and records them fraternal', async () => {
    // Sam's sex at birth is not recorded, but Tom, his identical twin, is
    // male: answering Sam identical makes the participant, who is female,
    // identical to Tom too.
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['female'] }),
        person('sam', { name: 'Sam' }),
        person('tom', { name: 'Tom', sex: ['male'] }),
        ...parents,
      ],
      edges: [
        ...parentLinks('ego'),
        ...parentLinks('sam'),
        ...parentLinks('tom'),
        link('sam', 'tom', 'identicalTwin'),
      ],
    });
    await user.click(
      within(
        screen.getByRole('group', {
          name: /^Which of your siblings, if any, are your twins\?/,
        }),
      ).getByRole('checkbox', { name: 'sam' }),
    );
    expect(
      screen.queryByRole('radiogroup', {
        name: /^Are you and “sam” identical twins\?/,
      }),
    ).toBeNull();
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].twinChanges?.added).toContainEqual({
      source: 'ego',
      target: 'sam',
      zygosity: 'fraternal',
    });
  });

  it('does not ask whether a half sibling twin is identical', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('sam', { name: 'Sam', sex: ['male'] }),
        person('al', { name: 'Al', sex: ['male'] }),
        ...parents,
      ],
      edges: [
        ...parentLinks('ego'),
        link('mum', 'sam', 'biological', { carrier: true }),
        link('al', 'sam', 'biological'),
      ],
    });
    await user.click(screen.getByRole('checkbox', { name: 'sam' }));
    expect(
      screen.queryByRole('radiogroup', {
        name: /^Are you and “sam” identical twins\?/,
      }),
    ).toBeNull();
  });
});

// Identical twins come from one egg and one sperm, so have the same sex at
// birth: one female and one male cannot be identical twins. Any other pair of
// answers (intersex, not known, not said) rules nothing out.
describe('identical twins and sex at birth', () => {
  const sexReason = /identical twins have the same sex at birth/;

  describe('adding a sibling', () => {
    const renderAddSibling = () =>
      renderPersonForm('ego', {
        nodes: [
          person('ego', { isEgo: true, sex: ['female'] }),
          person('mum', { name: 'Julie', sex: ['female'] }),
          person('dad', { name: 'Rob', sex: ['male'] }),
        ],
        edges: [
          link('mum', 'ego', 'biological', { carrier: true }),
          link('dad', 'ego', 'biological'),
        ],
        adding: 'sibling',
      });
    const twin = () =>
      screen.getByRole('radiogroup', { name: /^Are they your twin\?/ });
    const identical = () =>
      within(twin()).queryByRole('radio', { name: 'Yes, identical twins' });
    const notKnownIfIdentical = () =>
      within(twin()).queryByRole('radio', {
        name: 'Yes, but I don’t know if they are identical',
      });
    const shareBothParents = async (
      user: ReturnType<typeof userEvent.setup>,
    ) => {
      await user.click(screen.getByRole('checkbox', { name: 'mum' }));
      await user.click(screen.getByRole('checkbox', { name: 'dad' }));
    };

    it('asks only whether a sibling answered male beside a female is a twin, and asks again once they are female', async () => {
      const { user } = renderAddSibling();
      await shareBothParents(user);
      await user.click(screen.getByRole('radio', { name: 'Male' }));

      await waitFor(() => expect(identical()).toBeNull());
      expect(notKnownIfIdentical()).toBeNull();
      // They could only be fraternal twins.
      await user.click(
        within(twin()).getByRole('radio', {
          name: 'Yes, fraternal (non-identical) twins',
        }),
      );

      // Once they could be identical, that answer was never one, so the
      // question is asked again with every answer.
      await user.click(screen.getByRole('radio', { name: 'Female' }));
      await waitFor(() => expect(identical()).toBeEnabled());
      expect(notKnownIfIdentical()).toBeEnabled();
      for (const option of within(twin()).getAllByRole('radio')) {
        expect(option).not.toBeChecked();
      }
    });

    it('does not offer identical twins for a sibling whose sex at birth differs from a twin identical to the person', async () => {
      // The participant has no recorded sex at birth, and Ben is their
      // identical twin: a new identical twin would be identical to Ben too.
      const { user } = renderPersonForm('ego', {
        nodes: [
          person('ego', { isEgo: true }),
          person('ben', { name: 'Ben', sex: ['male'] }),
          person('mum', { name: 'Julie', sex: ['female'] }),
          person('dad', { name: 'Rob', sex: ['male'] }),
        ],
        edges: [
          ...['ego', 'ben'].flatMap((childId) => [
            link('mum', childId, 'biological', { carrier: true }),
            link('dad', childId, 'biological'),
          ]),
          link('ego', 'ben', 'identicalTwin'),
        ],
        adding: 'sibling',
      });
      await shareBothParents(user);
      await user.click(screen.getByRole('radio', { name: 'Female' }));

      await waitFor(() => expect(identical()).toBeNull());

      await user.click(screen.getByRole('radio', { name: 'Male' }));
      await waitFor(() => expect(identical()).toBeEnabled());
    });

    it('leaves identical twins available for an intersex sibling', async () => {
      const { user } = renderAddSibling();
      await shareBothParents(user);
      await user.click(screen.getByRole('radio', { name: 'Intersex' }));

      expect(identical()).toBeEnabled();
      expect(twin()).not.toHaveAccessibleDescription(sexReason);
    });
  });

  describe('editing a person', () => {
    // Noah and Cody are the biological children of Shannon and Rick.
    const family = (
      noahSex: string,
      codySex: string,
      zygosity: 'identicalTwin' | 'fraternalTwin' | 'unknownZygosityTwin',
    ) => ({
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('shannon', { name: 'Shannon', sex: ['female'] }),
        person('rick', { name: 'Rick', sex: ['male'] }),
        person('cody', { name: 'Cody', sex: [codySex] }),
        person('noah', { name: 'Noah', sex: [noahSex] }),
      ],
      edges: [
        ...['ego', 'cody', 'noah'].flatMap((childId) => [
          link('shannon', childId, 'biological', { carrier: true }),
          link('rick', childId, 'biological'),
        ]),
        link('noah', 'cody', zygosity),
      ],
    });
    const zygosity = () =>
      screen.getByRole('radiogroup', {
        name: /^Are “noah” and “cody” identical twins\?/,
      });
    const queryZygosity = () =>
      screen.queryByRole('radiogroup', {
        name: /^Are “noah” and “cody” identical twins\?/,
      });
    const sexAtBirth = () =>
      screen.getByRole('radiogroup', { name: /^Sex assigned at birth/ });

    it('does not ask whether a person recorded female and a twin recorded male are identical, and records them fraternal', async () => {
      const { onSubmit, user } = renderPersonForm(
        'noah',
        family('female', 'male', 'unknownZygosityTwin'),
      );
      expect(queryZygosity()).toBeNull();
      await save(user);

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0]?.[0].twinChanges).toMatchObject({
        changed: [
          { linkId: 'noah-cody-unknownZygosityTwin', zygosity: 'fraternal' },
        ],
      });
    });

    it('asks afresh whether twins recorded fraternal because they could not be identical are, once they could be', async () => {
      const { user } = renderPersonForm(
        'noah',
        family('female', 'male', 'fraternalTwin'),
      );
      expect(queryZygosity()).toBeNull();

      await user.click(
        within(sexAtBirth()).getByRole('radio', { name: 'Male' }),
      );

      await waitFor(() => expect(queryZygosity()).not.toBeNull());
      for (const option of within(zygosity()).getAllByRole('radio')) {
        expect(option).not.toBeChecked();
      }
    });

    it('records recorded identical twins as fraternal once the sex at birth is changed so they differ', async () => {
      const { onSubmit, user } = renderPersonForm(
        'noah',
        family('female', 'female', 'identicalTwin'),
      );
      expect(
        within(zygosity()).getByRole('radio', { name: 'Yes, identical' }),
      ).toBeChecked();

      await user.click(
        within(sexAtBirth()).getByRole('radio', { name: 'Male' }),
      );

      await waitFor(() => expect(queryZygosity()).toBeNull());
      await save(user);

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0]?.[0].twinChanges).toMatchObject({
        changed: [{ linkId: 'noah-cody-identicalTwin', zygosity: 'fraternal' }],
      });
    });

    it('does not ask whether a twin whose sex at birth differs from another twin answered identical is identical, until that twin is not', async () => {
      // The participant has no recorded sex at birth, so could be identical
      // to either twin, but not to both: Sam and Kim would then be identical
      // too, and they are recorded with different ones.
      const { user } = renderPersonForm('ego', {
        nodes: [
          person('ego', { isEgo: true }),
          person('sam', { name: 'Sam', sex: ['female'] }),
          person('kim', { name: 'Kim', sex: ['male'] }),
          person('shannon', { name: 'Shannon', sex: ['female'] }),
          person('rick', { name: 'Rick', sex: ['male'] }),
        ],
        edges: ['ego', 'sam', 'kim'].flatMap((childId) => [
          link('shannon', childId, 'biological', { carrier: true }),
          link('rick', childId, 'biological'),
        ]),
      });
      const twins = screen.getByRole('group', {
        name: /^Which of your siblings, if any, are your twins\?/,
      });
      await user.click(within(twins).getByRole('checkbox', { name: 'sam' }));
      await user.click(within(twins).getByRole('checkbox', { name: 'kim' }));
      const zygosityWith = (twin: string) =>
        screen.queryByRole('radiogroup', {
          name: new RegExp(`^Are you and “${twin}” identical twins\\?`),
        });
      const answerWith = (twin: string, answer: string) =>
        user.click(
          within(zygosityWith(twin)!).getByRole('radio', { name: answer }),
        );
      expect(zygosityWith('kim')).not.toBeNull();

      await answerWith('sam', 'Yes, identical');
      await waitFor(() => expect(zygosityWith('kim')).toBeNull());

      await answerWith('sam', 'No, fraternal (non-identical)');
      await waitFor(() => expect(zygosityWith('kim')).not.toBeNull());
    });
  });
});

// Who carried a new child or sibling is required: the answer naming nobody,
// "Someone else, or I don't know", can always be given.
describe('who carried a new child or sibling', () => {
  it('refuses to save a new child until who carried them is answered', async () => {
    const { onSubmit, user } = renderPersonForm('jo', {
      nodes: [
        person('jo', { isEgo: true, sex: ['female'] }),
        person('amy', { sex: ['female'] }),
      ],
      edges: [link('jo', 'amy', 'partner')],
      adding: 'child',
    });
    await user.click(
      within(
        screen.getByRole('radiogroup', { name: /^Who is the child’s other/ }),
      ).getByRole('radio', { name: 'amy' }),
    );
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    await user.click(
      within(
        screen.getByRole('radiogroup', {
          name: /^Who is the child’s biological parent/,
        }),
      ).getByRole('radio', { name: 'jo' }),
    );
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    expect(whoCarried()).toBeRequired();
    await save(user);
    await waitFor(() =>
      expect(whoCarried()).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(onSubmit).not.toHaveBeenCalled();

    await answerWhoCarried(user, 'jo');
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      carrier: 'anchor',
    });
  });

  it('refuses to save a new sibling until who carried them is answered', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('mum', { sex: ['female'] }),
        person('dad', { sex: ['male'] }),
      ],
      edges: [
        link('mum', 'ego', 'biological'),
        link('dad', 'ego', 'biological'),
      ],
      adding: 'sibling',
    });
    await user.click(screen.getByRole('checkbox', { name: 'mum' }));
    await user.click(screen.getByRole('checkbox', { name: 'dad' }));
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    expect(whoCarried()).toBeRequired();
    await save(user);
    await waitFor(() =>
      expect(whoCarried()).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(onSubmit).not.toHaveBeenCalled();

    await answerWhoCarried(user, 'mum');
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      carrier: 'mum',
    });
  });
});

// Twins come from one pregnancy, so share one carrier.
describe('twins share one carrier', () => {
  const parents = [
    person('mum', { name: 'Julie', sex: ['female'] }),
    person('dad', { name: 'Rob', sex: ['male'] }),
  ];
  const expectUnanswered = (group: HTMLElement) => {
    for (const option of within(group).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
  };
  const fraternal = 'Yes, fraternal (non-identical) twins';

  it.each([
    {
      whose: 'the participant',
      nodes: [person('ego', { isEgo: true, sex: ['male'] }), ...parents],
      edges: [
        link('mum', 'ego', 'biological', { carrier: true }),
        link('dad', 'ego', 'biological'),
      ],
    },
    {
      whose:
        'the participant’s twin, nobody being recorded for the participant',
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('sam', { name: 'Sam', sex: ['male'] }),
        ...parents,
      ],
      edges: [
        link('mum', 'ego', 'biological'),
        link('dad', 'ego', 'biological'),
        link('mum', 'sam', 'biological', { carrier: true }),
        link('dad', 'sam', 'biological'),
        link('ego', 'sam', 'fraternalTwin'),
      ],
    },
  ])(
    'does not ask who carried a new twin, whom the carrier recorded for $whose carried',
    async ({ nodes, edges }) => {
      const { onSubmit, user } = renderPersonForm('ego', {
        nodes,
        edges,
        adding: 'sibling',
      });
      await user.click(screen.getByRole('checkbox', { name: 'mum' }));
      await user.click(screen.getByRole('checkbox', { name: 'dad' }));
      await user.click(
        screen.getByRole('radio', { name: 'A biological child' }),
      );
      // Nobody is assumed to have carried a sibling who is not a twin.
      expectUnanswered(whoCarried());
      await user.click(screen.getByRole('radio', { name: fraternal }));
      // Twins share one carrier, recorded already, so it is not asked: the
      // model records it (`planAddition`).
      await waitFor(() => expect(queryWhoCarried()).toBeNull());
      await user.click(screen.getByRole('radio', { name: 'Male' }));
      await save(user);

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
        twin: 'fraternal',
        carrier: null,
      });
    },
  );

  it('asks again who carried a new sibling once they are not a twin', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [person('ego', { isEgo: true, sex: ['male'] }), ...parents],
      edges: [
        link('mum', 'ego', 'biological', { carrier: true }),
        link('dad', 'ego', 'biological'),
      ],
      adding: 'sibling',
    });
    await user.click(screen.getByRole('checkbox', { name: 'mum' }));
    await user.click(screen.getByRole('checkbox', { name: 'dad' }));
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    await user.click(screen.getByRole('radio', { name: fraternal }));
    await waitFor(() => expect(queryWhoCarried()).toBeNull());
    await user.click(
      within(
        screen.getByRole('radiogroup', { name: /^Are they your twin\?/ }),
      ).getByRole('radio', { name: 'No' }),
    );
    await waitFor(() => expectUnanswered(whoCarried()));
    await answerWhoCarried(user, 'mum');
    await user.click(screen.getByRole('radio', { name: 'Male' }));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      carrier: 'mum',
    });
    expect(onSubmit.mock.calls[0]?.[0].request).not.toHaveProperty(
      'twin',
      expect.anything(),
    );
  });

  // Sam and the participant are twins, children of Julie and Rob, raised by
  // Amy too.
  const twinFamily = (carrying: Record<string, boolean>) => {
    const parentLink = (from: string, to: string, kind: string) => {
      const carried = carrying[`${from}-${to}-${kind}`];
      return link(
        from,
        to,
        kind,
        carried === undefined ? {} : { carrier: carried },
      );
    };
    return {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('sam', { name: 'Sam', sex: ['male'] }),
        person('amy', { name: 'Amy', sex: ['female'] }),
        ...parents,
      ],
      edges: [
        parentLink('mum', 'ego', 'biological'),
        parentLink('dad', 'ego', 'biological'),
        parentLink('amy', 'ego', 'social'),
        parentLink('mum', 'sam', 'biological'),
        parentLink('dad', 'sam', 'biological'),
        parentLink('amy', 'sam', 'social'),
        link('ego', 'sam', 'fraternalTwin'),
      ],
    };
  };
  const carried = (parent: string) =>
    screen.getByRole('radiogroup', {
      name: new RegExp(`^Did ${parent} carry the pregnancy\\?`),
    });
  const answer = (group: HTMLElement, name: string) =>
    within(group).getByRole('radio', { name });

  it('starts a twin with nobody recorded as carrying them at the carrier of their twin', async () => {
    const { onSubmit, user } = renderPersonForm(
      'sam',
      twinFamily({ 'amy-ego-social': true }),
    );
    expect(answer(carried('amy'), 'Yes')).toBeChecked();
    expect(answer(carried('mum'), 'No')).toBeChecked();
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].linkUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          linkId: 'amy-sam-social',
          isGestationalCarrier: true,
        }),
      ]),
    );
  });

  it('starts someone newly chosen as a twin at the carrier of the twin they join', async () => {
    const family = twinFamily({ 'amy-ego-social': true });
    const { onSubmit, user } = renderPersonForm('sam', {
      ...family,
      // Sam and the participant are not yet recorded as twins.
      edges: family.edges.slice(0, -1),
    });
    expect(answer(carried('amy'), 'Yes')).not.toBeChecked();
    await user.click(
      within(
        screen.getByRole('group', { name: /^Which siblings of “sam”/ }),
      ).getByRole('checkbox', { name: 'ego' }),
    );
    await waitFor(() => expect(answer(carried('amy'), 'Yes')).toBeChecked());
    await user.click(
      within(
        await screen.findByRole('radiogroup', { name: /identical twins\?/ }),
      ).getByRole('radio', { name: 'No, fraternal (non-identical)' }),
    );
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].linkUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          linkId: 'amy-sam-social',
          isGestationalCarrier: true,
        }),
      ]),
    );
  });

  it('records a twin’s changed carrier for their twin too', async () => {
    const { onSubmit, user } = renderPersonForm(
      'sam',
      twinFamily({ 'mum-ego-biological': true, 'mum-sam-biological': true }),
    );
    await user.click(answer(carried('mum'), 'No'));
    await waitFor(() => expect(answer(carried('amy'), 'Yes')).toBeEnabled());
    await user.click(answer(carried('amy'), 'Yes'));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const updates = onSubmit.mock.calls[0]?.[0].linkUpdates ?? [];
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          linkId: 'mum-sam-biological',
          isGestationalCarrier: false,
        }),
        expect.objectContaining({
          linkId: 'amy-sam-social',
          isGestationalCarrier: true,
        }),
      ]),
    );
    // Sam's twin, the participant, was carried by Amy too.
    expect(updates.filter((update) => update.linkId.includes('-ego-'))).toEqual(
      [
        {
          linkId: 'mum-ego-biological',
          kind: 'biological',
          isGestationalCarrier: false,
          isCurrentPartner: true,
        },
        {
          linkId: 'amy-ego-social',
          kind: 'social',
          isGestationalCarrier: true,
          isCurrentPartner: true,
        },
      ],
    );
  });
});

// Rule: the panel's questions are worked out from the family its unsaved
// answers would save, and candidates are named from the person the form is
// about.
describe('questions worked out from the answers as they stand', () => {
  it('drops a twin who would no longer be a sibling once a parent is re-described', async () => {
    // Noah and Cody share their mother Shannon. Made Noah's surrogate, she
    // is no longer a parent they share.
    const { onSubmit, user } = renderPersonForm('noah', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('shannon', { name: 'Shannon', sex: ['female'] }),
        person('rick', { name: 'Rick', sex: ['male'] }),
        person('cody', { name: 'Cody', sex: ['male'] }),
        person('noah', { name: 'Noah', sex: ['male'] }),
      ],
      edges: [
        link('shannon', 'ego', 'biological', { carrier: true }),
        link('rick', 'ego', 'biological'),
        link('shannon', 'cody', 'biological', { carrier: true }),
        link('rick', 'cody', 'biological'),
        link('shannon', 'noah', 'biological', { carrier: true }),
      ],
    });
    const twins = () =>
      screen.queryByRole('group', {
        name: /^Which siblings of “noah”, if any, are their twins\?/,
      });
    await user.click(
      within(twins() as HTMLElement).getByRole('checkbox', { name: 'cody' }),
    );
    await user.click(
      within(
        screen.getByRole('radiogroup', { name: /^shannon is their…/ }),
      ).getByRole('radio', { name: 'Surrogate' }),
    );
    await waitFor(() => expect(twins()).toBeNull());
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].twinChanges).toBeUndefined();
  });

  it('does not ask about a stand-in whose place a parent re-described as genetic fills', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('donor', { sex: ['female'] }),
        person('standIn', { sex: ['male'] }),
        person('julian', { name: 'Julian', sex: ['male'] }),
      ],
      edges: [
        link('donor', 'ego', 'donor'),
        link('standIn', 'ego', 'biological'),
        link('julian', 'ego', 'social'),
      ],
    });
    const standInRow = () =>
      screen.queryByRole('radiogroup', { name: /^standIn is your…/ });
    expect(standInRow()).not.toBeNull();
    await user.click(
      within(
        screen.getByRole('radiogroup', { name: /^julian is your…/ }),
      ).getByRole('radio', { name: 'Biological parent' }),
    );
    await waitFor(() => expect(standInRow()).toBeNull());
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].linkUpdates).toEqual([
      expect.objectContaining({
        linkId: 'julian-ego-social',
        kind: 'biological',
      }),
    ]);
  });

  it('names an unnamed parent of someone else by how they are related to them', async () => {
    const { user } = renderPersonForm('priya', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('priya', { name: 'Priya', sex: ['female'] }),
        person('lakshmi', { name: 'Lakshmi', sex: ['female'] }),
        person('standIn', { sex: ['male'] }),
      ],
      edges: [
        link('ego', 'priya', 'partner'),
        link('lakshmi', 'priya', 'biological', { carrier: true }),
        link('standIn', 'priya', 'biological'),
      ],
      adding: 'sibling',
    });
    const shared = screen.getByRole('group', {
      name: /^Which parents do they share/,
    });
    const father = within(shared).getByRole('checkbox', {
      name: /^priya’s bio\u00ADlogical father$/,
    });
    // A name is shown as typed.
    const lakshmi = within(shared).getByRole('checkbox', { name: 'lakshmi' });
    expect(father).not.toBeChecked();
    expect(lakshmi).not.toBeChecked();
    await user.click(father);
    await user.click(lakshmi);
    expect(father).toBeChecked();
    expect(lakshmi).toBeChecked();
  });
});

// Decided (9 Oct 2026): every answer the sibling form accepts makes the new
// person a sibling (`siblingTie`). A step-parent or the surrogate who
// carried the participant, chosen alone, does not, so the form refuses it
// and says to add the person as a child of their own parent; beside a parent
// who makes a sibling, either is accepted.
describe('the parents a sibling shares make them a sibling', () => {
  const nodes = [
    person('ego', { isEgo: true, sex: ['male'] }),
    person('amy', { sex: ['female'] }),
    person('rob', { sex: ['male'] }),
    person('sue', { sex: ['female'] }),
    person('gail', { sex: ['female'] }),
  ];
  const edges = [
    link('amy', 'ego', 'biological'),
    link('rob', 'ego', 'biological'),
    link('sue', 'ego', 'social'),
    link('gail', 'ego', 'surrogate', { carrier: true }),
  ];
  const family = readFamily(nodes, edges, config);

  const choose = async (
    user: ReturnType<typeof userEvent.setup>,
    chosen: readonly string[],
  ) => {
    const shared = screen.getByRole('group', {
      name: /^Which parents do they share with you\?/,
    });
    for (const id of ['amy', 'rob', 'sue', 'gail']) {
      const box = within(shared).getByRole('checkbox', { name: id });
      const checked = box.getAttribute('aria-checked') === 'true';
      if (checked !== chosen.includes(id)) await user.click(box);
    }
  };

  const isSibling = (request: PersonFormResult['request']) => {
    if (!request) throw new Error('No addition saved');
    let counter = 0;
    const plan = planAddRelative({
      family,
      anchorId: 'ego',
      newPersonId: 'added',
      details: {},
      request,
      createId: () => `new-${++counter}`,
      sexAttribute: config.sexAssignedAtBirthAttribute,
    });
    return (
      siblingTie(
        familyWithPlan(
          family,
          plan.people,
          plan.links,
          config.sexAssignedAtBirthAttribute,
        ),
        'ego',
        'added',
      ) !== undefined
    );
  };

  it.each([
    { chosen: ['sue'], names: 'sue' },
    { chosen: ['gail'], names: 'gail' },
    { chosen: ['sue', 'gail'], names: 'sue and gail' },
  ])(
    'refuses $chosen alone, saying to add them as a child of their own parent',
    async ({ chosen, names }) => {
      const { onSubmit, user } = renderPersonForm('ego', {
        nodes,
        edges,
        adding: 'sibling',
      });
      await user.click(screen.getByRole('radio', { name: 'Female' }));
      await choose(user, chosen);
      await user.click(screen.getByRole('radio', { name: 'An adopted child' }));
      // Who carried them is answered, so only the parents shared stop the
      // save.
      await answerWhoCarriedIfAsked(user);
      await save(user);

      expect(
        await screen.findByText(
          `Someone who shares only ${names} with you is not your sibling. Choose a parent you both share as well, or add them as a child of their own parent instead.`,
        ),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();

      // Choosing a parent they share as well makes them a sibling.
      await choose(user, [...chosen, 'amy']);
      await answerWhoCarriedIfAsked(user);
      await save(user);
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(isSibling(onSubmit.mock.calls[0]?.[0].request)).toBe(true);
    },
  );

  it('saves every other choice of shared parents, and of their biological parents, as a sibling', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes,
      edges,
      adding: 'sibling',
    });
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    const ids = ['amy', 'rob', 'sue', 'gail'];
    const choices = Array.from({ length: 15 }, (_, mask) =>
      ids.filter((_id, index) => ((mask + 1) >> index) & 1),
    ).filter((chosen) => chosen.includes('amy') || chosen.includes('rob'));
    const namingQuestion = (other: boolean) =>
      screen.queryByRole('radiogroup', {
        name: other
          ? /^Which of them is the sibling’s other biological parent\?/
          : /^Which of them is the sibling’s biological parent\?/,
      });
    let saved = 0;
    const saveAsSibling = async (answers: string) => {
      // Who carried them is required while it is asked.
      await answerWhoCarriedIfAsked(user);
      await save(user);
      saved += 1;
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(saved));
      expect(
        isSibling(onSubmit.mock.calls[saved - 1]?.[0].request),
        answers,
      ).toBe(true);
    };
    for (const chosen of choices) {
      await choose(user, chosen);
      // A kind the parents chosen make impossible is asked again, so it is
      // chosen after them each time.
      const biological = screen.getByRole('radio', {
        name: 'A biological child',
      });
      expect(biological).toBeEnabled();
      await user.click(biological);
      const first = namingQuestion(false);
      if (!first) {
        await saveAsSibling(`shared ${chosen.join(', ')}`);
        continue;
      }
      // Each biological parent the form offers to name makes a sibling.
      const offered = (question: HTMLElement) =>
        ids.filter(
          (id) => within(question).queryByRole('radio', { name: id }) !== null,
        );
      const names = offered(first);
      expect(names.length).toBe(within(first).getAllByRole('radio').length);
      for (const name of names) {
        await user.click(
          within(namingQuestion(false)!).getByRole('radio', { name }),
        );
        const second = namingQuestion(true);
        const others = second ? offered(second) : [undefined];
        for (const other of others) {
          if (other !== undefined) {
            await user.click(
              within(namingQuestion(true)!).getByRole('radio', {
                name: other,
              }),
            );
          }
          await saveAsSibling(
            `shared ${chosen.join(', ')}, named ${[name, other].join(' ')}`,
          );
        }
      }
    }
    expect(saved).toBeGreaterThanOrEqual(choices.length);
  });

  // With no parents or donors recorded, the participant is given unnamed
  // parents for the sibling to share; the surrogate who carried them is
  // offered beside that answer, never in its place.
  it('offers the surrogate of someone with no parents beside the unnamed parents they share', async () => {
    const alone = [
      person('ego', { isEgo: true, sex: ['male'] }),
      person('gail', { sex: ['female'] }),
    ];
    const carried = [link('gail', 'ego', 'surrogate', { carrier: true })];
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: alone,
      edges: carried,
      adding: 'sibling',
    });
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    const surrogate = within(
      screen.getByRole('group', {
        name: /^Did the surrogate who carried you carry them too\?/,
      }),
    ).getByRole('checkbox', { name: 'gail' });
    expect(surrogate).not.toBeChecked();
    await user.click(surrogate);
    const counts = within(
      screen.getByRole('radiogroup', {
        name: /^Which parents do they share with you\?/,
      }),
    ).getAllByRole('radio');
    expect(counts).toHaveLength(3);
    const aloneFamily = readFamily(alone, carried, config);
    for (const [index, count] of counts.entries()) {
      await user.click(count);
      await user.click(
        screen.getByRole('radio', { name: 'A biological child' }),
      );
      await save(user);
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(index + 1));
      const { request } = onSubmit.mock.calls[index]![0];
      if (!request) throw new Error('No addition saved');
      expect(request).toMatchObject({ sharedParentIds: ['gail'] });
      let counter = 0;
      const plan = planAddRelative({
        family: aloneFamily,
        anchorId: 'ego',
        newPersonId: 'added',
        details: {},
        request,
        createId: () => `new-${++counter}`,
        sexAttribute: config.sexAssignedAtBirthAttribute,
      });
      expect(plan.links).toContainEqual({
        source: 'gail',
        target: 'added',
        kind: 'surrogate',
        isGestationalCarrier: true,
      });
      expect(
        siblingTie(
          familyWithPlan(
            aloneFamily,
            plan.people,
            plan.links,
            config.sexAssignedAtBirthAttribute,
          ),
          'ego',
          'added',
        ),
        `shared ${count.getAttribute('value') ?? index}`,
      ).toBeDefined();
    }
  });
});

// An answer about a particular person belongs to that person: choosing
// someone else as the person a question is about asks it afresh, and an
// answer about someone no longer offered is never saved.
describe('an answer about a particular person', () => {
  const otherParent = () =>
    screen.getByRole('radiogroup', { name: /^Who is the child’s other/ });
  const carrier = () =>
    screen.getByRole('radiogroup', { name: /^Who carried the pregnancy\?/ });
  const choose = async (
    user: ReturnType<typeof userEvent.setup>,
    group: HTMLElement,
    name: string | RegExp,
  ) => user.click(within(group).getByRole('radio', { name }));
  const expectUnanswered = (group: HTMLElement) => {
    for (const option of within(group).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
  };
  // Two partners, neither preferred, of unknown sex: either could have
  // carried the pregnancy, and either could be a biological parent.
  const twoPartners = {
    nodes: [
      person('jo', { isEgo: true, sex: ['female'] }),
      person('sam'),
      person('alex'),
    ],
    edges: [
      link('jo', 'sam', 'partner', { current: true }),
      link('jo', 'alex', 'partner', { current: true }),
    ],
    adding: 'child' as const,
  };

  // The kind of child, and who of the two is the biological parent, are
  // answered by the participant before saving.
  const chooseBiologicalChild = async (
    user: ReturnType<typeof userEvent.setup>,
  ) => {
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    const biological = screen.queryByRole('radiogroup', {
      name: /^Who is the child’s biological parent/,
    });
    if (biological) await choose(user, biological, 'jo');
  };

  it('asks afresh whether a step-child’s other parent is their biological parent once another is chosen', async () => {
    const { onSubmit, user } = renderPersonForm('jo', twoPartners);
    await choose(user, otherParent(), 'sam');
    await user.click(
      screen.getByRole('radio', {
        name: 'A step-child or other child you raise',
      }),
    );
    await choose(
      user,
      await screen.findByRole('radiogroup', {
        name: /^Is “sam” the child’s biological parent\?/,
      }),
      'Yes',
    );
    await choose(user, otherParent(), 'alex');
    const asked = await screen.findByRole('radiogroup', {
      name: /^Is “alex” the child’s biological parent\?/,
    });
    expectUnanswered(asked);
    await choose(user, asked, 'No');
    await answerWhoCarried(user);
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      otherParent: 'alex',
      parentKind: 'social',
      biologicalParent: 'both',
    });
  });

  it('asks afresh about a step-child’s other parent chosen after someone not shown yet', async () => {
    const { user } = renderPersonForm('jo', twoPartners);
    await choose(user, otherParent(), 'sam');
    await user.click(
      screen.getByRole('radio', {
        name: 'A step-child or other child you raise',
      }),
    );
    await choose(
      user,
      await screen.findByRole('radiogroup', {
        name: /^Is “sam” the child’s biological parent\?/,
      }),
      'Yes',
    );
    await choose(user, otherParent(), 'Someone not shown yet');
    await choose(user, otherParent(), 'alex');
    expectUnanswered(
      await screen.findByRole('radiogroup', {
        name: /^Is “alex” the child’s biological parent\?/,
      }),
    );
  });

  // Who carried them is required: an answer taken back is asked again, and
  // the form is saved only once it is answered.
  it('asks again who carried them when the other parent said to have carried them is replaced by no other parent', async () => {
    const { onSubmit, user } = renderPersonForm('jo', twoPartners);
    await choose(user, otherParent(), 'sam');
    await chooseBiologicalChild(user);
    await choose(user, carrier(), 'sam');
    await choose(user, otherParent(), 'No other parent');
    expectUnanswered(carrier());
    expect(carrier()).toBeRequired();
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);
    await waitFor(() =>
      expect(carrier()).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(onSubmit).not.toHaveBeenCalled();
    await choose(user, carrier(), NOBODY_KNOWN);
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      otherParent: null,
      carrier: null,
    });
  });

  it('asks again who carried them when the other parent said to have carried them is replaced by another', async () => {
    const { onSubmit, user } = renderPersonForm('jo', twoPartners);
    await choose(user, otherParent(), 'sam');
    await chooseBiologicalChild(user);
    await choose(user, carrier(), 'sam');
    await choose(user, otherParent(), 'alex');
    expectUnanswered(carrier());
    expect(carrier()).toBeRequired();
    // Which of them are biological parents is asked afresh about alex.
    await chooseBiologicalChild(user);
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);
    await waitFor(() =>
      expect(carrier()).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(onSubmit).not.toHaveBeenCalled();
    await choose(user, carrier(), NOBODY_KNOWN);
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      otherParent: 'alex',
      carrier: null,
    });
  });

  it('keeps the answer that the participant carried them when the other parent changes', async () => {
    const { onSubmit, user } = renderPersonForm('jo', twoPartners);
    await choose(user, otherParent(), 'sam');
    await chooseBiologicalChild(user);
    await choose(user, carrier(), 'jo');
    await choose(user, otherParent(), 'alex');
    expect(within(carrier()).getByRole('radio', { name: 'jo' })).toBeChecked();
    // Which of them are biological parents is asked afresh about alex.
    await chooseBiologicalChild(user);
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      otherParent: 'alex',
      carrier: 'anchor',
    });
  });

  it('asks afresh which of the two is a biological parent once another other parent is chosen', async () => {
    const { onSubmit, user } = renderPersonForm('jo', twoPartners);
    const biological = () =>
      screen.getByRole('radiogroup', {
        name: /^Who is the child’s biological parent/,
      });
    await choose(user, otherParent(), 'sam');
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    await choose(user, biological(), 'sam');
    await choose(user, otherParent(), 'alex');
    // Asked as it is when alex is chosen first: nothing chosen, until
    // answered.
    expectUnanswered(biological());
    await choose(user, biological(), /^Both you and “alex”/);
    await answerWhoCarried(user);
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      otherParent: 'alex',
      biologicalParent: 'both',
    });
  });

  it('asks afresh whether a new parent is still with the parent chosen as their partner once another is chosen', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('mum', { sex: ['female'] }),
        person('dad', { sex: ['male'] }),
      ],
      edges: [
        link('mum', 'ego', 'biological', { carrier: true }),
        link('dad', 'ego', 'biological'),
      ],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await user.click(
      screen.getByRole('radio', { name: 'Step or social parent' }),
    );
    const partner = () =>
      screen.getByRole('radiogroup', {
        name: /^Are they the partner of another parent\?/,
      });
    // Asked naming the parent chosen as their partner.
    const together = (partnerId: string) =>
      screen.getByRole('radiogroup', {
        name: new RegExp(`^Are they still together with ${partnerId}\\?`),
      });
    await choose(user, partner(), 'dad');
    await choose(user, together('dad'), 'No');
    await choose(user, partner(), 'mum');
    // Asked as it is when mum is chosen first: nothing chosen, until
    // answered.
    expectUnanswered(together('mum'));
    await choose(user, together('mum'), 'Yes');
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      partnerId: 'mum',
      partnershipCurrent: true,
    });
  });

  it('saves no partnership as current until whether they are still together is answered', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('mum', { sex: ['female'] }),
        person('dad', { sex: ['male'] }),
      ],
      edges: [
        link('mum', 'ego', 'biological', { carrier: true }),
        link('dad', 'ego', 'biological'),
      ],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await user.click(
      screen.getByRole('radio', { name: 'Step or social parent' }),
    );
    await choose(
      user,
      screen.getByRole('radiogroup', {
        name: /^Are they the partner of another parent\?/,
      }),
      'dad',
    );
    await save(user);
    expect(onSubmit).not.toHaveBeenCalled();
    await choose(
      user,
      screen.getByRole('radiogroup', {
        name: /^Are they still together with dad\?/,
      }),
      'No',
    );
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      partnerId: 'dad',
      partnershipCurrent: false,
    });
  });
});

// Whether a partnership is current is asked naming who the person added is
// together with, as the edit form asks it.
describe('whether a new partnership is current', () => {
  const together = (name: string) =>
    screen.findByRole('radiogroup', {
      name: new RegExp(`^${name.replace('?', '\\?')}`),
    });

  it('asks a new partner of the participant whether you are still together', async () => {
    renderPersonForm('ego', {
      nodes: [person('ego', { isEgo: true, sex: ['male'] })],
      adding: 'partner',
    });
    expect(await together('Are you still together?')).toBeRequired();
  });

  it('asks about a new partner of someone else naming them', async () => {
    renderPersonForm('ben', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('ben', { name: 'Ben', sex: ['male'] }),
      ],
      edges: [link('ben', 'ego', 'biological')],
      adding: 'partner',
    });
    expect(await together('Are they still together with ben?')).toBeRequired();
  });

  it.each([
    { partner: 'dad', asked: 'Are they still together with dad?' },
    { partner: 'ego', asked: 'Are you still together?' },
  ])(
    'asks about a new parent with $partner as their partner: “$asked”',
    async ({ partner, asked }) => {
      const { onSubmit, user } = renderPersonForm('kid', {
        nodes: [
          person('ego', { isEgo: true, sex: ['female'] }),
          person('dad', { sex: ['male'] }),
          person('kid', { name: 'Kid', sex: ['male'] }),
        ],
        edges: [
          link('ego', 'kid', 'biological', { carrier: true }),
          link('dad', 'kid', 'biological'),
        ],
        adding: 'parent',
      });
      await user.click(screen.getByRole('radio', { name: 'Female' }));
      await user.click(
        screen.getByRole('radio', { name: 'Step or social parent' }),
      );
      await user.click(
        within(
          screen.getByRole('radiogroup', {
            name: /^Are they the partner of another parent\?/,
          }),
        ).getByRole('radio', { name: partner }),
      );
      const question = await together(asked);
      expect(question).toBeRequired();
      await user.click(within(question).getByRole('radio', { name: 'Yes' }));
      await save(user);
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
        partnerId: partner,
        partnershipCurrent: true,
      });
    },
  );
});

// Rule: an answer the form worked out — a default, or one implied by another
// answer — rather than one the participant gave or the family records,
// follows what it was worked out from, so when that changes the question
// takes the new answer or is left unanswered; and an answer the form shows
// unavailable is never shown chosen, nor saved.
describe('an answer the form worked out, or one no longer available', () => {
  const choose = async (
    user: ReturnType<typeof userEvent.setup>,
    group: HTMLElement,
    name: string | RegExp,
  ) => user.click(within(group).getByRole('radio', { name }));
  const expectUnanswered = (group: HTMLElement) => {
    for (const option of within(group).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
  };
  const carried = (parent: string) =>
    screen.getByRole('radiogroup', {
      name: new RegExp(`^Did ${parent} carry the pregnancy\\?`),
    });
  const kindOf = (parent: string) =>
    screen.getByRole('radiogroup', { name: new RegExp(`^${parent} is your…`) });
  // Mum is recorded as having carried the participant; nothing is recorded
  // about Amy.
  const carrierRecorded = {
    nodes: [
      person('ego', { isEgo: true, sex: ['male'] }),
      person('mum', { sex: ['female'] }),
      person('amy', { sex: ['female'] }),
    ],
    edges: [
      link('mum', 'ego', 'biological', { carrier: true }),
      link('amy', 'ego', 'adoptive'),
    ],
  };

  it('leaves another parent’s carrying unanswered once the parent who carried them is said not to have', async () => {
    const { onSubmit, user } = renderPersonForm('ego', carrierRecorded);
    // "No" is worked out from mum having carried them.
    expect(
      within(carried('amy')).getByRole('radio', { name: 'No' }),
    ).toBeChecked();
    await choose(user, carried('mum'), 'No');
    await waitFor(() => expectUnanswered(carried('amy')));
    expect(
      within(carried('amy')).getByRole('radio', { name: 'Yes' }),
    ).toBeEnabled();
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // Only mum's answer changes: nothing is recorded about amy, as before.
    expect(onSubmit.mock.calls[0]?.[0].linkUpdates).toEqual([
      {
        linkId: 'mum-ego-biological',
        kind: 'biological',
        isGestationalCarrier: false,
        isCurrentPartner: true,
      },
    ]);
  });

  it('keeps the participant’s own “No” for another parent once the parent who carried them is said not to have', async () => {
    const { onSubmit, user } = renderPersonForm('ego', carrierRecorded);
    // Choosing the answer already shown is an answer.
    await choose(user, carried('amy'), 'No');
    await choose(user, carried('mum'), 'No');
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(
      within(carried('amy')).getByRole('radio', { name: 'No' }),
    ).toBeChecked();
    expect(onSubmit.mock.calls[0]?.[0].linkUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          linkId: 'amy-ego-adoptive',
          isGestationalCarrier: false,
        }),
      ]),
    );
  });

  it('shows a recorded kind of parent unchosen while it is unavailable, and keeps it on saving', async () => {
    // Recorded before every change kept genetic parents possible: two
    // mothers, both biological.
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('mum', { sex: ['female'] }),
        person('amy', { sex: ['female'] }),
      ],
      edges: [
        link('mum', 'ego', 'biological', { carrier: true }),
        link('amy', 'ego', 'biological'),
      ],
    });
    const biological = within(kindOf('amy')).getByRole('radio', {
      name: 'Biological parent',
    });
    expect(biological).toBeDisabled();
    await waitFor(() => expect(biological).not.toBeChecked());
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // Neither parent's kind changes. (Amy's "No" to carrying the pregnancy,
    // worked out from mum having carried them, is saved as before.)
    const updates = onSubmit.mock.calls[0]?.[0].linkUpdates ?? [];
    for (const update of updates) expect(update.kind).toBe('biological');
  });

  describe('twins', () => {
    // Noah and Cody are the biological children of Shannon and Rick.
    const nodes = [
      person('ego', { isEgo: true, sex: ['male'] }),
      person('shannon', { name: 'Shannon', sex: ['female'] }),
      person('rick', { name: 'Rick', sex: ['male'] }),
      person('cody', { name: 'Cody', sex: ['male'] }),
      person('noah', { name: 'Noah', sex: ['male'] }),
    ];
    const parentLinks = (childId: string) => [
      link('shannon', childId, 'biological', { carrier: true }),
      link('rick', childId, 'biological'),
    ];
    const zygosity = () =>
      screen.getByRole('radiogroup', {
        name: /^Are “noah” and “cody” identical twins\?/,
      });
    const rick = () =>
      screen.getByRole('radiogroup', { name: /^rick is their…/ });

    const queryZygosity = () =>
      screen.queryByRole('radiogroup', {
        name: /^Are “noah” and “cody” identical twins\?/,
      });

    it('records recorded identical twins as fraternal, without asking, once a parent is re-described so they differ', async () => {
      const { onSubmit, user } = renderPersonForm('noah', {
        nodes,
        edges: [
          ...parentLinks('ego'),
          ...parentLinks('cody'),
          ...parentLinks('noah'),
          link('noah', 'cody', 'identicalTwin'),
        ],
      });
      expect(
        within(zygosity()).getByRole('radio', { name: 'Yes, identical' }),
      ).toBeChecked();
      await choose(user, rick(), 'Step or social parent');
      await waitFor(() => expect(queryZygosity()).toBeNull());
      await save(user);

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0]?.[0].twinChanges).toMatchObject({
        changed: [{ linkId: 'noah-cody-identicalTwin', zygosity: 'fraternal' }],
      });
    });

    it('asks again, unanswered, whether newly chosen twins are identical once a parent re-described so they differ is described as before', async () => {
      const { user } = renderPersonForm('noah', {
        nodes,
        edges: [
          ...parentLinks('ego'),
          ...parentLinks('cody'),
          ...parentLinks('noah'),
        ],
      });
      await user.click(screen.getByRole('checkbox', { name: 'cody' }));
      await choose(
        user,
        await screen.findByRole('radiogroup', {
          name: /^Are “noah” and “cody” identical twins\?/,
        }),
        'Yes, identical',
      );
      await choose(user, rick(), 'Step or social parent');
      await waitFor(() => expect(queryZygosity()).toBeNull());
      await choose(user, rick(), 'Biological parent');
      await waitFor(() => expectUnanswered(zygosity()));
    });
  });

  it('asks the kind of parent again, unanswered, once a sex at birth that ruled the chosen kind out is changed', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['female'] }),
        person('shannon', { sex: ['female'] }),
      ],
      edges: [link('shannon', 'ego', 'biological', { carrier: true })],
      adding: 'parent',
    });
    const kind = () =>
      screen.getByRole('radiogroup', {
        name: /^What kind of parent are they\?/,
      });
    expectUnanswered(kind());
    await user.click(screen.getByRole('radio', { name: 'Male' }));
    await user.click(
      within(kind()).getByRole('radio', { name: 'Biological parent' }),
    );
    expect(
      within(kind()).getByRole('radio', { name: 'Biological parent' }),
    ).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await waitFor(() => expectUnanswered(kind()));
    // Nothing is chosen again for them once the kind is possible.
    await user.click(screen.getByRole('radio', { name: 'Male' }));
    await waitFor(() =>
      expect(
        within(kind()).getByRole('radio', { name: 'Biological parent' }),
      ).toBeEnabled(),
    );
    expectUnanswered(kind());
  });

  it('asks the kind of sibling again, unanswered, once the parents chosen allow it', async () => {
    // Someone with two donors and no other parents.
    const { user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('d1', { sex: ['female'] }),
        person('d2', { sex: ['male'] }),
      ],
      edges: [link('d1', 'ego', 'donor'), link('d2', 'ego', 'donor')],
      adding: 'sibling',
    });
    const kind = () =>
      screen.getByRole('radiogroup', {
        name: /^To the parents they share, are they…/,
      });
    const biological = () =>
      within(kind()).getByRole('radio', { name: 'A biological child' });
    expect(biological()).not.toBeChecked();
    await user.click(biological());
    expect(biological()).toBeChecked();
    // Sharing both donors, they are not the biological child of the parents
    // they share.
    await user.click(screen.getByRole('checkbox', { name: 'd1' }));
    await user.click(screen.getByRole('checkbox', { name: 'd2' }));
    await waitFor(() => expect(biological()).toBeDisabled());
    expect(biological()).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'd2' }));
    await waitFor(() => expect(biological()).toBeEnabled());
    expect(biological()).not.toBeChecked();
  });

  it('asks again who carried a child once the other parent named is chosen again', async () => {
    const { user } = renderPersonForm('jo', {
      nodes: [
        person('jo', { isEgo: true, sex: ['female'] }),
        person('sam'),
        person('alex'),
      ],
      edges: [
        link('jo', 'sam', 'partner', { current: true }),
        link('jo', 'alex', 'partner', { current: true }),
      ],
      adding: 'child',
    });
    const otherParent = () =>
      screen.getByRole('radiogroup', { name: /^Who is the child’s other/ });
    const carrier = () =>
      screen.getByRole('radiogroup', { name: /^Who carried the pregnancy\?/ });
    await choose(user, otherParent(), 'sam');
    await user.click(screen.getByRole('radio', { name: 'A biological child' }));
    await choose(user, carrier(), 'sam');
    await choose(user, otherParent(), 'No other parent');
    await choose(user, otherParent(), 'sam');
    expectUnanswered(carrier());
  });
});
