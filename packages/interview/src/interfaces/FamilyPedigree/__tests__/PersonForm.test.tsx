import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createMessageError } from '@codaco/app-i18n/messages';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import {
  asEntityAttributeReference,
  type FormField,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import * as attributePatch from '../../../forms/formValuesToAttributePatch';
import { runtimeMessages } from '../../../i18n/runtimeMessages';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import PersonForm, { type PersonFormResult } from '../components/PersonForm';
import { type MissingDetail, type Relation, readFamily } from '../model';
import type { OwnedOptionLabels } from '../options';
import { config, link, person } from './fixtures';

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
  /** The details the panel opened saying are missing (edit only). */
  missing?: MissingDetail[];
  nameValidation?: Record<string, unknown>;
  formFields?: FormField[];
  /** Each encrypted name decrypted, by person id. */
  decryptedNames?: ReadonlyMap<string, string>;
  optionLabels?: OwnedOptionLabels;
  /** What storing the submission comes to. */
  submitted?: Promise<FormSubmissionResult>;
};

/** The pedigree's side panel, editing `editing` (or adding a relative of
 * them), in an interview whose network holds `nodes` and `edges`. */
function renderPersonForm(
  editing: string,
  {
    nodes,
    edges = [],
    adding,
    missing = [],
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
    <TestProtocolLocalization>
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
          <FormStoreProvider>{children}</FormStoreProvider>
        </CurrentStepProvider>
      </Provider>
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
            : { kind: 'edit', person: edited, missing, unavailable: [] }
        }
        family={family}
        config={{ ...config, genderIdentity: undefined }}
        framing="gendered"
        genderIdentityOptions={[]}
        optionLabels={optionLabels}
        formFields={formFields}
        generatedLabels={{}}
        decryptedNames={decryptedNames}
        displayName={(id) => id}
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
        formErrors: [createMessageError(runtimeMessages.submissionFailed)],
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

    expect(
      await screen.findByText(
        'This value is used elsewhere. It must be unique.',
      ),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('adding a sibling', () => {
  const sharedParents = () =>
    screen.getByRole('group', { name: /^Which parents do they share/ });

  // The stand-in rule (`planStandIns`) gives anyone with one genetic parent
  // a stand-in for the other, so the form offers the stand-in among the
  // parents recorded, and never a parent "not shown yet".
  it('offers the stand-in for a parent not yet recorded among the parents, all chosen', async () => {
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
      ).toBeChecked();
    }
    expect(screen.queryByText(/not shown yet/)).toBeNull();
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
    ).toBeChecked();
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
    expect(carrier()).not.toBeNull();
    await user.click(
      within(
        screen.getByRole('group', { name: /^Which parents do they share/ }),
      ).getByRole('checkbox', { name: 'hannah' }),
    );
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

  it('offers a biological sibling of two mothers, one a step-parent', () => {
    renderPersonForm('ego', {
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
    expect(
      within(shared).getByRole('checkbox', { name: 'beth' }),
    ).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'A biological child' }),
    ).toBeEnabled();
  });
});

describe('adding a child', () => {
  const otherParent = () =>
    screen.getByRole('radiogroup', { name: /^Who is the child’s other/ });

  it('chooses the current partner as the other parent, not a former one', async () => {
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
    expect(
      within(otherParent()).getByRole('radio', { name: 'tyler' }),
    ).toBeChecked();
    expect(
      within(otherParent()).getByRole('radio', { name: 'father' }),
    ).not.toBeChecked();
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
    expect(
      within(otherParent()).getByRole('radio', { name: 'ben' }),
    ).toBeChecked();
    await user.click(
      screen.getByRole('radio', {
        name: 'A step-child or other child they raise',
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

describe('the missing details notice', () => {
  it('drops a detail once it is answered, and lists it again once cleared', async () => {
    const { user } = renderPersonForm('bea', {
      nodes: [person('bea'), person('ego', { isEgo: true })],
      missing: ['sexAssignedAtBirth', { variable: NICKNAME }],
      formFields: [nicknameField],
    });
    const notice = () => screen.queryByText(/^Some details are missing/);
    expect(notice()).toHaveTextContent(
      'Some details are missing: Sex assigned at birth and Nickname.',
    );
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await waitFor(() =>
      expect(notice()).toHaveTextContent('Some details are missing: Nickname.'),
    );
    await user.type(screen.getByRole('textbox', { name: /Nickname/ }), 'Bee');
    await waitFor(() => expect(notice()).toBeNull());
    await user.clear(screen.getByRole('textbox', { name: /Nickname/ }));
    await waitFor(() =>
      expect(notice()).toHaveTextContent('Some details are missing: Nickname.'),
    );
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

  it('asks whether a new adoptive parent carried the pregnancy', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [person('ego', { isEgo: true, sex: ['male'] })],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await user.click(screen.getByRole('radio', { name: 'Adoptive parent' }));
    await user.click(yesTo(/^Did this parent carry the pregnancy\?/));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      parentKind: 'adoptive',
      carriedPregnancy: true,
    });
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

  it('offers a new adoptive sibling’s adoptive parent as having carried them', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('amy', { sex: ['female'] }),
        person('rob', { sex: ['male'] }),
      ],
      edges: [link('amy', 'ego', 'adoptive'), link('rob', 'ego', 'adoptive')],
      adding: 'sibling',
    });
    await user.click(screen.getByRole('radio', { name: 'An adopted child' }));
    await waitFor(() =>
      expect(
        within(
          screen.getByRole('radiogroup', {
            name: /^Who carried the pregnancy\?/,
          }),
        ).getByRole('radio', { name: 'amy' }),
      ).toBeInTheDocument(),
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
    await user.click(screen.getByRole('radio', { name: 'Adoptive parent' }));
    const question = await screen.findByRole('radiogroup', {
      name: /^Did this parent carry the pregnancy\?/,
    });
    expect(within(question).getByRole('radio', { name: 'Yes' })).toBeDisabled();
    expect(question).toHaveAccessibleDescription(
      /“mum” is recorded as having carried you/,
    );
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
    expect(
      screen.getByRole('radio', { name: 'Biological parent' }),
    ).toBeEnabled();
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
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      parentKind: 'biological',
      partnerId: null,
    });
  });

  it('still assumes a new adoptive parent is the partner of the one adoptive parent, until answered', async () => {
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
    await waitFor(() =>
      expect(within(partner).getByRole('radio', { name: 'ann' })).toBeChecked(),
    );
    await user.click(screen.getByRole('radio', { name: 'Biological parent' }));
    await waitFor(() =>
      expect(
        within(partner).getByRole('radio', { name: 'ann' }),
      ).not.toBeChecked(),
    );
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
      screen.getByText(/“jess” has the same unnamed parent as you/),
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
    const question = screen.getByRole('radiogroup', {
      name: /^Which of them is the sibling’s biological parent\?/,
    });
    // Nothing is chosen for them: the required question is answered.
    for (const option of within(question).getAllByRole('radio')) {
      expect(option).not.toBeChecked();
    }
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);
    await waitFor(() =>
      expect(question).toHaveAttribute('aria-invalid', 'true'),
    );
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
    expect(within(question).getByRole('radio', { name: 'No' })).toBeChecked();
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

  it('shows identical twins unavailable for a sibling who would not share both parents, saying why', async () => {
    const { user } = renderPersonForm('ego', {
      nodes: [person('ego', { isEgo: true, sex: ['male'] }), ...parents],
      edges: parentLinks('ego'),
      adding: 'sibling',
    });
    await user.click(screen.getByRole('checkbox', { name: 'dad' }));
    const question = screen.getByRole('radiogroup', {
      name: /^Are they your twin\?/,
    });
    expect(
      within(question).getByRole('radio', { name: 'Yes, identical twins' }),
    ).toBeDisabled();
    expect(question).toHaveAccessibleDescription(
      /identical twins have the same biological parents and donors/,
    );
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
    await user.click(
      within(
        screen.getByRole('radiogroup', {
          name: /^Are you and “kim” identical twins\?/,
        }),
      ).getByRole('radio', { name: 'No, fraternal (non-identical)' }),
    );
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

  it('shows identical twins unavailable for a half sibling, saying why', async () => {
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
    const question = await screen.findByRole('radiogroup', {
      name: /^Are you and “sam” identical twins\?/,
    });
    expect(
      within(question).getByRole('radio', { name: 'Yes, identical' }),
    ).toBeDisabled();
    expect(question).toHaveAccessibleDescription(/you and “sam” do not/);
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
        name: /^Which of “noah”’s siblings, if any, are their twins\?/,
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

  it('names an unnamed parent of someone else by how they are related to them', () => {
    renderPersonForm('priya', {
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
    expect(
      within(shared).getByRole('checkbox', {
        name: /^priya’s bio\u00ADlogical father$/,
      }),
    ).toBeChecked();
    // A name is shown as typed.
    expect(
      within(shared).getByRole('checkbox', { name: 'lakshmi' }),
    ).toBeChecked();
  });
});
