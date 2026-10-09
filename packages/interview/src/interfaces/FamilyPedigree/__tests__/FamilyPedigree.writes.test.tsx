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
function interview() {
  const si = new SyntheticInterview(1);
  const people = si.addNodeType({ name: 'Person' });
  const stage = si.addStage('FamilyPedigree', {
    subject: { entity: 'node', type: people.id },
    prompt: 'Add the members of your family.',
  });
  si.addManualNode(stage.id, stage.personType, 'ego', { [stage.ego]: true });
  si.addManualNode(stage.id, stage.personType, 'mum', {
    [stage.ego]: false,
    [stage.sexAssignedAtBirth]: ['female'],
    ...(stage.genderIdentity ? { [stage.genderIdentity]: ['woman'] } : {}),
  });
  si.addManualEdge(stage.edgeType, 'mum-ego', 'mum', 'ego', {
    [stage.kind]: ['biological'],
    [stage.gestationalCarrier]: true,
  });
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

async function renderStage() {
  render(<StoryInterviewShell rawPayload={interview()} />, {
    wrapper: WithoutMotion,
  });
  await screen.findAllByTestId('pedigree-person');
}

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
    await renderStage();
    const user = userEvent.setup();
    await user.click(mother());
    const panel = await screen.findByTestId('pedigree-person-panel');
    await user.type(
      within(panel).getByRole('textbox', { name: /^Name/ }),
      'Julie',
    );

    // The participant has one genetic parent recorded, so the change is
    // followed by a stand-in for the other.
    const refused = refuseNextAddition();
    await user.click(within(panel).getByRole('button', { name: 'Save' }));

    expect(await within(panel).findByText(REFUSED)).toBeVisible();
    expect(refused).toHaveBeenCalled();
    expect(screen.getByTestId('pedigree-person-panel')).toBe(panel);
    expect(within(panel).getByRole('textbox', { name: /^Name/ })).toHaveValue(
      'Julie',
    );

    // Saved on trying again, the panel closes, and the stand-in is drawn.
    const before = screen.getAllByTestId('pedigree-person').length;
    await user.click(within(panel).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        screen.queryByTestId('pedigree-person-panel'),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('pedigree-person').length).toBe(before + 1),
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
