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
  /** How the mother is the participant's parent. */
  mumKind?: 'biological' | 'adoptive';
};

function interview({
  twin = false,
  mumKind = 'biological',
}: InterviewOptions = {}) {
  const si = new SyntheticInterview(1);
  const people = si.addNodeType({ name: 'Person' });
  const stage = si.addStage('FamilyPedigree', {
    subject: { entity: 'node', type: people.id },
    prompt: 'Add the members of your family.',
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
    await user.click(personButton('sam'));

    // Shown under the toolbar, and read out.
    expect(
      (await screen.findAllByText(/are not connected\./)).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

  it('adds nobody to a family that keeps the rule', async () => {
    const additions = watchAdditions();
    await renderStage({ mumKind: 'adoptive' });
    await openAndCloseMother(userEvent.setup());
    expect(additions).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('pedigree-person')).toHaveLength(2);
  });
});
