import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps, useEffect, useState } from 'react';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';

import type { ExportWarning } from '@codaco/network-exporters/output';

import { ExportDialog } from './ExportDialog';
import type { ExportFlow } from './useSessionMutations';
import { useShowExportWarnings } from './useShowExportWarnings';

const archiveBlob = new Blob(['export-bytes'], { type: 'application/zip' });

// Mirrors the runtime flow: the dialog always opens in `building` and
// transitions to the target phase, which is when the focus-the-primary-action
// effect fires (mounting straight into `ready` races Base UI's initial
// focus, a situation the app never produces).
function AfterBuildHarness(props: ComponentProps<typeof ExportDialog>) {
  const [flow, setFlow] = useState<ExportFlow>({
    phase: 'building',
    sessionCount: 12,
    stage: 'outputting',
    current: 36,
    total: 40,
  });
  useEffect(() => {
    const timer = setTimeout(() => setFlow(props.flow), 150);
    return () => clearTimeout(timer);
  }, [props.flow]);
  return <ExportDialog {...props} flow={flow} />;
}

const readyFlow: Extract<ExportFlow, { phase: 'ready' | 'saving' }> = {
  phase: 'ready',
  blob: archiveBlob,
  fileName: 'networkCanvasExport-1722772800000.zip',
  sessionIds: Array.from({ length: 12 }, (_, i) => `session-${i}`),
  exportGraphML: true,
  exportCSV: true,
  failedCount: 0,
  warnings: [],
};

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
  (Save-As picker → Web Share on handheld platforms → anchor download), so the
  label varies by browser: desktop Safari downloads rather than sharing.
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
      stage: 'fetching',
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
      stage: 'generating',
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
      stage: 'formatting',
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

const removedCharacterWarnings: ExportWarning[] = [
  {
    kind: 'xml-illegal-characters',
    sessionId: 'session-3',
    caseId: 'P-007',
    variables: ['Nickname', 'ニックネーム'],
    caseIdChanged: false,
  },
  {
    kind: 'xml-illegal-characters',
    sessionId: 'session-8',
    caseId: 'P-012',
    variables: ['Notes'],
    caseIdChanged: true,
  },
  {
    kind: 'xml-illegal-characters-in-protocol',
    protocolName: 'Friendship study',
    text: 'node-type-name',
    original: 'Person\u0007',
  },
];

const renamedColumnWarnings: ExportWarning[] = [
  {
    kind: 'column-renamed',
    protocolName: 'Friendship study',
    format: 'csv',
    entity: 'node',
    entityTypeName: 'Person',
    variable: 'nodeID',
    column: 'nodeID',
    renamedTo: 'nodeID_2',
  },
  {
    kind: 'column-renamed',
    protocolName: 'Friendship study',
    format: 'graphml',
    entity: 'node',
    entityTypeName: 'Person',
    variable: 'Colour',
    column: 'Colour_red',
    renamedTo: 'Colour_red_2',
  },
];

// Answers, and the protocol's own text, held characters GraphML cannot store:
// the dialog names each affected interview, variable and name, and says the
// CSV files keep the answers unchanged.
export const ReadyWithRemovedCharacters: Story = {
  args: {
    flow: { ...readyFlow, warnings: removedCharacterWarnings },
  },
  play: async () => {
    await expect(
      await screen.findByText(
        'Some characters were removed from the GraphML files',
      ),
    ).toBeInTheDocument();
    await expect(
      screen.getByText(/The CSV files keep every answer unchanged/),
    ).toBeInTheDocument();
    await expect(
      screen.getByText('Interview P-007: Nickname and ニックネーム'),
    ).toBeInTheDocument();
    await expect(
      screen.getByText('Interview P-012: Case ID and Notes'),
    ).toBeInTheDocument();
    await expect(
      screen.getByText(
        'Some characters were removed from protocol text in the GraphML files',
      ),
    ).toBeInTheDocument();
    await expect(
      screen.getByText(/The node type name “Person.” in Friendship study/),
    ).toBeInTheDocument();
  },
};

// Columns that would have shared a name with another column in the same file
// were written under a numbered name, and the dialog lists each one.
export const ReadyWithRenamedColumns: Story = {
  args: {
    flow: { ...readyFlow, warnings: renamedColumnWarnings },
  },
  play: async () => {
    await expect(
      await screen.findByText('Some columns were given new names'),
    ).toBeInTheDocument();
    await expect(
      screen.getByText(
        'In the CSV files of Friendship study, the Person column “nodeID” was written as “nodeID_2”.',
      ),
    ).toBeInTheDocument();
    await expect(
      screen.getByText(
        'In the GraphML files of Friendship study, the Person column “Colour_red”, from the variable Colour, was written as “Colour_red_2”.',
      ),
    ).toBeInTheDocument();
  },
};

// Stands in for useSessionMutations' successful save: the dialog closes and
// the warnings it showed are raised as toasts.
function SaveWithWarningsHarness(props: ComponentProps<typeof ExportDialog>) {
  const [flow, setFlow] = useState<ExportFlow>(props.flow);
  const showExportWarnings = useShowExportWarnings();
  return (
    <ExportDialog
      {...props}
      flow={flow}
      onSave={() => {
        props.onSave();
        if (flow.phase !== 'ready') return;
        showExportWarnings(flow.warnings);
        setFlow({ phase: 'idle' });
      }}
    />
  );
}

// After a successful save the dialog closes, and each kind of warning stays
// on screen as a toast until the researcher dismisses it.
export const SavedWithWarnings: Story = {
  args: {
    flow: {
      ...readyFlow,
      warnings: [...removedCharacterWarnings, ...renamedColumnWarnings],
    },
  },
  render: (args) => <SaveWithWarningsHarness {...args} />,
  play: async ({ args }) => {
    await userEvent.click(await screen.findByTestId('data-save-export'));
    await expect(args.onSave).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByText('Archive ready')).not.toBeInTheDocument(),
    );

    const titles = [
      'Some characters were removed from the GraphML files',
      'Some characters were removed from protocol text in the GraphML files',
      'Some columns were given new names',
    ];
    for (const name of titles) {
      await expect(
        await screen.findByRole('heading', { name }),
      ).toBeInTheDocument();
    }

    // Longer than a toast's default timeout: these have none.
    await new Promise((resolve) => setTimeout(resolve, 5500));
    for (const name of titles) {
      await expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }

    // The stack spreads out, and shows its close buttons, under the pointer.
    const newest = titles.at(-1);
    const toast = screen.getByRole('dialog', { name: newest });
    await userEvent.hover(toast);
    await userEvent.click(
      await within(toast).findByRole('button', { name: 'Close' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: newest })).toBeNull(),
    );
    for (const name of titles.slice(0, -1)) {
      await expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
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
