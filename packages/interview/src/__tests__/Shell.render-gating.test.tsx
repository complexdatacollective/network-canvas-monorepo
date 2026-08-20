import { render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_RESPONSE_BURDEN } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { InterviewPayload } from '../contract/types';
import Shell from '../Shell';

vi.mock('../hooks/useMediaQuery', () => ({ default: () => false }));

vi.mock('../interfaces', () => {
  const ObservedInterface = ({ stage }: { stage: { id: string } }) => (
    <div data-stage-interface={stage.id} />
  );

  return { default: () => ObservedInterface };
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
    name: 'Render-gating protocol',
    schemaVersion: 8,
    codebook: {
      ego: { variables: {} },
      node: {},
      edge: {},
    },
    assets: [],
    stages: [
      {
        id: 'available-stage',
        type: 'Information',
        // Schema-injected generation metadata: a parsed stage always carries
        // it, and nothing in this test reads it.
        synthetic: {
          generatesData: false,
          responseBurden: DEFAULT_RESPONSE_BURDEN.Information,
        },
        label: 'Available stage',
        title: 'Available stage',
        items: [],
      },
      {
        id: 'unavailable-stage',
        type: 'Information',
        synthetic: {
          generatesData: false,
          responseBurden: DEFAULT_RESPONSE_BURDEN.Information,
        },
        label: 'Unavailable stage',
        title: 'Unavailable stage',
        items: [],
        skipLogic: {
          action: 'SKIP',
          filter: { join: 'AND', rules: [] },
        },
      },
    ],
  },
} satisfies InterviewPayload;

const noActiveAuthoredStagePayload = {
  ...payload,
  protocol: {
    ...payload.protocol,
    stages: [
      {
        id: 'route-controlling-stage',
        type: 'Information',
        synthetic: {
          generatesData: false,
          responseBurden: DEFAULT_RESPONSE_BURDEN.Information,
        },
        label: 'Route-controlling stage',
        title: 'Route-controlling stage',
        items: [],
        skipLogic: {
          action: 'SKIP',
          filter: { join: 'AND', rules: [] },
          destination: { type: 'finish' },
        },
      },
      {
        id: 'bypassed-stage',
        type: 'Information',
        synthetic: {
          generatesData: false,
          responseBurden: DEFAULT_RESPONSE_BURDEN.Information,
        },
        label: 'Bypassed stage',
        title: 'Bypassed stage',
        items: [],
      },
    ],
  },
} satisfies InterviewPayload;

function ControlledShell() {
  const [currentStep, setCurrentStep] = useState(1);

  return (
    <Shell
      payload={payload}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      onSync={() => Promise.resolve()}
      onFinish={() => Promise.resolve()}
      onRequestAsset={() => Promise.resolve('')}
      analytics={{ installationId: 'test', hostApp: 'test' }}
      disableAnalytics
      hideNavigation
    />
  );
}

function ControlledReviewShell() {
  const [currentStep, setCurrentStep] = useState(
    payload.protocol.stages.length,
  );

  return (
    <Shell
      payload={payload}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      onSync={() => Promise.resolve()}
      onFinish={() => Promise.resolve()}
      onRequestAsset={() => Promise.resolve('')}
      analytics={{ installationId: 'test', hostApp: 'test' }}
      reviewMode
      hideNavigation
    />
  );
}

function ControlledNoActiveStageReviewShell() {
  const [currentStep, setCurrentStep] = useState(
    noActiveAuthoredStagePayload.protocol.stages.length,
  );

  return (
    <Shell
      payload={noActiveAuthoredStagePayload}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      onSync={() => Promise.resolve()}
      onFinish={() => Promise.resolve()}
      onRequestAsset={() => Promise.resolve('')}
      analytics={{ installationId: 'test', hostApp: 'test' }}
      reviewMode
      hideNavigation
    />
  );
}

function collectMountedStageIds(records: MutationRecord[], ids: Set<string>) {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;

      const markers = [
        ...(node.matches('[data-stage-interface]') ? [node] : []),
        ...node.querySelectorAll('[data-stage-interface]'),
      ];

      for (const marker of markers) {
        const stageId = marker.getAttribute('data-stage-interface');
        if (stageId) ids.add(stageId);
      }
    }
  }
}

describe('Shell render gating', () => {
  it('never mounts an unavailable saved stage before recovering', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const mountedStageIds = new Set<string>();
    const observer = new MutationObserver((records) => {
      collectMountedStageIds(records, mountedStageIds);
    });
    observer.observe(container, { childList: true, subtree: true });

    const view = render(<ControlledShell />, { container });

    try {
      await waitFor(() => {
        expect(
          view.container.querySelector(
            '[data-stage-interface="available-stage"]',
          ),
        ).toBeInTheDocument();
      });

      collectMountedStageIds(observer.takeRecords(), mountedStageIds);

      expect(mountedStageIds).toContain('available-stage');
      expect(mountedStageIds).not.toContain('unavailable-stage');
    } finally {
      observer.disconnect();
      view.unmount();
      container.remove();
    }
  });

  it('opens a review saved on finish at the last available authored stage', () => {
    const view = render(<ControlledReviewShell />);

    expect(
      view.container.querySelector('[data-stage-interface="available-stage"]'),
    ).toBeInTheDocument();
    expect(
      view.container.querySelector(
        '[data-stage-interface="unavailable-stage"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('opens the route-controlling stage when no authored stage is active', () => {
    const view = render(<ControlledNoActiveStageReviewShell />);

    expect(
      view.container.querySelector(
        '[data-stage-interface="route-controlling-stage"]',
      ),
    ).toBeInTheDocument();
  });
});
