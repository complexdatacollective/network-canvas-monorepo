import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import SuperJSON from 'superjson';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import { SyntheticInterview } from '@codaco/protocol-utilities';
import type { FramingSetting } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import StoryInterviewShell from '../../../storybook-support/StoryInterviewShell';
import {
  deriveInterviewKey,
  encryptValue,
} from '../../Anonymisation/encryptionFormat';
import { withoutSoftHyphens } from '../generatedLabels';
import { nameFingerprint } from '../model';

vi.mock('../../../hooks/useMediaQuery', () => ({ default: () => false }));

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

// The off-screen measurement of a symbol has to come to a size for the
// family to be laid out, which jsdom never gives it.
const MEASURED_SIZE = 96;
class MeasuringResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: { width: MEASURED_SIZE, height: MEASURED_SIZE },
        } as unknown as ResizeObserverEntry,
      ],
      this,
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', MeasuringResizeObserver);
  vi.stubGlobal('IntersectionObserver', ObserverStub);
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
  // jsdom lacks pointer capture, which the canvas's drag-to-pan takes.
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
});

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ width: MEASURED_SIZE, height: MEASURED_SIZE }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// The node type's own label, which the codebook's label rules show for a
// node with no name: never what the pedigree calls anyone.
const TYPE_LABEL = 'Family member';
const PASSPHRASE = 'correct horse battery staple';

type InterviewOptions = {
  /** The protocol's only language. */
  locale?: 'de';
  framing?: FramingSetting;
  /** The framing the participant chose on an earlier visit. */
  chosenFraming?: 'gendered' | 'gamete';
  /** The mother's sex at birth: unknown when null. */
  mumSex?: 'female' | null;
  /** The label a visit saved as the mother's name, still hers. */
  mumSavedLabel?: string;
  /** The mother's answer to another of the researcher's questions. */
  mumOccupation?: string;
  /** The mother's name, encrypted with the key of `PASSPHRASE`. */
  mumEncryptedName?: string;
  /** Her encrypted name is the label a visit saved, still hers. */
  encryptedNameIsSavedLabel?: boolean;
  /** Two unnamed sisters of the participant, children of both parents. */
  sisters?: boolean;
  /** The age question must be answered. */
  required?: boolean;
};

// The question is worded the same in either language: what a German
// protocol changes here is the word the stage supplies for a relative.
const QUESTION = 'How old is {who}?';
const QUESTION_START = /^How old is/;

/**
 * The participant, their unnamed mother and their father Tom, on a pedigree
 * stage whose question shows the node label ("Node label" in Architect),
 * followed by an information screen. The stage does not ask about gender
 * identity, so each relative's words follow their sex at birth.
 */
async function interview({
  locale,
  framing,
  chosenFraming,
  mumSex = 'female',
  mumSavedLabel,
  mumOccupation,
  mumEncryptedName,
  encryptedNameIsSavedLabel = false,
  sisters = false,
  required = false,
}: InterviewOptions = {}) {
  const language = locale ?? 'en-US';
  const si = new SyntheticInterview(1);
  if (locale) si.setLocalization({ defaultLocale: locale, locales: [locale] });
  const relatives = si.addNodeType({ name: TYPE_LABEL });
  const stage = si.addStage('FamilyPedigree', {
    subject: { entity: 'node', type: relatives.id },
    prompt: 'Add the members of your family.',
    askGenderIdentity: false,
    ...(framing ? { framing } : {}),
  });
  stage.stageEntry.dynamicValues = { who: { path: 'node.$label' } };
  stage.addFormField({
    component: 'Number',
    prompt: { [language]: QUESTION },
    ...(required ? { validation: { required: true } } : {}),
  });
  const occupation =
    mumOccupation === undefined
      ? undefined
      : relatives.addVariable({
          name: 'occupation',
          type: 'text',
          component: 'Text',
        }).id;
  if (occupation) {
    stage.addFormField({
      component: 'Text',
      variable: occupation,
      prompt: { [language]: 'Occupation' },
    });
  }
  const sex = (value: 'female' | 'male' | null) =>
    value === null ? {} : { [stage.sexAssignedAtBirth]: [value] };
  si.addManualNode(stage.id, stage.personType, 'ego', {
    [stage.ego]: true,
    ...sex('female'),
  });
  si.addManualNode(stage.id, stage.personType, 'mum', {
    [stage.ego]: false,
    ...sex(mumSex),
    ...(mumSavedLabel === undefined ? {} : { [stage.name]: mumSavedLabel }),
    ...(occupation === undefined ? {} : { [occupation]: mumOccupation }),
  });
  si.addManualNode(stage.id, stage.personType, 'dad', {
    [stage.ego]: false,
    ...sex('male'),
    [stage.name]: 'Tom',
  });
  const children = ['ego', ...(sisters ? ['sis1', 'sis2'] : [])];
  for (const child of children) {
    if (child !== 'ego') {
      si.addManualNode(stage.id, stage.personType, child, {
        [stage.ego]: false,
        ...sex('female'),
      });
    }
    si.addManualEdge(stage.edgeType, `mum-${child}`, 'mum', child, {
      [stage.kind]: ['biological'],
      [stage.gestationalCarrier]: mumSex === 'female',
    });
    si.addManualEdge(stage.edgeType, `dad-${child}`, 'dad', child, {
      [stage.kind]: ['biological'],
    });
  }
  si.addInformationStage({ title: 'After the pedigree', text: 'Done.' });

  const metadata = {
    ...(chosenFraming ? { framing: chosenFraming } : {}),
    ...(mumSavedLabel === undefined
      ? {}
      : { generatedLabels: { mum: nameFingerprint(mumSavedLabel) } }),
  };
  const payload = si.getInterviewPayload({
    currentStep: 0,
    ...(Object.keys(metadata).length > 0
      ? { stageMetadata: { 0: metadata } as never }
      : {}),
  });

  if (mumEncryptedName !== undefined) {
    // Saved encrypted on an earlier visit protected with the passphrase.
    const relativeType = payload.protocol.codebook.node?.[relatives.id] as {
      variables: Record<string, { encrypted?: boolean }>;
    };
    const name = relativeType.variables[stage.name];
    if (name) name.encrypted = true;
    const key = await deriveInterviewKey(PASSPHRASE, payload.id);
    const encrypted = await encryptValue(key, mumEncryptedName, {
      nodeId: 'mum',
      variableId: stage.name,
    });
    const mum = payload.network.nodes.find(
      (node) => node[entityPrimaryKeyProperty] === 'mum',
    );
    if (!mum) throw new Error('No mother in the network');
    mum[entityAttributesProperty][stage.name] = encrypted.data;
    if (encryptedNameIsSavedLabel) {
      payload.stageMetadata = {
        0: {
          ...metadata,
          generatedLabels: { mum: nameFingerprint(encrypted.data) },
        },
      };
    }
    mum[entitySecureAttributesMeta] = { [stage.name]: { iv: encrypted.iv } };
  }

  render(<StoryInterviewShell rawPayload={SuperJSON.stringify(payload)} />, {
    wrapper: WithoutMotion,
  });
  await screen.findAllByTestId('pedigree-person');
}

function WithoutMotion({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimations reducedMotion="always">
      {children}
    </AnimationProvider>
  );
}

const symbolOf = (id: string) => {
  const node = document.querySelector(`[data-person-id="${id}"]`);
  if (!(node instanceof HTMLElement)) throw new Error(`No ${id} drawn`);
  // The canvas is hidden from assistive technology while the panel is open.
  return within(node).getAllByRole('button', { hidden: true })[0]!;
};

/** The label drawn in a symbol, as it reads without the soft hyphens a
 * long word may break at. */
const canvasLabel = (id: string) =>
  withoutSoftHyphens(symbolOf(id).textContent ?? '').trim();

/** The ids of the symbols drawn for the relatives being added. */
const addedIds = () =>
  screen
    .getAllByTestId('pedigree-person')
    .map((node) => node.getAttribute('data-person-id'))
    .filter(
      (id): id is string =>
        id !== null && !['ego', 'mum', 'dad', 'sis1', 'sis2'].includes(id),
    );

/** The id of the symbol drawn for the relative being added. */
const addedId = () => {
  const [added] = addedIds();
  if (!added) throw new Error('No relative being added is drawn');
  return added;
};

const panel = () => screen.getByTestId('pedigree-person-panel');

/** The node label the panel's question shows, as it is drawn on screen. */
const questionValue = () => {
  const question = within(panel()).getByText(QUESTION_START);
  const caption = question.closest('label') ?? question;
  const values = caption.querySelectorAll('[data-dynamic-value] bdi');
  expect(values).toHaveLength(1);
  return values[0]?.textContent;
};

async function openPanelOf(id: string) {
  const user = userEvent.setup();
  await user.click(symbolOf(id));
  await screen.findByTestId('pedigree-person-panel');
  return user;
}

const nameBox = () => within(panel()).getByRole('textbox', { name: /^Name/ });

async function saveAndClose(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(panel()).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(
      screen.queryByTestId('pedigree-person-panel'),
    ).not.toBeInTheDocument(),
  );
}

describe('the node label in a Family Pedigree panel’s questions', () => {
  it('calls an unnamed relative by the label the canvas draws for them', async () => {
    await interview();
    expect(canvasLabel('mum')).toBe('Mother');
    await openPanelOf('mum');

    await waitFor(() => expect(questionValue()).toBe('Mother'));
    expect(symbolOf('mum')).toHaveAccessibleName('Mother');
  });

  it('calls the participant as the canvas does', async () => {
    await interview();
    await openPanelOf('ego');

    await waitFor(() => expect(questionValue()).toBe(canvasLabel('ego')));
    expect(canvasLabel('ego')).toBe('You');
  });

  it('calls a named relative by their name', async () => {
    await interview();
    await openPanelOf('dad');

    await waitFor(() => expect(questionValue()).toBe('Tom'));
    expect(canvasLabel('dad')).toBe('Tom');
  });

  it('calls a relative being added as the canvas draws them, as the answers change', async () => {
    await interview();
    const user = userEvent.setup();
    await user.hover(symbolOf('ego'));
    await user.click(await screen.findByTestId('pedigree-menu-sibling'));
    await screen.findByTestId('pedigree-person-panel');

    await waitFor(() => expect(questionValue()).toBe(canvasLabel(addedId())));
    expect(questionValue()).toBe('Sibling');
    expect(symbolOf(addedId())).toHaveAccessibleName('Sibling');

    await user.type(nameBox(), 'Ann');
    await waitFor(() => expect(questionValue()).toBe('Ann'));
    expect(canvasLabel(addedId())).toBe('Ann');
  });

  it('calls a relative being added by the label drawn on them when another relative’s matches it', async () => {
    await interview({ mumSex: null });
    const user = userEvent.setup();
    await user.hover(symbolOf('ego'));
    await user.click(await screen.findByTestId('pedigree-menu-parent'));
    await screen.findByTestId('pedigree-person-panel');
    // The participant has both their genetic parents, so a third parent's
    // kind starts unanswered, and they are drawn by the plain word. Once
    // she is recorded as female at birth, that word matches the other
    // unnamed parent's, and only her accessible name tells the two apart.
    await user.click(within(panel()).getByRole('radio', { name: 'Female' }));
    await waitFor(() => expect(canvasLabel('mum')).toBe('Parent'));
    expect(canvasLabel(addedId())).toBe('Parent');
    expect(symbolOf(addedId())).not.toHaveAccessibleName('Parent');

    await waitFor(() => expect(questionValue()).toBe('Parent'));
  });

  it('calls a relative holding a label saved on an earlier visit by their label as it stands', async () => {
    await interview({ mumSavedLabel: 'Mother (on an earlier visit)' });
    expect(canvasLabel('mum')).toBe('Mother');
    await openPanelOf('mum');

    await waitFor(() => expect(questionValue()).toBe('Mother'));
  });

  it('calls a relative by a name typed in the same words as their saved label, as saving it will', async () => {
    await interview({ mumSavedLabel: 'Mother (on an earlier visit)' });
    const user = await openPanelOf('mum');
    await waitFor(() => expect(questionValue()).toBe('Mother'));

    await user.type(nameBox(), 'Mother (on an earlier visit)');
    await waitFor(() =>
      expect(questionValue()).toBe('Mother (on an earlier visit)'),
    );

    await saveAndClose(user);
    expect(canvasLabel('mum')).toBe('Mother (on an earlier visit)');
  });

  it('never calls an unnamed relative by an answer to another question', async () => {
    await interview({ mumOccupation: 'Teacher' });
    await openPanelOf('mum');

    await waitFor(() => expect(questionValue()).toBe('Mother'));
  });

  it('calls a relative whose name is cleared by the label saving that gives them', async () => {
    await interview();
    const user = await openPanelOf('dad');
    await waitFor(() => expect(questionValue()).toBe('Tom'));

    await user.clear(nameBox());
    await waitFor(() => expect(questionValue()).toBe('Father'));

    await saveAndClose(user);
    expect(canvasLabel('dad')).toBe('Father');
  });

  it('follows a new sex at birth for an unnamed parent, as saving it will', async () => {
    await interview({ mumSex: null });
    expect(canvasLabel('mum')).toBe('Parent');
    const user = await openPanelOf('mum');
    await waitFor(() => expect(questionValue()).toBe('Parent'));

    await user.click(within(panel()).getByRole('radio', { name: 'Female' }));
    await waitFor(() => expect(questionValue()).toBe('Mother'));

    await saveAndClose(user);
    expect(canvasLabel('mum')).toBe('Mother');
  });

  it('calls relatives sharing a word by the labels that tell them apart', async () => {
    await interview({ sisters: true });
    expect(canvasLabel('sis1')).not.toBe(canvasLabel('sis2'));
    await openPanelOf('sis2');

    await waitFor(() => expect(questionValue()).toBe(canvasLabel('sis2')));
    expect(questionValue()).toMatch(/^Sister\b./);
  });

  it('calls a relative in the protocol’s language', async () => {
    await interview({ locale: 'de' });
    const label = canvasLabel('mum');
    expect(label).not.toBe('Mother');
    await openPanelOf('mum');

    await waitFor(() => expect(questionValue()).toBe(label));
    expect(label).not.toBe(TYPE_LABEL);
  });

  it('calls a relative in the words the participant chose', async () => {
    await interview({
      framing: 'participantPreference',
      chosenFraming: 'gamete',
    });
    const label = canvasLabel('mum');
    expect(label).toBe('Egg parent');
    await openPanelOf('mum');

    await waitFor(() => expect(questionValue()).toBe(label));
  });

  it('names a required question in the missing-details notice as it reads', async () => {
    await interview({ required: true });
    await openPanelOf('mum');

    const notice = await within(panel()).findByText(
      /^Some details are missing/,
    );
    await waitFor(() =>
      expect(notice).toHaveTextContent(/How old is Mother\?/),
    );
  });

  it('calls a relative by their encrypted name once it is decrypted', async () => {
    await interview({ mumEncryptedName: 'Julie' });
    const user = userEvent.setup();
    await user.click(
      within(screen.getByTestId('pedigree-passphrase-notice')).getByRole(
        'button',
        { name: 'Passphrase' },
      ),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Passphrase' });
    await user.type(
      within(dialog).getByLabelText(/^Passphrase/, { selector: 'input' }),
      PASSPHRASE,
    );
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    // Deriving the key takes a moment.
    await waitFor(() => expect(canvasLabel('mum')).toBe('Julie'), {
      timeout: 30_000,
    });
    await openPanelOf('mum');

    await waitFor(() => expect(questionValue()).toBe('Julie'));
    expect(nameBox()).toHaveValue('Julie');
  }, 60_000);

  it('calls a relative holding an encrypted label saved on an earlier visit by their label as it stands', async () => {
    await interview({
      mumEncryptedName: 'Mother (on an earlier visit)',
      encryptedNameIsSavedLabel: true,
    });
    expect(canvasLabel('mum')).toBe('Mother');
    const user = userEvent.setup();
    await user.click(
      within(screen.getByTestId('pedigree-passphrase-notice')).getByRole(
        'button',
        { name: 'Passphrase' },
      ),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Passphrase' });
    await user.type(
      within(dialog).getByLabelText(/^Passphrase/, { selector: 'input' }),
      PASSPHRASE,
    );
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await waitFor(
      () =>
        expect(
          screen.queryByTestId('pedigree-passphrase-notice'),
        ).not.toBeInTheDocument(),
      { timeout: 30_000 },
    );
    await openPanelOf('mum');

    // The Name question is blank, as she has no name of her own.
    expect(nameBox()).toHaveValue('');
    await waitFor(() => expect(questionValue()).toBe('Mother'));
    expect(canvasLabel('mum')).toBe('Mother');
  }, 60_000);
});
