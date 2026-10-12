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

import * as session from '../../../store/modules/session';
import StoryInterviewShell from '../../../storybook-support/StoryInterviewShell';
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

// The off-screen measurement of a person's symbol has to come to a size for
// the family to be laid out, which jsdom never gives it.
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

const REFUSED = 'An error occurred while submitting the form.';

/** The participant and their mother, unnamed, on a pedigree stage followed
 * by an information screen. */
type InterviewOptions = {
  /** Sam, the mother's son, recorded as the participant's twin. */
  twin?: boolean;
  /** Sam recorded as the participant's twin and nothing else: no parent
   * between them, as a family drawn by another stage may record them. */
  twinOnly?: boolean;
  /** How the mother is the participant's parent. */
  mumKind?: 'biological' | 'adoptive';
  /** Whether the stage asks about gender identity. */
  askGenderIdentity?: boolean;
};

function interview({
  twin = false,
  twinOnly = false,
  mumKind = 'biological',
  askGenderIdentity = true,
}: InterviewOptions = {}) {
  const si = new SyntheticInterview(1);
  const people = si.addNodeType({ name: 'Person' });
  const stage = si.addStage('FamilyPedigree', {
    subject: { entity: 'node', type: people.id },
    prompt: 'Add the members of your family.',
    askGenderIdentity,
  });
  si.addManualNode(stage.id, stage.personType, 'ego', {
    [stage.ego]: true,
    [stage.sexAssignedAtBirth]: ['female'],
    ...(stage.genderIdentity ? { [stage.genderIdentity]: ['woman'] } : {}),
  });
  si.addManualNode(stage.id, stage.personType, 'mum', {
    [stage.ego]: false,
    [stage.sexAssignedAtBirth]: ['female'],
    ...(stage.genderIdentity ? { [stage.genderIdentity]: ['woman'] } : {}),
  });
  si.addManualEdge(stage.edgeType, 'mum-ego', 'mum', 'ego', {
    [stage.kind]: [mumKind],
    [stage.gestationalCarrier]: true,
  });
  if (twin) {
    // Sam, the participant's mother's son, recorded as their twin.
    si.addManualNode(stage.id, stage.personType, 'sam', {
      [stage.ego]: false,
      [stage.sexAssignedAtBirth]: ['male'],
    });
    si.addManualEdge(stage.edgeType, 'mum-sam', 'mum', 'sam', {
      [stage.kind]: ['biological'],
      [stage.gestationalCarrier]: true,
    });
    si.addManualEdge(stage.edgeType, 'ego-sam', 'ego', 'sam', {
      [stage.kind]: ['fraternalTwin'],
    });
  }
  if (twinOnly) {
    si.addManualNode(stage.id, stage.personType, 'sam', {
      [stage.ego]: false,
      [stage.sexAssignedAtBirth]: ['male'],
    });
    si.addManualEdge(stage.edgeType, 'ego-sam', 'ego', 'sam', {
      [stage.kind]: ['fraternalTwin'],
    });
  }
  si.addInformationStage({ title: 'After the pedigree', text: 'Done.' });
  return SuperJSON.stringify(si.getInterviewPayload({ currentStep: 0 }));
}

function WithoutMotion({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimations reducedMotion="always">
      {children}
    </AnimationProvider>
  );
}

/** Refuses the next write to a person, as the session refuses one it cannot
 * store, and lets every other through. */
function refuseNextPersonWrite() {
  const real = session.updateNode;
  const spy = vi
    .spyOn(session, 'updateNode')
    .mockImplementationOnce((args) =>
      real({ ...args, nodeId: 'nobody-by-that-id' }),
    );
  Object.assign(spy, {
    fulfilled: real.fulfilled,
    rejected: real.rejected,
    pending: real.pending,
    settled: real.settled,
    typePrefix: real.typePrefix,
  });
  return spy;
}

/** Refuses the next change that adds people, as the session refuses one it
 * cannot store, and lets every other through. */
function refuseNextAddition() {
  const real = session.addNodesAndEdges;
  const spy = vi
    .spyOn(session, 'addNodesAndEdges')
    .mockImplementationOnce((args) =>
      real({
        ...args,
        nodes: args.nodes.map((node) => ({ ...node, type: 'no-such-type' })),
      }),
    );
  Object.assign(spy, {
    fulfilled: real.fulfilled,
    rejected: real.rejected,
    pending: real.pending,
    settled: real.settled,
    typePrefix: real.typePrefix,
  });
  return spy;
}

async function renderStage(options?: InterviewOptions) {
  render(<StoryInterviewShell rawPayload={interview(options)} />, {
    wrapper: WithoutMotion,
  });
  await screen.findAllByTestId('pedigree-person');
}

const personButton = (id: string) => {
  const node = document.querySelector(`[data-person-id="${id}"]`);
  if (!(node instanceof HTMLElement)) throw new Error(`No ${id} drawn`);
  return within(node).getByRole('button');
};

const mother = () => {
  const node = document.querySelector('[data-person-id="mum"]');
  if (!(node instanceof HTMLElement)) throw new Error('No mother drawn');
  return within(node).getByRole('button');
};

describe('FamilyPedigree when a write is refused', () => {
  it('keeps the details panel open with the answers and says why', async () => {
    await renderStage();
    const user = userEvent.setup();
    await user.click(mother());
    const panel = await screen.findByTestId('pedigree-person-panel');
    await user.type(
      within(panel).getByRole('textbox', { name: /^Name/ }),
      'Julie',
    );

    const refused = refuseNextPersonWrite();
    await user.click(within(panel).getByRole('button', { name: 'Save' }));

    expect(await within(panel).findByText(REFUSED)).toBeVisible();
    expect(refused).toHaveBeenCalled();
    expect(screen.getByTestId('pedigree-person-panel')).toBe(panel);
    expect(within(panel).getByRole('textbox', { name: /^Name/ })).toHaveValue(
      'Julie',
    );

    // Saved on trying again, the panel closes.
    await user.click(within(panel).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        screen.queryByTestId('pedigree-person-panel'),
      ).not.toBeInTheDocument(),
    );
  });

  it('keeps the details panel open and says why when the stand-in a change needs is refused', async () => {
    // The participant's adoptive mother, re-described as their biological
    // mother, leaves them one genetic parent, so the change is followed by
    // a stand-in for the other.
    await renderStage({ mumKind: 'adoptive' });
    const user = userEvent.setup();
    expect(screen.getAllByTestId('pedigree-person')).toHaveLength(2);
    await user.click(personButton('ego'));
    const panel = await screen.findByTestId('pedigree-person-panel');
    await user.click(
      within(
        within(panel).getByRole('radiogroup', { name: /is your…/ }),
      ).getByRole('radio', { name: 'Biological parent' }),
    );

    const refused = refuseNextAddition();
    await user.click(within(panel).getByRole('button', { name: 'Save' }));

    expect(await within(panel).findByText(REFUSED)).toBeVisible();
    expect(refused).toHaveBeenCalled();
    expect(screen.getByTestId('pedigree-person-panel')).toBe(panel);

    // Saved on trying again, the panel closes, and the stand-in is drawn.
    await user.click(within(panel).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        screen.queryByTestId('pedigree-person-panel'),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('pedigree-person')).toHaveLength(3),
    );
  });

  it('stays on the stage and says why when a label for someone unnamed is refused', async () => {
    await renderStage();
    const user = userEvent.setup();

    const refused = refuseNextPersonWrite();
    await user.click(screen.getByRole('button', { name: 'Next Step' }));

    expect(await screen.findByText(REFUSED)).toBeInTheDocument();
    expect(refused).toHaveBeenCalled();
    expect(screen.getAllByTestId('pedigree-person').length).toBeGreaterThan(0);
    expect(screen.queryByText('After the pedigree')).not.toBeInTheDocument();

    // Saved on trying again, the interview moves on.
    await user.click(screen.getByRole('button', { name: 'Next Step' }));
    expect(await screen.findByText('After the pedigree')).toBeInTheDocument();
  });
});

describe('FamilyPedigree twins and the disconnect tool', () => {
  it('refuses to disconnect twins, who have no line it removes, and asks nothing', async () => {
    await renderStage({ twin: true });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await user.click(personButton('ego'));

    // With the participant chosen, their twin cannot be chosen: there is no
    // line between them to remove.
    await waitFor(() => expect(personButton('sam')).toBeDisabled());
    await user.click(personButton('sam'));
    expect(document.querySelector('[data-person-id="sam"]')).not.toBeNull();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('FamilyPedigree and the connect tool', () => {
  // A pair has one link at most, so the connect menu is never asked to say
  // why two people already connected cannot be connected again.
  it('never offers someone already connected to the first person chosen', async () => {
    await renderStage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(personButton('ego'));

    await waitFor(() => expect(mother()).toBeDisabled());
    await user.click(mother());
    expect(
      screen.queryByTestId('pedigree-connect-menu'),
    ).not.toBeInTheDocument();
  });
});

// Rule (Codex 4229159680): every path that removes a relationship applies the
// same cut-off handling as the disconnect tool, which refuses.
describe('FamilyPedigree removing a twin link', () => {
  it('refuses to untick a twin connected to the participant only as their twin, and says why', async () => {
    await renderStage({ twinOnly: true });
    const user = userEvent.setup();
    await user.click(personButton('ego'));
    const panel = await screen.findByTestId('pedigree-person-panel');
    const twins = within(panel).getByRole('group', {
      name: /Which of your siblings, if any, are your twins/,
    });
    await user.click(within(twins).getByRole('checkbox', { name: 'Sibling' }));
    await user.click(within(panel).getByRole('button', { name: 'Save' }));

    expect(
      await within(panel).findByText(/outside your family tree/),
    ).toBeVisible();
    expect(screen.getByTestId('pedigree-person-panel')).toBe(panel);
    // Still twins, so Sam is still drawn.
    expect(document.querySelector('[data-person-id="sam"]')).not.toBeNull();
    expect(
      within(twins).getByRole('checkbox', { name: 'Sibling' }),
    ).not.toBeChecked();
  });
});

describe('FamilyPedigree opening on a family missing a stand-in', () => {
  /** Every change that adds people, let through. */
  const watchAdditions = () => vi.spyOn(session, 'addNodesAndEdges');

  /** Opens the mother's details and closes them again, which renders the
   * stage over and runs its effects again. */
  const openAndCloseMother = async (
    user: ReturnType<typeof userEvent.setup>,
  ) => {
    await user.click(mother());
    const panel = await screen.findByTestId('pedigree-person-panel');
    await user.click(within(panel).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(
        screen.queryByTestId('pedigree-person-panel'),
      ).not.toBeInTheDocument(),
    );
  };

  it('gives someone with one genetic parent a stand-in for the other, once, without any change', async () => {
    // The participant's biological mother alone, as a family saved before
    // stand-ins, or drawn by another stage, records them.
    const additions = watchAdditions();
    await renderStage();
    await waitFor(() =>
      expect(screen.getAllByTestId('pedigree-person')).toHaveLength(3),
    );
    expect(additions).toHaveBeenCalledTimes(1);

    await openAndCloseMother(userEvent.setup());
    expect(additions).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('pedigree-person')).toHaveLength(3);
  });

  /** The participant, their biological mother Julie, and a stand-in the
   * stage gave for their other genetic parent, as a family saved earlier
   * records them; `standInSex` is the stand-in's sex at birth, and `rob`
   * adds Rob as their biological father, as another stage may have. */
  function savedStandIn({
    standInSex,
    rob = false,
  }: {
    standInSex: 'male' | 'female';
    rob?: boolean;
  }) {
    const si = new SyntheticInterview(3);
    const people = si.addNodeType({ name: 'Person' });
    const stage = si.addStage('FamilyPedigree', {
      subject: { entity: 'node', type: people.id },
      prompt: 'Add the members of your family.',
    });
    si.addManualNode(stage.id, stage.personType, 'ego', {
      [stage.ego]: true,
      [stage.sexAssignedAtBirth]: ['female'],
    });
    si.addManualNode(stage.id, stage.personType, 'mum', {
      [stage.ego]: false,
      [stage.sexAssignedAtBirth]: ['female'],
      [stage.name]: 'Julie',
    });
    si.addManualNode(stage.id, stage.personType, 'standIn', {
      [stage.ego]: false,
      [stage.sexAssignedAtBirth]: [standInSex],
    });
    si.addManualEdge(stage.edgeType, 'mum-ego', 'mum', 'ego', {
      [stage.kind]: ['biological'],
      [stage.gestationalCarrier]: true,
    });
    si.addManualEdge(stage.edgeType, 'standIn-ego', 'standIn', 'ego', {
      [stage.kind]: ['biological'],
    });
    if (rob) {
      si.addManualNode(stage.id, stage.personType, 'rob', {
        [stage.ego]: false,
        [stage.sexAssignedAtBirth]: ['male'],
        [stage.name]: 'Rob',
      });
      si.addManualEdge(stage.edgeType, 'rob-ego', 'rob', 'ego', {
        [stage.kind]: ['biological'],
      });
    }
    si.addInformationStage({ title: 'After the pedigree', text: 'Done.' });
    return SuperJSON.stringify(
      si.getInterviewPayload({
        currentStep: 0,
        stageMetadata: { 0: { standIns: ['standIn'] } },
      }),
    );
  }

  it('lets a stand-in give way to a genetic parent recorded in their place, without any change', async () => {
    render(
      <StoryInterviewShell
        rawPayload={savedStandIn({ standInSex: 'male', rob: true })}
      />,
      { wrapper: WithoutMotion },
    );
    await screen.findAllByTestId('pedigree-person');
    await waitFor(() =>
      expect(
        document.querySelector('[data-person-id="standIn"]'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getAllByTestId('pedigree-person')).toHaveLength(3);
  });

  it('gives a stand-in the sex at birth that follows the other genetic parent’s, without any change', async () => {
    const updates = vi.spyOn(session, 'updateNode');
    render(
      <StoryInterviewShell
        rawPayload={savedStandIn({ standInSex: 'female' })}
      />,
      { wrapper: WithoutMotion },
    );
    await screen.findAllByTestId('pedigree-person');
    await waitFor(() =>
      expect(updates).toHaveBeenCalledWith(
        expect.objectContaining({ nodeId: 'standIn' }),
      ),
    );
    expect(screen.getAllByTestId('pedigree-person')).toHaveLength(3);
  });

  // Decided gap (9 Oct 2026): nobody was asked whether a stand-in carried
  // the pregnancy, so nothing is recorded, told apart from "No".
  it('records nothing about whether a stand-in who could have carried the pregnancy did', async () => {
    const si = new SyntheticInterview(4);
    const people = si.addNodeType({ name: 'Person' });
    const stage = si.addStage('FamilyPedigree', {
      subject: { entity: 'node', type: people.id },
      prompt: 'Add the members of your family.',
    });
    si.addManualNode(stage.id, stage.personType, 'ego', {
      [stage.ego]: true,
      [stage.sexAssignedAtBirth]: ['female'],
    });
    si.addManualNode(stage.id, stage.personType, 'dad', {
      [stage.ego]: false,
      [stage.sexAssignedAtBirth]: ['male'],
      [stage.name]: 'Rob',
    });
    si.addManualEdge(stage.edgeType, 'dad-ego', 'dad', 'ego', {
      [stage.kind]: ['biological'],
      [stage.gestationalCarrier]: false,
    });
    si.addInformationStage({ title: 'After the pedigree', text: 'Done.' });
    const additions = vi.spyOn(session, 'addNodesAndEdges');
    render(
      <StoryInterviewShell
        rawPayload={SuperJSON.stringify(
          si.getInterviewPayload({ currentStep: 0 }),
        )}
      />,
      { wrapper: WithoutMotion },
    );
    await screen.findAllByTestId('pedigree-person');
    await waitFor(() => expect(additions).toHaveBeenCalledTimes(1));
    const [edge] = additions.mock.calls[0]![0].edges;
    expect(edge?.attributeData).toEqual({ [stage.kind]: ['biological'] });
  });

  it('adds nobody to a family that keeps the rule', async () => {
    const additions = watchAdditions();
    await renderStage({ mumKind: 'adoptive' });
    await openAndCloseMother(userEvent.setup());
    expect(additions).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('pedigree-person')).toHaveLength(2);
  });
});

// Rule: who is a stand-in, and who holds a generated label, belongs to the
// family, not to the stage that found it out (Codex 4229159663).
describe('FamilyPedigree stages that draw the same family', () => {
  /** Two Family Pedigree stages over the same people and relationships. The
   * first gave the participant's father as a stand-in beside their mother,
   * and saved "Father" as his name on leaving, unnamed; the interview is on
   * the second. */
  function twoStages() {
    const si = new SyntheticInterview(2);
    const people = si.addNodeType({ name: 'Person' });
    const first = si.addStage('FamilyPedigree', {
      subject: { entity: 'node', type: people.id },
      prompt: 'Add the members of your family.',
    });
    si.addStage('FamilyPedigree', {
      subject: { entity: 'node', type: people.id },
      prompt: 'Look over your family again.',
    });
    si.addManualNode(first.id, first.personType, 'ego', {
      [first.ego]: true,
      [first.sexAssignedAtBirth]: ['female'],
    });
    si.addManualNode(first.id, first.personType, 'mum', {
      [first.ego]: false,
      [first.sexAssignedAtBirth]: ['female'],
      [first.name]: 'Julie',
    });
    si.addManualNode(first.id, first.personType, 'dad', {
      [first.ego]: false,
      [first.sexAssignedAtBirth]: ['male'],
      [first.name]: 'Father',
    });
    for (const parent of ['mum', 'dad']) {
      si.addManualEdge(first.edgeType, `${parent}-ego`, parent, 'ego', {
        [first.kind]: ['biological'],
        [first.gestationalCarrier]: parent === 'mum',
      });
    }
    si.addInformationStage({ title: 'After the pedigree', text: 'Done.' });
    const payload = si.getInterviewPayload({
      currentStep: 1,
      stageMetadata: {
        0: {
          standIns: ['dad'],
          generatedLabels: { dad: nameFingerprint('Father') },
        },
      },
    });
    // The second stage records the family in the first one's slots.
    const [firstStage, secondStage] = payload.protocol.stages as {
      nodeConfiguration?: unknown;
      edgeConfiguration?: unknown;
    }[];
    if (!firstStage || !secondStage) throw new Error('No stages');
    secondStage.nodeConfiguration = firstStage.nodeConfiguration;
    secondStage.edgeConfiguration = firstStage.edgeConfiguration;
    return SuperJSON.stringify(payload);
  }

  it('treats a stand-in another stage gave, and the label it saved, as theirs', async () => {
    const additions = vi.spyOn(session, 'addNodesAndEdges');
    render(<StoryInterviewShell rawPayload={twoStages()} />, {
      wrapper: WithoutMotion,
    });
    await screen.findByText('Look over your family again.');
    await screen.findAllByTestId('pedigree-person');
    const user = userEvent.setup();

    await user.click(personButton('dad'));
    const panel = await screen.findByTestId('pedigree-person-panel');
    // Unnamed: the label saved as his name is not a name.
    expect(within(panel).getByRole('textbox', { name: /Name/ })).toHaveValue(
      '',
    );
    // A stand-in is never removed, since the rule would put one back.
    expect(
      within(panel).queryByRole('button', { name: 'Remove from family' }),
    ).toBeNull();
    // Nobody is added in his place: he holds it.
    expect(additions).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('pedigree-person')).toHaveLength(3);
  });
});

// Rule: a stand-in is an unnamed parent the interface made, standing in for
// one not yet recorded; anything the participant tells about them, a sex at
// birth included, makes them someone in their own right.
describe('FamilyPedigree stand-ins the participant describes or disconnects', () => {
  /** The stand-in given beside the participant's mother on opening. */
  const standIn = async () => {
    await waitFor(() =>
      expect(screen.getAllByTestId('pedigree-person')).toHaveLength(3),
    );
    const node = [...document.querySelectorAll('[data-person-id]')].find(
      (each) => !['ego', 'mum'].includes(each.getAttribute('data-person-id')!),
    );
    if (!(node instanceof HTMLElement)) throw new Error('No stand-in drawn');
    const [button] = within(node).getAllByRole('button');
    if (!button) throw new Error('No stand-in button');
    return button;
  };

  it('keeps the sex at birth the participant chose for a stand-in', async () => {
    // Without the gender identity question, nothing else is recorded about
    // them.
    await renderStage({ askGenderIdentity: false });
    const user = userEvent.setup();
    await user.click(await standIn());
    let panel = await screen.findByTestId('pedigree-person-panel');
    const sex = () =>
      within(screen.getByTestId('pedigree-person-panel')).getByRole(
        'radiogroup',
        { name: /^Sex assigned at birth/ },
      );
    await user.click(within(sex()).getByRole('radio', { name: /Intersex/ }));
    await user.click(within(panel).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        screen.queryByTestId('pedigree-person-panel'),
      ).not.toBeInTheDocument(),
    );

    await user.click(await standIn());
    panel = await screen.findByTestId('pedigree-person-panel');
    expect(
      within(sex()).getByRole('radio', { name: /Intersex/ }),
    ).toBeChecked();
  });

  it('says a stand-in is replaced by adding the parent they stand in for, when disconnecting them would leave them out', async () => {
    await renderStage();
    const user = userEvent.setup();
    const placeholder = await standIn();
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await user.click(placeholder);
    await user.click(personButton('ego'));

    expect(
      (await screen.findAllByText(/stands in for a parent of yours/)).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/Connect them to someone else/)).toBeNull();
  });
});

describe('FamilyPedigree a parent re-described as genetic', () => {
  // Alex raised the participant before their mother Julie was recorded;
  // Jess shares only the stand-in for the participant's other genetic
  // parent, beside an unknown other parent of her own. Nobody's sex at
  // birth is recorded, so only the change itself tells who takes the
  // stand-in's place.
  function halfSisterThroughStandIn() {
    const si = new SyntheticInterview(5);
    const people = si.addNodeType({ name: 'Person' });
    const stage = si.addStage('FamilyPedigree', {
      subject: { entity: 'node', type: people.id },
      prompt: 'Add the members of your family.',
      askGenderIdentity: false,
    });
    const node = (id: string, name?: string, isEgo = false) =>
      si.addManualNode(stage.id, stage.personType, id, {
        [stage.ego]: isEgo,
        // The participant answers “Don’t know”, which rules out nothing.
        ...(isEgo ? { [stage.sexAssignedAtBirth]: ['unknown'] } : {}),
        ...(name ? { [stage.name]: name } : {}),
      });
    node('ego', undefined, true);
    node('alex', 'Alex');
    node('mum', 'Julie');
    node('jess', 'Jess');
    node('standIn');
    node('jessStandIn');
    const parent = (from: string, to: string, kind: string) =>
      si.addManualEdge(stage.edgeType, `${from}-${to}`, from, to, {
        [stage.kind]: [kind],
      });
    parent('alex', 'ego', 'social');
    parent('mum', 'ego', 'biological');
    parent('standIn', 'ego', 'biological');
    parent('standIn', 'jess', 'biological');
    parent('jessStandIn', 'jess', 'biological');
    si.addInformationStage({ title: 'After the pedigree', text: 'Done.' });
    return SuperJSON.stringify(
      si.getInterviewPayload({
        currentStep: 0,
        stageMetadata: { 0: { standIns: ['standIn', 'jessStandIn'] } },
      }),
    );
  }

  it('takes the stand-in’s place for everyone they stood in for', async () => {
    render(<StoryInterviewShell rawPayload={halfSisterThroughStandIn()} />, {
      wrapper: WithoutMotion,
    });
    await screen.findAllByTestId('pedigree-person');
    expect(screen.getAllByTestId('pedigree-person')).toHaveLength(6);
    const user = userEvent.setup();
    await user.click(personButton('ego'));
    const panel = await screen.findByTestId('pedigree-person-panel');
    await user.click(
      within(
        within(panel).getByRole('radiogroup', { name: /^“?Alex”? is your…/ }),
      ).getByRole('radio', { name: 'Biological parent' }),
    );
    await user.click(within(panel).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        screen.queryByTestId('pedigree-person-panel'),
      ).not.toBeInTheDocument(),
    );
    // The stand-in gives way for Jess too: Alex is her parent in their
    // place, so they stand in for nobody, and are gone.
    await waitFor(() =>
      expect(
        document.querySelector('[data-person-id="standIn"]'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getAllByTestId('pedigree-person')).toHaveLength(5);
  });
});
