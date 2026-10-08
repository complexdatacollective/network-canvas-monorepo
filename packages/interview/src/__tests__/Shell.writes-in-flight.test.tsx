import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import { asEntityAttributeReference } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { InterviewPayload } from '../contract/types';
import Shell from '../Shell';
import { updateEgo } from '../store/modules/session';

vi.mock('../hooks/useMediaQuery', () => ({ default: () => false }));

vi.mock('../interfaces', () => {
  const ObservedInterface = ({ stage }: { stage: { id: string } }) => (
    <div data-testid="stage" data-stage-interface={stage.id} />
  );

  return { default: () => ObservedInterface };
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal('IntersectionObserver', ResizeObserverStub);
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

const payload = {
  session: {
    id: 'session-1',
    startTime: '2026-01-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-01-01T00:00:00.000Z',
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
    name: 'Writes-in-flight protocol',
    schemaVersion: 8,
    codebook: {
      ego: { variables: { agrees: { name: 'Agrees', type: 'boolean' } } },
      node: {},
      edge: {},
    },
    assets: [],
    stages: [
      {
        id: 'first-stage',
        type: 'Information',
        label: 'First stage',
        title: 'First stage',
        items: [],
      },
      {
        id: 'agreed-stage',
        type: 'Information',
        label: 'Agreed stage',
        title: 'Agreed stage',
        items: [],
        skipLogic: {
          action: 'SKIP',
          filter: {
            join: 'AND',
            rules: [
              {
                id: 'does-not-agree',
                type: 'ego',
                options: {
                  attribute: asEntityAttributeReference('agrees'),
                  operator: 'EXACTLY',
                  value: false,
                },
              },
            ],
          },
        },
      },
      {
        id: 'last-stage',
        type: 'Information',
        label: 'Last stage',
        title: 'Last stage',
        items: [],
      },
    ],
  },
} satisfies InterviewPayload;

function WithoutMotion({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimations reducedMotion="always">
      {children}
    </AnimationProvider>
  );
}

function liveStore() {
  const store = window.__interviewStore;
  if (!store) throw new Error('store not exposed');
  return store;
}

describe('Shell leaving a stage with a write under way', () => {
  it('chooses the next stage with an answer still being stored', async () => {
    render(
      <Shell
        payload={payload}
        onSync={() => Promise.resolve()}
        onFinish={() => Promise.resolve()}
        onRequestAsset={() => Promise.resolve('')}
        analytics={{ installationId: 'test', hostApp: 'test' }}
        disableAnalytics
        flags={{ isE2E: true }}
      />,
      { wrapper: WithoutMotion },
    );
    const next = await screen.findByRole('button', { name: 'Next Step' });
    const store = liveStore();
    const declined = { set: { agrees: false }, unset: [] };
    act(() => {
      store.dispatch(updateEgo.pending('w1', declined));
    });

    await userEvent.setup().click(next);
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(screen.getByTestId('stage')).toHaveAttribute(
      'data-stage-interface',
      'first-stage',
    );

    act(() => {
      store.dispatch(updateEgo.fulfilled(declined, 'w1', declined));
    });
    await waitFor(() =>
      expect(screen.getByTestId('stage')).toHaveAttribute(
        'data-stage-interface',
        'last-stage',
      ),
    );
  });
});
