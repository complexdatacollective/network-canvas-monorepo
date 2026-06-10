import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useRef, useState } from 'react';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts } from '~/lib/db/types';
import { SAMPLE_PROTOCOL } from '~/lib/protocol/sampleProtocol';
import type { PendingImport } from '~/lib/protocol/useProtocolImport';

import { ProtocolDeck } from './ProtocolDeck';

function makeProtocol(name: string, description: string): ProtocolWithCounts {
  const protocol: CurrentProtocol = {
    name,
    description,
    schemaVersion: 8,
    codebook: {},
    stages: [],
  };
  return {
    id: `story-${name}`,
    hash: `hash-${name}`,
    name,
    schemaVersion: 8,
    importedAt: '2026-05-20T10:00:00.000Z',
    description,
    codebook: {},
    protocol,
    sessionCount: 0,
  };
}

// Interactive harness for the deck's slide lifecycle: activate the import
// card to add a protocol (drop-in + auto-scroll), delete a protocol (scale
// out, then the carousel travels to the neighbour), and install the sample
// (the slot's content swaps in place with simulated progress — no enter/exit
// animation between its states).
function DeckHarness() {
  const [protocols, setProtocols] = useState<ProtocolWithCounts[]>([
    makeProtocol('Friendship Ties', 'A quick two-prompt name generator.'),
    makeProtocol(
      'Social Support Networks',
      'A study exploring the structure of personal support networks.',
    ),
  ]);
  const [showSample, setShowSample] = useState(true);
  const [pending, setPending] = useState<PendingImport[]>([]);
  const counterRef = useRef(0);

  const addProtocol = useCallback(() => {
    counterRef.current += 1;
    const n = counterRef.current;
    setProtocols((prev) => [
      ...prev,
      makeProtocol(`Imported Protocol ${n}`, 'Added via the story harness.'),
    ]);
  }, []);

  const installSample = useCallback(() => {
    const id = 'sample-install';
    const base = {
      id,
      label: SAMPLE_PROTOCOL.name,
      source: 'sample' as const,
    };
    setPending([{ ...base, phase: 'fetching', progress: 0 }]);
    let progress = 0;
    const interval = window.setInterval(() => {
      progress += 0.18;
      if (progress < 1) {
        setPending([
          {
            ...base,
            phase: progress < 0.6 ? 'fetching' : 'extracting',
            progress,
          },
        ]);
        return;
      }
      window.clearInterval(interval);
      setPending([{ ...base, phase: 'saving' }]);
      window.setTimeout(() => {
        setShowSample(false);
        setProtocols((prev) => [
          ...prev,
          makeProtocol(
            SAMPLE_PROTOCOL.name,
            'A sample protocol for demonstration purposes.',
          ),
        ]);
        setPending([]);
      }, 700);
    }, 450);
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <ProtocolDeck
        protocols={protocols}
        sessions={[]}
        showSampleCard={showSample}
        pendingImports={pending}
        onImport={addProtocol}
        onStartInterview={() => {}}
        onDeleteProtocol={(hash) =>
          setProtocols((prev) => prev.filter((p) => p.hash !== hash))
        }
        onInstallSample={installSample}
        onDismissSample={() => setShowSample(false)}
      />
    </div>
  );
}

const meta: Meta = {
  title: 'Components/ProtocolDeck',
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => <DeckHarness />,
};
