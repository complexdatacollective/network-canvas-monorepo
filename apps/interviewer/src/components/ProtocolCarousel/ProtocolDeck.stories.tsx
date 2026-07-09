import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useRef, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

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

async function uploadProtocolFile(canvas: ReturnType<typeof within>) {
  const fileInput = canvas.getByLabelText('Choose a .netcanvas protocol file');
  if (!(fileInput instanceof HTMLInputElement)) {
    throw new Error('protocol import file input not found');
  }
  await userEvent.upload(
    fileInput,
    new File(['netcanvas'], 'study.netcanvas', {
      type: 'application/x-netcanvas',
    }),
  );
  fileInput.blur();
}

// Interactive harness for the deck's slide lifecycle: activate the import
// card to run a simulated import (pending card drops in, the deck travels
// to it, then the slot fills with the installed protocol), delete a
// protocol (scale out, neighbours close the gap), and install the sample
// (the slot's content swaps in place with simulated progress).
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

  // Mirrors useProtocolImport's flow: the pending entry appears first (the
  // deck travels to its card), the import "runs", then the slot fills in
  // place with the installed protocol.
  const addProtocol = useCallback(() => {
    counterRef.current += 1;
    const n = counterRef.current;
    const name = `Imported Protocol ${n}`;
    const id = `import-${n}`;
    setPending((prev) => [
      ...prev,
      { id, label: name, source: 'file', phase: 'extracting', progress: 0.4 },
    ]);
    window.setTimeout(() => {
      setProtocols((prev) => [
        ...prev,
        makeProtocol(name, 'Added via the story harness.'),
      ]);
      setPending((prev) => prev.filter((entry) => entry.id !== id));
    }, 1500);
  }, []);

  const installSample = useCallback(() => {
    const id = 'sample-install';
    const base = {
      id,
      label: SAMPLE_PROTOCOL.name,
      source: 'sample' as const,
    };
    setPending([{ ...base, phase: 'extracting', progress: 0 }]);
    let progress = 0;
    const interval = window.setInterval(() => {
      progress += 0.18;
      if (progress < 1) {
        setPending([
          {
            ...base,
            phase: 'extracting',
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
        onImportFile={() => addProtocol()}
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

// Chevrons and dots are plain buttons driving the controlled activeIndex.
export const ChevronAndDotNavigation: Story = {
  render: () => <DeckHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dots = await canvas.findAllByLabelText(/Go to card/);
    await expect(dots).toHaveLength(4);
    await expect(dots[0]).toHaveAttribute('aria-current', 'true');

    await userEvent.click(canvas.getByLabelText('Next protocol'));
    await waitFor(() =>
      expect(dots[1]).toHaveAttribute('aria-current', 'true'),
    );

    await userEvent.click(canvas.getByLabelText('Go to card 4'));
    await waitFor(() =>
      expect(dots[3]).toHaveAttribute('aria-current', 'true'),
    );
    await expect(canvas.getByLabelText('Next protocol')).toBeDisabled();

    await userEvent.click(canvas.getByLabelText('Previous protocol'));
    await waitFor(() =>
      expect(dots[2]).toHaveAttribute('aria-current', 'true'),
    );
  },
};

// Window-level arrows step the deck; Enter activates the active import card,
// then a selected file starts the harness import flow.
export const KeyboardNavigation: Story = {
  render: () => <DeckHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dots = await canvas.findAllByLabelText(/Go to card/);
    await expect(dots).toHaveLength(4);

    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    await waitFor(() =>
      expect(dots[3]).toHaveAttribute('aria-current', 'true'),
    );

    await userEvent.keyboard('{Enter}');
    await uploadProtocolFile(canvas);
    await waitFor(async () => {
      const updated = await canvas.findAllByLabelText(/Go to card/);
      expect(updated).toHaveLength(5);
      // The deck travels to the new pending card ("Imported Protocol 1"
      // sorts to index 1) when the import starts.
      expect(updated[1]).toHaveAttribute('aria-current', 'true');
    });

    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(async () => {
      const updated = await canvas.findAllByLabelText(/Go to card/);
      expect(updated[0]).toHaveAttribute('aria-current', 'true');
    });
  },
};

// Starting an import pulls the deck to the pending card, which then fills
// in place with the installed protocol.
export const ImportTravelsToPendingCard: Story = {
  render: () => <DeckHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dots = await canvas.findAllByLabelText(/Go to card/);
    await expect(dots).toHaveLength(4);

    const importCard = await canvas.findByRole('button', {
      name: 'Import a protocol',
    });
    await userEvent.click(canvas.getByLabelText('Go to card 4'));
    await waitFor(() =>
      expect(canvas.getByLabelText('Go to card 4')).toHaveAttribute(
        'aria-current',
        'true',
      ),
    );

    await userEvent.click(importCard);
    await uploadProtocolFile(canvas);
    await waitFor(async () => {
      const updated = await canvas.findAllByLabelText(/Go to card/);
      expect(updated).toHaveLength(5);
      expect(updated[1]).toHaveAttribute('aria-current', 'true');
    });

    // The slot fills in place with the installed protocol; the deck stays
    // on the same card.
    await waitFor(
      async () => {
        expect(
          canvas.getByText('Added via the story harness.'),
        ).toBeInTheDocument();
        const updated = await canvas.findAllByLabelText(/Go to card/);
        expect(updated[1]).toHaveAttribute('aria-current', 'true');
      },
      { timeout: 4000 },
    );
  },
};

// Tapping a non-active card navigates to it instead of activating it.
export const ClickToNavigate: Story = {
  render: () => <DeckHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dots = await canvas.findAllByLabelText(/Go to card/);
    await expect(dots[0]).toHaveAttribute('aria-current', 'true');

    // The carousel mounts only after the ResizeObserver delivers a height,
    // so wait for the card rather than querying synchronously.
    await userEvent.click(await canvas.findByText('Social Support Networks'));
    await waitFor(() =>
      expect(dots[2]).toHaveAttribute('aria-current', 'true'),
    );
  },
};

// Removal: the card exits in place and neighbours close the gap; the
// active slot follows the clamp (right neighbour inherits the index).
export const DeleteActiveProtocol: Story = {
  render: () => <DeckHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dots = await canvas.findAllByLabelText(/Go to card/);
    await expect(dots).toHaveLength(4);

    // The active card is Friendship Ties; its delete button is the first.
    // find* waits for the carousel to mount once the ResizeObserver delivers
    // a section height.
    const deleteButton = (
      await canvas.findAllByLabelText('Delete Protocol')
    )[0];
    if (!deleteButton) throw new Error('Delete Protocol button not found');
    await userEvent.click(deleteButton);

    await waitFor(
      async () => {
        const updated = await canvas.findAllByLabelText(/Go to card/);
        expect(updated).toHaveLength(3);
        expect(updated[0]).toHaveAttribute('aria-current', 'true');
      },
      { timeout: 3000 },
    );
  },
};
