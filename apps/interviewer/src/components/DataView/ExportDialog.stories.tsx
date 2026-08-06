import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps, useEffect, useState } from 'react';
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test';

import { stageMessages } from '@codaco/network-exporters/events';

import { ExportDialog } from './ExportDialog';
import type { ExportFlow } from './useSessionMutations';

const archiveBlob = new Blob(['export-bytes'], { type: 'application/zip' });

// Mirrors the runtime flow: the dialog always opens in `building` and
// transitions to the target phase, which is when the focus-the-primary-action
// effect fires (mounting straight into `ready` races Base UI's initial
// focus, a situation the app never produces).
function AfterBuildHarness(props: ComponentProps<typeof ExportDialog>) {
  const [flow, setFlow] = useState<ExportFlow>({
    phase: 'building',
    sessionCount: 12,
    stageMessage: stageMessages.outputting,
    current: 36,
    total: 40,
  });
  useEffect(() => {
    const timer = setTimeout(() => setFlow(props.flow), 150);
    return () => clearTimeout(timer);
  }, [props.flow]);
  return <ExportDialog {...props} flow={flow} />;
}

const readyFlow = {
  phase: 'ready',
  blob: archiveBlob,
  fileName: 'networkCanvasExport-1722772800000.zip',
  sessionIds: Array.from({ length: 12 }, (_, i) => `session-${i}`),
  exportGraphML: true,
  exportCSV: true,
  failedCount: 0,
} as const;

const meta = {
  title: 'Components/DataView/ExportDialog',
  component: ExportDialog,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {
        inline: false,
        height: '32rem',
      },
      description: {
        component: `
The modal export flow for the Data view: archive build progress, then a primary
action whose click provides the fresh user gesture \`saveBlob\` needs (Web
Share must be invoked within a user activation, which the async archive build
consumes — the flow is therefore two activations on iOS by platform
constraint). Driven entirely by the \`ExportFlow\` state from
\`useSessionMutations\`.

\`\`\`tsx
<ExportDialog
  flow={exportFlow}
  onCancelBuild={handleCancelBuild}
  onSave={() => void handleShareReady()}
  onDismiss={handleDismissExport}
/>
\`\`\`

- \`flow\` — the export flow state: \`idle\` (closed), \`building\` (progress,
  explicit Cancel only), \`ready\` (primary Save/Share/Download action),
  \`saving\` (non-dismissible while the OS surface is up), or \`error\`.
- \`onSave\` must be wired straight to \`handleShareReady\`: the handler calls
  \`saveBlob\` with no await before it, keeping the gesture fresh.
- The primary action's verb is derived from the platform capability ladder
  (Save-As picker → Web Share → anchor download), so the label varies by
  browser.
- \`onDismiss\` discards a built-but-unsaved archive; sessions are only marked
  exported after a genuine save.
        `,
      },
    },
  },
  args: {
    flow: readyFlow,
    onCancelBuild: fn(),
    onSave: fn(),
    onDismiss: fn(),
  },
  argTypes: {
    flow: {
      control: false,
      description:
        'Discriminated union of the export flow phases; see the per-state stories.',
    },
    onCancelBuild: { control: false },
    onSave: { control: false },
    onDismiss: { control: false },
  },
} satisfies Meta<typeof ExportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// Before the current stage emits a progress event with a total, the bar is
// indeterminate and only the spinner + stage message signal activity.
export const BuildingIndeterminate: Story = {
  args: {
    flow: {
      phase: 'building',
      sessionCount: 12,
      stageMessage: stageMessages.fetching,
      current: null,
      total: null,
    },
  },
};

export const BuildingWithProgress: Story = {
  args: {
    flow: {
      phase: 'building',
      sessionCount: 12,
      stageMessage: stageMessages.generating,
      current: 74,
      total: 120,
    },
  },
  play: async ({ args }) => {
    const cancel = await screen.findByTestId('export-cancel-build');

    // The build must not be dismissible: Escape is inert, and only the
    // explicit Cancel action aborts.
    await userEvent.keyboard('{Escape}');
    await expect(args.onDismiss).not.toHaveBeenCalled();
    await expect(args.onCancelBuild).not.toHaveBeenCalled();

    await userEvent.click(cancel);
    await expect(args.onCancelBuild).toHaveBeenCalledOnce();
  },
};

// The singular-count copy path.
export const BuildingSingleInterview: Story = {
  args: {
    flow: {
      phase: 'building',
      sessionCount: 1,
      stageMessage: stageMessages.formatting,
      current: null,
      total: null,
    },
  },
};

// The primary action label ("Save…" / "Share…" / "Download") is derived from
// this browser's capability ladder, so it varies by environment. Rendered
// through the build → ready transition the app always takes.
export const Ready: Story = {
  render: (args) => <AfterBuildHarness {...args} />,
  play: async ({ args }) => {
    const save = await screen.findByTestId('data-save-export');

    // Focus lands on the primary action when the archive becomes ready, so
    // Enter (a fresh user activation) can trigger the save immediately.
    await waitFor(() => expect(save).toHaveFocus());

    await userEvent.click(save);
    await expect(args.onSave).toHaveBeenCalledOnce();
  },
};

export const ReadyPartialFailure: Story = {
  args: {
    flow: { ...readyFlow, failedCount: 3 },
  },
};

export const ReadySingleInterview: Story = {
  args: {
    flow: { ...readyFlow, sessionIds: ['session-0'], failedCount: 1 },
  },
};

// While the OS save/share surface is up both actions disable and the dialog
// cannot be dismissed.
export const Saving: Story = {
  args: {
    flow: { ...readyFlow, phase: 'saving' },
  },
  play: async ({ args }) => {
    const save = await screen.findByTestId('data-save-export');
    await expect(save).toBeDisabled();
    await expect(screen.getByTestId('export-dismiss')).toBeDisabled();

    await userEvent.keyboard('{Escape}');
    await expect(args.onDismiss).not.toHaveBeenCalled();
  },
};

export const ErrorState: Story = {
  args: {
    flow: {
      phase: 'error',
      message: 'Export produced no file',
      detail:
        'Error: Export produced no file\n    at handleExport (useSessionMutations.ts:129:15)',
    },
  },
  play: async ({ args }) => {
    // The support flow: copyable error details alongside the Close action.
    await expect(
      await screen.findByTestId('export-copy-error'),
    ).toBeInTheDocument();

    const close = await screen.findByTestId('export-dismiss');
    await userEvent.click(close);
    await expect(args.onDismiss).toHaveBeenCalledOnce();
  },
};
