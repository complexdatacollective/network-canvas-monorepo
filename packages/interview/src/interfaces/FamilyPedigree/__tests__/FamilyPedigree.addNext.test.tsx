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

/** The participant and their mother, on a stage that wants to know about
 * everyone's first-degree relatives. */
function interview() {
  const si = new SyntheticInterview(1);
  const people = si.addNodeType({ name: 'Person' });
  const stage = si.addStage('FamilyPedigree', {
    subject: { entity: 'node', type: people.id },
    prompt: 'Add the members of your family.',
    completeness: { scope: 'firstDegree', enforcement: 'required' },
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

// Opens the participant's details from the checklist's siblings item, and
// answers whether they have siblings, and children, and saves.
async function answerSiblings(siblings: 'Yes' | 'No') {
  render(<StoryInterviewShell rawPayload={interview()} />, {
    wrapper: WithoutMotion,
  });
  await screen.findAllByTestId('pedigree-person');
  const user = userEvent.setup();

  await user.click(screen.getByTestId('pedigree-completeness'));
  await user.click(
    await screen.findByRole('button', {
      name: 'Add your biological brothers and sisters, or say you have none',
    }),
  );
  const panel = await screen.findByTestId('pedigree-person-panel');
  await user.click(
    within(
      within(panel).getByRole('radiogroup', {
        name: /^Do you have any biological brothers or sisters/,
      }),
    ).getByRole('radio', { name: siblings }),
  );
  await user.click(
    within(
      within(panel).getByRole('radiogroup', {
        name: /^Do you have any biological children/,
      }),
    ).getByRole('radio', { name: 'No' }),
  );
  await user.click(within(panel).getByRole('button', { name: 'Save' }));
}

describe('FamilyPedigree, answering from the checklist whether someone has siblings', () => {
  it('goes on to adding a sibling once "Yes" is saved', async () => {
    await answerSiblings('Yes');

    expect(
      await screen.findByRole('heading', { name: 'Add your sibling' }),
    ).toBeInTheDocument();
  });

  it('adds no one once "No" is saved', async () => {
    await answerSiblings('No');

    await waitFor(() =>
      expect(
        screen.queryByTestId('pedigree-person-panel'),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('heading', { name: 'Add your sibling' }),
    ).not.toBeInTheDocument();
  });
});
