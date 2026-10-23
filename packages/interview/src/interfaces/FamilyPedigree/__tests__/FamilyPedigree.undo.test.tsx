import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { SuperJSON } from 'superjson';
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

/** The participant and their mother, unnamed, on a pedigree stage with a
 * nomination prompt, followed by an information screen. */
function interview() {
  const si = new SyntheticInterview(5);
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

async function renderStage() {
  render(<StoryInterviewShell rawPayload={interview()} />, {
    wrapper: WithoutMotion,
  });
  await screen.findAllByTestId('pedigree-person');
  // The stand-in for the participant's other genetic parent is drawn once
  // the stage opens; it is not one of the participant's changes.
  await waitFor(() =>
    expect(screen.getAllByTestId('pedigree-person')).toHaveLength(3),
  );
}

const drawn = (id: string) =>
  document.querySelector(`[data-person-id="${id}"]`) !== null;

const personButton = (id: string) => {
  const node = document.querySelector(`[data-person-id="${id}"]`);
  if (!(node instanceof HTMLElement)) throw new Error(`No ${id} drawn`);
  return within(node).getByRole('button');
};

// Disabled toolbar buttons stay in the toolbar's roving focus, so they are
// marked aria-disabled; the details panel hides the rest of the stage from
// queries by role, so they are found by test id.
const undo = () => screen.getByTestId('pedigree-undo');
const redo = () => screen.getByTestId('pedigree-redo');
const isDisabled = (button: HTMLElement) =>
  button.getAttribute('aria-disabled') === 'true' ||
  button.hasAttribute('disabled');

/** Opens the mother's details, names her Julie, and saves. */
async function nameMother(user: ReturnType<typeof userEvent.setup>) {
  await user.click(personButton('mum'));
  const panel = await screen.findByTestId('pedigree-person-panel');
  await user.type(
    within(panel).getByRole('textbox', { name: /^Name/ }),
    'Julie',
  );
  await user.click(within(panel).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(
      screen.queryByTestId('pedigree-person-panel'),
    ).not.toBeInTheDocument(),
  );
}

describe('FamilyPedigree undo and redo', () => {
  it('has nothing to undo or redo when the stage opens', async () => {
    await renderStage();
    expect(isDisabled(undo())).toBe(true);
    expect(isDisabled(redo())).toBe(true);
  });

  it('takes back saved details, and makes them again', async () => {
    await renderStage();
    const user = userEvent.setup();
    await nameMother(user);
    await waitFor(() =>
      expect(personButton('mum')).toHaveAccessibleName(/Julie/),
    );

    await user.click(undo());
    await waitFor(() =>
      expect(personButton('mum')).not.toHaveAccessibleName(/Julie/),
    );
    expect(isDisabled(undo())).toBe(true);
    expect(isDisabled(redo())).toBe(false);

    await user.click(redo());
    await waitFor(() =>
      expect(personButton('mum')).toHaveAccessibleName(/Julie/),
    );
    expect(isDisabled(redo())).toBe(true);
  });

  it('puts someone removed back, with their relationships, as one step', async () => {
    await renderStage();
    const user = userEvent.setup();
    await user.click(personButton('mum'));
    const panel = await screen.findByTestId('pedigree-person-panel');
    await user.click(within(panel).getByRole('button', { name: 'Delete' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: /Remove/ })).getByRole(
        'button',
        {
          name: 'Delete',
        },
      ),
    );
    await waitFor(() => expect(drawn('mum')).toBe(false));

    await user.click(undo());
    await waitFor(() => expect(drawn('mum')).toBe(true));
    expect(screen.getAllByTestId('pedigree-person')).toHaveLength(3);
    expect(isDisabled(undo())).toBe(true);

    await user.click(redo());
    await waitFor(() => expect(drawn('mum')).toBe(false));
  });

  it('undoes with Ctrl+Z and redoes with Ctrl+Shift+Z', async () => {
    await renderStage();
    const user = userEvent.setup();
    await nameMother(user);
    await waitFor(() =>
      expect(personButton('mum')).toHaveAccessibleName(/Julie/),
    );

    personButton('ego').focus();
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() =>
      expect(personButton('mum')).not.toHaveAccessibleName(/Julie/),
    );
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await waitFor(() =>
      expect(personButton('mum')).toHaveAccessibleName(/Julie/),
    );
  });

  it('waits while a person’s details are open', async () => {
    await renderStage();
    const user = userEvent.setup();
    await nameMother(user);
    await user.click(personButton('ego'));
    await screen.findByTestId('pedigree-person-panel');
    expect(isDisabled(undo())).toBe(true);
  });

  it('starts afresh on the next screen of the stage', async () => {
    await renderStage();
    const user = userEvent.setup();
    await nameMother(user);
    expect(isDisabled(undo())).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Next Step' }));
    expect(await screen.findByText('After the pedigree')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous Step' }));
    await screen.findAllByTestId('pedigree-person');
    expect(isDisabled(undo())).toBe(true);
  });
});
