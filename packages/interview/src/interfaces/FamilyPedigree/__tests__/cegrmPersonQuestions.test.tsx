import { createRequire } from 'node:module';

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
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

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

type TemplateStage = { id: string; type: string } & Record<string, unknown>;
type PedigreeStage = TemplateStage & {
  nodeConfiguration: {
    nameAttribute: string;
    sexAssignedAtBirthAttribute: string;
    egoAttribute: string;
  };
  subject: { type: string };
  edgeConfiguration: {
    type: string;
    kindAttribute: string;
    gestationalCarrierAttribute: string;
  };
};
type Template = { stages: TemplateStage[] } & Record<string, unknown>;

const require = createRequire(import.meta.url);

// A JSON fixture is an untyped boundary.
const template =
  require('@codaco/protocols/templates/eco-genetic-relationship-maps') as Template;

const pedigree = template.stages.find(
  (stage): stage is PedigreeStage => stage.type === 'FamilyPedigree',
);
const finish = template.stages.find((stage) => stage.type === 'FinishSession');
if (!pedigree || !finish) {
  throw new Error('The CEGRM template has no Family Pedigree stage');
}

const { nameAttribute, sexAssignedAtBirthAttribute, egoAttribute } =
  pedigree.nodeConfiguration;
const { kindAttribute, gestationalCarrierAttribute } =
  pedigree.edgeConfiguration;

const person = (
  id: string,
  attributes: Record<string, unknown>,
): NcNetwork['nodes'][number] =>
  ({
    [entityPrimaryKeyProperty]: id,
    type: pedigree.subject.type,
    stageId: pedigree.id,
    promptIDs: [],
    [entityAttributesProperty]: attributes,
  }) as NcNetwork['nodes'][number];

const parentOf = (
  parent: string,
  child: string,
  carried: boolean,
): NcNetwork['edges'][number] =>
  ({
    [entityPrimaryKeyProperty]: `${parent}-${child}`,
    type: pedigree.edgeConfiguration.type,
    from: parent,
    to: child,
    [entityAttributesProperty]: {
      [kindAttribute]: ['biological'],
      ...(carried ? { [gestationalCarrierAttribute]: true } : {}),
    },
  }) as NcNetwork['edges'][number];

/**
 * The template's Family Pedigree stage, with the participant, their unnamed
 * mother and their father Tom.
 */
function interview({ mumSavedLabel }: { mumSavedLabel?: string } = {}) {
  const now = new Date(2026, 0, 1);
  const network: NcNetwork = {
    ego: {
      [entityPrimaryKeyProperty]: 'ego-entity',
      [entityAttributesProperty]: {},
    },
    nodes: [
      person('ego', {
        [egoAttribute]: true,
        [sexAssignedAtBirthAttribute]: ['female'],
      }),
      person('mum', {
        [egoAttribute]: false,
        [sexAssignedAtBirthAttribute]: ['female'],
        ...(mumSavedLabel === undefined
          ? {}
          : { [nameAttribute]: mumSavedLabel }),
      }),
      person('dad', {
        [egoAttribute]: false,
        [sexAssignedAtBirthAttribute]: ['male'],
        [nameAttribute]: 'Tom',
      }),
    ],
    edges: [parentOf('mum', 'ego', true), parentOf('dad', 'ego', false)],
  };
  const payload = {
    id: 'cegrm-person-questions',
    startTime: now,
    finishTime: null,
    exportTime: null,
    lastUpdated: now,
    currentStep: 0,
    stageMetadata:
      mumSavedLabel === undefined
        ? null
        : { 0: { generatedLabels: { mum: nameFingerprint(mumSavedLabel) } } },
    network,
    protocol: {
      ...template,
      stages: [pedigree, finish],
      importedAt: now,
      isPreview: false,
      isPending: false,
      assets: [],
    },
  };
  render(<StoryInterviewShell rawPayload={SuperJSON.stringify(payload)} />, {
    wrapper: WithoutMotion,
  });
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

const panel = () => screen.getByTestId('pedigree-person-panel');

/** The panel's words as they read on screen, spaces collapsed. */
const panelText = () => (panel().textContent ?? '').replace(/\s+/g, ' ').trim();

async function openPanelOf(id: string) {
  await screen.findAllByTestId('pedigree-person');
  const user = userEvent.setup();
  await user.click(symbolOf(id));
  await screen.findByTestId('pedigree-person-panel');
  return user;
}

const nameBox = () => within(panel()).getByRole('textbox', { name: /^Name/ });

describe('the CEGRM template’s questions about each person', () => {
  it('asks the participant about themself', async () => {
    interview();
    await openPanelOf('ego');

    await waitFor(() =>
      expect(panelText()).toContain('Are you living or deceased?'),
    );
    expect(panelText()).toContain('What year were you born?');
  });

  it('calls a named relative by their name', async () => {
    interview();
    await openPanelOf('dad');

    await waitFor(() =>
      expect(panelText()).toContain('Is Tom living or deceased?'),
    );
    expect(panelText()).toContain('What year was Tom born?');
  });

  it('calls an unnamed relative "this person"', async () => {
    interview();
    await openPanelOf('mum');

    await waitFor(() =>
      expect(panelText()).toContain('Is this person living or deceased?'),
    );
    expect(panelText()).toContain('What year was this person born?');
  });

  it('calls a relative holding a label saved on an earlier visit "this person"', async () => {
    interview({ mumSavedLabel: 'Mother' });
    await openPanelOf('mum');

    await waitFor(() =>
      expect(panelText()).toContain('Is this person living or deceased?'),
    );
    expect(panelText()).toContain('What year was this person born?');
  });

  it('follows a name as it is typed and cleared', async () => {
    interview();
    const user = await openPanelOf('mum');

    await user.type(nameBox(), 'Sam');
    await waitFor(() =>
      expect(panelText()).toContain('Is Sam living or deceased?'),
    );
    expect(panelText()).toContain('What year was Sam born?');

    await user.clear(nameBox());
    await waitFor(() =>
      expect(panelText()).toContain('Is this person living or deceased?'),
    );
  });
});
