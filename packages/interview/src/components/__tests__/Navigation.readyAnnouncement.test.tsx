import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import {
  asEntityAttributeReference,
  getLocaleMetadata,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { InterviewPayload } from '../../contract/types';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { createEncryptionStore } from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import Shell from '../../Shell';
import Navigation from '../Navigation';

// Only the two stage types the Shell test below walks through, so jsdom does
// not load the WebGL stages.
vi.mock('../../interfaces', async () => {
  const { default: Information } =
    await import('../../interfaces/Information/Information');
  const { default: NameGeneratorQuickAdd } =
    await import('../../interfaces/NameGenerator/NameGeneratorQuickAdd');
  return {
    default: (type: string) =>
      type === 'NameGeneratorQuickAdd' ? NameGeneratorQuickAdd : Information,
  };
});

vi.mock('../../hooks/useMediaQuery', () => ({ default: () => false }));

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class StubWorker {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  terminate() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver);
  vi.stubGlobal('Worker', StubWorker);
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

const READY = 'You can continue to the next step.';

type Props = ComponentProps<typeof Navigation>;

const baseProps: Props = {
  moveBackward: () => {},
  moveForward: () => {},
  pulseNext: false,
  screenId: '0:0',
  progress: 0,
};

const renderNavigation = (props: Partial<Props>) => {
  const store = createEncryptionStore([]);
  const ui = (next: Partial<Props>) => (
    <Provider store={store}>
      <InterviewI18nProvider>
        <DialogProvider>
          <Navigation {...baseProps} {...next} />
        </DialogProvider>
      </InterviewI18nProvider>
    </Provider>
  );
  const view = render(ui(props));
  return { rerender: (next: Partial<Props>) => view.rerender(ui(next)) };
};

// Lets the task that releases the sentence for a newly committed screen run.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const nextButton = () => screen.getByRole('button', { name: 'Next Step' });
const announcer = () => screen.getByTestId('ready-to-continue-announcer');

describe('Navigation ready-to-continue announcement', () => {
  it('describes the Next button and adds the sentence once each time the screen becomes ready', async () => {
    const { rerender } = renderNavigation({ pulseNext: false });
    await settle();

    const region = announcer();
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region).toHaveAttribute('lang', 'en');
    expect(nextButton()).not.toHaveAccessibleDescription();
    expect(region).toBeEmptyDOMElement();

    // Gaining readiness on the screen adds the sentence in the same render.
    rerender({ pulseNext: true });
    expect(nextButton()).toHaveAccessibleName('Next Step');
    expect(nextButton()).toHaveAccessibleDescription(READY);
    const description = document.getElementById(
      nextButton().getAttribute('aria-describedby') ?? '',
    );
    expect(description).toHaveAttribute('lang', 'en');
    expect(description).not.toBeVisible();
    expect(announcer()).toBe(region);
    expect(region).toHaveTextContent(READY);
    const firstAnnouncement = region.firstElementChild;
    expect(firstAnnouncement).not.toBeNull();

    // A render that leaves readiness unchanged must not add another node.
    rerender({ pulseNext: true, progress: 50 });
    expect(region.firstElementChild).toBe(firstAnnouncement);

    rerender({ pulseNext: false, progress: 50 });
    expect(nextButton()).not.toHaveAccessibleDescription();
    expect(region).toBeEmptyDOMElement();

    rerender({ pulseNext: true, progress: 50 });
    expect(nextButton()).toHaveAccessibleDescription(READY);
    expect(region).toHaveTextContent(READY);
    // Regaining readiness puts a new node in the region instead of leaving
    // the old one in place.
    expect(region.firstElementChild).not.toBeNull();
    expect(region.firstElementChild).not.toBe(firstAnnouncement);
    expect(firstAnnouncement?.isConnected).toBe(false);
  });

  it('mounts the region empty and adds the sentence afterwards when the first screen is already ready', async () => {
    renderNavigation({ pulseNext: true });

    const region = announcer();
    expect(nextButton()).toHaveAccessibleDescription(READY);
    expect(region).toBeEmptyDOMElement();

    await waitFor(() => expect(region).toHaveTextContent(READY));
    expect(announcer()).toBe(region);
  });
});

const quickAddStage = (id: string, prompts: string[], minNodes?: number) => ({
  id,
  type: 'NameGeneratorQuickAdd' as const,
  label: { en: id },
  subject: { entity: 'node' as const, type: 'person' },
  quickAdd: asEntityAttributeReference('name'),
  prompts: prompts.map((text) => ({ id: `${id}-${text}`, text: { en: text } })),
  ...(minNodes === undefined
    ? {}
    : {
        behaviours: { minNodes },
        minNodesNotice: {
          en: '{count, plural, one {Add at least # person.} other {Add at least # people.}}',
        },
      }),
});

const walkPayload = (): InterviewPayload => ({
  session: {
    id: 'session-1',
    startTime: '2026-01-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-01-01T00:00:00.000Z',
    localeOptions: [getLocaleMetadata('en')],
    network: {
      ego: {
        [entityPrimaryKeyProperty]: 'ego-1',
        [entityAttributesProperty]: {},
      },
      nodes: [],
      edges: [],
    },
  },
  protocol: {
    id: 'protocol-1',
    hash: 'protocol-hash',
    importedAt: '2026-01-01T00:00:00.000Z',
    name: 'Ready announcement protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: {
      ego: { variables: {} },
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          icon: 'add-a-person',
          variables: { name: { name: 'Name', type: 'text' } },
        },
      },
      edge: {},
    },
    assets: [],
    stages: [
      {
        id: 'intro',
        type: 'Information',
        label: { en: 'Intro' },
        title: { en: 'Introduction' },
        items: [],
      },
      quickAddStage('friends', ['Name your friends', 'Name your neighbours']),
      quickAddStage('family', ['Name your family']),
      quickAddStage('clubs', ['Name your club members']),
      quickAddStage('colleagues', ['Name your colleagues'], 1),
      {
        id: 'finish',
        type: 'FinishSession',
        mode: 'confirmation',
        label: { en: 'Finish' },
        content: { en: '# Finish\n\nThe end.' },
        finishedContent: { en: '# Finished\n\nThank you.' },
        finishLabel: { en: 'Finish' },
        finishConfirmation: { en: 'Finish this interview?' },
        finishFailed: { en: 'The interview could not be finished.' },
        outcome: 'completed',
      },
    ],
  },
});

function WithoutMotion({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimations reducedMotion="always">
      {children}
    </AnimationProvider>
  );
}

describe('the ready-to-continue status across screens', () => {
  let observer: MutationObserver | undefined;
  afterEach(() => observer?.disconnect());

  it('adds the sentence once on every arrival at a ready stage or prompt, and never for a screen that is not ready', async () => {
    render(
      <Shell
        payload={walkPayload()}
        onSync={() => Promise.resolve()}
        requestedLocales={[]}
        onFinish={() => Promise.resolve()}
        onRequestAsset={() => Promise.resolve('')}
        analytics={{ installationId: 'test', hostApp: 'test' }}
        disableAnalytics
        flags={{ isE2E: true }}
      />,
      { wrapper: WithoutMotion },
    );

    await screen.findByText('Introduction');
    const region = announcer();
    const announced: Node[] = [];
    observer = new MutationObserver((records) => {
      for (const record of records) announced.push(...record.addedNodes);
    });
    observer.observe(region, { childList: true, subtree: true });

    const user = userEvent.setup();
    const goForwardTo = async (prompt: string) => {
      await user.click(screen.getByTestId('next-button'));
      await screen.findByText(prompt);
    };
    const expectNewAnnouncement = async (count: number) => {
      await waitFor(() => expect(announced).toHaveLength(count));
      expect(announced.at(-1)?.textContent).toBe(READY);
      expect(announced.at(-1)?.isConnected).toBe(true);
      expect(region).toHaveTextContent(READY);
    };

    expect(region).toBeEmptyDOMElement();

    // Arriving at a stage that is ready at once, from one that is not.
    await goForwardTo('Name your friends');
    await expectNewAnnouncement(1);

    // A second prompt of the same stage, ready on arrival.
    await goForwardTo('Name your neighbours');
    await expectNewAnnouncement(2);

    // A ready stage straight after a ready stage, from its second prompt.
    await goForwardTo('Name your family');
    await expectNewAnnouncement(3);

    // The same again where both screens are a stage's first prompt.
    await goForwardTo('Name your club members');
    await expectNewAnnouncement(4);

    // A stage that is not ready on arrival: the leaving stage's readiness must
    // not add the sentence for it.
    await goForwardTo('Name your colleagues');
    await waitFor(() =>
      expect(
        screen.getByTestId('next-button'),
      ).not.toHaveAccessibleDescription(),
    );
    await settle();
    expect(region).toBeEmptyDOMElement();
    expect(announced).toHaveLength(4);
  });
});
