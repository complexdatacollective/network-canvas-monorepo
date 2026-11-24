import { act, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { getLocaleMetadata } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';
import { withAnimationsEnabled } from '@codaco/vitest-config/modern/with-animations-enabled';

import type { InterviewPayload } from '../contract/types';
import Shell from '../Shell';
import type { StageProps } from '../types';
import { testId } from './testIds';

vi.mock('../hooks/useMediaQuery', () => ({ default: () => false }));

// A stage that moves the interview on by itself, as a form does once its last
// question is answered: the request comes from the stage, not from Next. One
// stage asks as soon as it mounts.
vi.mock('../interfaces', async () => {
  const { useLayoutEffect } = await import('react');
  const { testId: id } = await import('./testIds');

  const MovesOnByItself = ({ stage, getNavigationHelpers }: StageProps) => {
    useLayoutEffect(() => {
      if (stage.id === id('moves-on-as-it-mounts')) {
        getNavigationHelpers().moveForward();
      }
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- once, as the stage mounts
    }, []);

    return (
      <button
        type="button"
        data-stage-interface={stage.id}
        onClick={() => getNavigationHelpers().moveForward()}
      >
        {`Move on from ${stage.id}`}
      </button>
    );
  };

  return { default: () => MovesOnByItself };
});

const stage = (name: string) => ({
  id: testId(name),
  type: 'Information' as const,
  label: { en: name },
  content: { en: `# ${name}` },
});

const payload = {
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
    name: 'Stage exit protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: {
      ego: { variables: {} },
      node: {},
      edge: {},
    },
    assets: [],
    stages: [stage('alter-form'), stage('ego-form'), stage('last-stage')],
  },
} satisfies InterviewPayload;

function ControlledShell({
  stages = payload.protocol.stages,
  onStepChange,
}: {
  stages?: InterviewPayload['protocol']['stages'];
  onStepChange: (step: number) => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  return (
    <Shell
      payload={{ ...payload, protocol: { ...payload.protocol, stages } }}
      currentStep={currentStep}
      onStepChange={(step) => {
        onStepChange(step);
        setCurrentStep(step);
      }}
      onSync={() => Promise.resolve()}
      requestedLocales={[]}
      onFinish={() => Promise.resolve()}
      onRequestAsset={() => Promise.resolve('')}
      analytics={{ installationId: 'test', hostApp: 'test' }}
      disableAnalytics
      hideNavigation
    />
  );
}

const stageButton = (name: string) =>
  document.querySelector<HTMLButtonElement>(
    `[data-stage-interface="${testId(name)}"]`,
  );

describe('Shell navigation from a stage that is leaving', () => {
  it('does not let a stage that has been left move the interview on again during its exit animation', async () => {
    const onStepChange = vi.fn();

    // The exit animation is the window this test is about, so it must take
    // real time rather than finishing at once as it does in the other tests.
    await withAnimationsEnabled(async () => {
      render(<ControlledShell onStepChange={onStepChange} />);
      await screen.findByRole('button', {
        name: `Move on from ${testId('alter-form')}`,
      });

      // Next is pressed on the first stage.
      await act(async () => {
        stageButton('alter-form')?.click();
      });
      expect(onStepChange.mock.calls.map(([step]) => step)).toEqual([1]);

      // The first stage is still mounted while it animates out, and its own
      // request to move on arrives now.
      const leavingStage = stageButton('alter-form');
      expect(leavingStage).toBeInTheDocument();
      await act(async () => {
        leavingStage?.click();
      });
      expect(onStepChange.mock.calls.map(([step]) => step)).toEqual([1]);

      // The stage that was reached is shown, and the interview stays on it.
      await waitFor(() => expect(stageButton('ego-form')).toBeInTheDocument());
      expect(stageButton('alter-form')).not.toBeInTheDocument();
      expect(stageButton('last-stage')).not.toBeInTheDocument();
      expect(onStepChange.mock.calls.map(([step]) => step)).toEqual([1]);
    });
  });

  it('lets the stage that was reached move on as soon as it mounts', async () => {
    const onStepChange = vi.fn();
    render(
      <ControlledShell
        stages={[
          stage('alter-form'),
          stage('moves-on-as-it-mounts'),
          stage('last-stage'),
        ]}
        onStepChange={onStepChange}
      />,
    );
    await screen.findByRole('button', {
      name: `Move on from ${testId('alter-form')}`,
    });

    await act(async () => {
      stageButton('alter-form')?.click();
    });

    await waitFor(() => expect(stageButton('last-stage')).toBeInTheDocument());
    expect(onStepChange.mock.calls.map(([step]) => step)).toEqual([1, 2]);
  });
});
