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
import {
  familyWithPlan,
  type MissingDetail,
  planAddRelative,
  type Relation,
  readFamily,
  siblingTie,
} from '../model';
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

  // Decided gap (9 Oct 2026): not answered records nothing, told apart
  // from "No".
  it('records nothing about carrying for a new parent when the question is left unanswered', async () => {
    const { onSubmit, user } = renderPersonForm('ego', {
      nodes: [person('ego', { isEgo: true, sex: ['male'] })],
      adding: 'parent',
    });
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await user.click(screen.getByRole('radio', { name: 'Adoptive parent' }));
    await save(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const request = onSubmit.mock.calls[0]?.[0].request;
    expect(request).toMatchObject({ parentKind: 'adoptive' });
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
    expect(
      screen.getByRole('radiogroup', { name: /^Who carried the pregnancy\?/ }),
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
    // Only "Yes" would record a second carrier: "No" stays, and is the
    // answer.
    const no = within(question).getByRole('radio', { name: 'No' });
    expect(no).toBeEnabled();
    expect(no).toBeChecked();
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
      /“Male” is unavailable because you are recorded as having carried “ava” and “ben”, and nobody recorded as “Male” at birth can carry a pregnancy\./,
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
    expect(sex).toHaveAccessibleDescription(
      /“Female” is unavailable because this person and “linda” are both genetic parents of “sam”/,
    );
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
        /^“Biological parent” and “Egg or sperm donor” are unavailable because you already have two genetic parents recorded, “claire” and “robin”\./,
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
    { chosen: ['sue'], names: '“sue”' },
    { chosen: ['gail'], names: '“gail”' },
    { chosen: ['sue', 'gail'], names: '“sue” and “gail”' },
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
      await save(user);

      expect(
        await screen.findByText(
          `Someone who shares only ${names} with you is not your sibling. Choose a parent you both share as well, or add them as a child of their own parent instead.`,
        ),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();

      // Choosing a parent they share as well makes them a sibling.
      await choose(user, [...chosen, 'amy']);
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
    name: string,
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

  it('asks afresh whether a step-child’s other parent is their biological parent once another is chosen', async () => {
    const { onSubmit, user } = renderPersonForm('jo', twoPartners);
    await choose(user, otherParent(), 'sam');
    await user.click(
      screen.getByRole('radio', {
        name: 'A step-child or other child they raise',
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
        name: 'A step-child or other child they raise',
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

  it('records no carrier when the other parent said to have carried them is replaced by no other parent', async () => {
    const { onSubmit, user } = renderPersonForm('jo', twoPartners);
    await choose(user, otherParent(), 'sam');
    await choose(user, carrier(), 'sam');
    await choose(user, otherParent(), 'No other parent');
    expectUnanswered(carrier());
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      otherParent: null,
      carrier: null,
    });
  });

  it('records no carrier when the other parent said to have carried them is replaced by another', async () => {
    const { onSubmit, user } = renderPersonForm('jo', twoPartners);
    await choose(user, otherParent(), 'sam');
    await choose(user, carrier(), 'sam');
    await choose(user, otherParent(), 'alex');
    expectUnanswered(carrier());
    await user.click(screen.getByRole('radio', { name: 'Female' }));
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
    await choose(user, carrier(), 'jo');
    await choose(user, otherParent(), 'alex');
    expect(within(carrier()).getByRole('radio', { name: 'jo' })).toBeChecked();
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
    await choose(user, biological(), 'sam');
    await choose(user, otherParent(), 'alex');
    // Asked as it is when alex is chosen first: both, until answered.
    expect(
      within(biological()).getByRole('radio', { name: 'alex' }),
    ).not.toBeChecked();
    expect(
      within(biological()).getByRole('radio', { name: /^Both you and “alex”/ }),
    ).toBeChecked();
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
    const together = () =>
      screen.getByRole('radiogroup', { name: /^Are they still together\?/ });
    await choose(user, partner(), 'dad');
    await choose(user, together(), 'No');
    await choose(user, partner(), 'mum');
    // Asked as it is when mum is chosen first: still together, until
    // answered.
    expect(
      within(together()).getByRole('radio', { name: 'Yes' }),
    ).toBeChecked();
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].request).toMatchObject({
      partnerId: 'mum',
      partnershipCurrent: true,
    });
  });
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

    it('shows recorded identical twins as not known to be identical once a parent is re-described so they differ', async () => {
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
      const identical = within(zygosity()).getByRole('radio', {
        name: 'Yes, identical',
      });
      await waitFor(() => expect(identical).toBeDisabled());
      expect(identical).not.toBeChecked();
      // As the family records them after the change.
      expect(
        within(zygosity()).getByRole('radio', { name: 'I don’t know' }),
      ).toBeChecked();
      await save(user);

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0]?.[0].twinChanges).toMatchObject({
        changed: [{ linkId: 'noah-cody-identicalTwin', zygosity: 'unknown' }],
      });
    });

    it('asks again whether newly chosen twins are identical once a parent is re-described so they differ', async () => {
      const { onSubmit, user } = renderPersonForm('noah', {
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
      await waitFor(() => expectUnanswered(zygosity()));
      await save(user);

      // The question is required, so it is asked rather than saved.
      await waitFor(() =>
        expect(zygosity()).toHaveAttribute('aria-invalid', 'true'),
      );
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('takes the default kind of parent again once a sex at birth that ruled it out is changed', async () => {
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
    expect(
      within(kind()).getByRole('radio', { name: 'Biological parent' }),
    ).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    await waitFor(() => expectUnanswered(kind()));
    await user.click(screen.getByRole('radio', { name: 'Male' }));
    await waitFor(() =>
      expect(
        within(kind()).getByRole('radio', { name: 'Biological parent' }),
      ).toBeChecked(),
    );
  });

  it('takes the default kind of sibling again once the parents chosen allow it', async () => {
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
    expect(biological()).toBeChecked();
    // Sharing both donors, they are not the biological child of the parents
    // they share.
    await user.click(screen.getByRole('checkbox', { name: 'd1' }));
    await user.click(screen.getByRole('checkbox', { name: 'd2' }));
    await waitFor(() => expect(biological()).toBeDisabled());
    expect(biological()).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'd2' }));
    await waitFor(() => expect(biological()).toBeChecked());
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
    await choose(user, carrier(), 'sam');
    await choose(user, otherParent(), 'No other parent');
    await choose(user, otherParent(), 'sam');
    expectUnanswered(carrier());
  });
});
