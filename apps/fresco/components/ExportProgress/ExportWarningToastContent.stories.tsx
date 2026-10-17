import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TriangleAlert } from 'lucide-react';
import { expect, screen, userEvent } from 'storybook/test';

import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import { useToast } from '@codaco/fresco-ui/Toast';
import { formatExportWarnings } from '@codaco/network-exporters/messages';
import type { ExportWarning } from '@codaco/network-exporters/output';

import ExportWarningToastContent from './ExportWarningToastContent';

const everyKindOfWarning: ExportWarning[] = [
  {
    kind: 'xml-illegal-characters',
    sessionId: 'session-3',
    caseId: 'P-007',
    variables: ['Nickname', 'ニックネーム'],
    caseIdChanged: false,
  },
  {
    kind: 'xml-illegal-characters-in-protocol',
    protocolName: 'Friendship study',
    text: 'node-type-name',
    name: 'Person',
    removed: ['U+0007'],
  },
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

// Raises the toasts the way ExportProgressProvider does after an export.
function RaiseWarningToasts({
  warnings,
}: {
  warnings: readonly ExportWarning[];
}) {
  const intl = useAppIntl();
  const { add } = useToast();

  return (
    <Button
      onClick={() => {
        for (const group of formatExportWarnings(intl, warnings)) {
          add({
            title: group.title,
            description: <ExportWarningToastContent group={group} />,
            icon: <TriangleAlert className="size-5" aria-hidden />,
            timeout: 0,
          });
        }
      }}
    >
      Finish export
    </Button>
  );
}

const meta: Meta<typeof RaiseWarningToasts> = {
  title: 'Components/ExportProgress/ExportWarningToastContent',
  component: RaiseWarningToasts,
  parameters: {
    layout: 'centered',
  },
  args: { warnings: everyKindOfWarning },
};

export default meta;
type Story = StoryObj<typeof meta>;

// One toast for each kind of warning an export gave, each kept until it is
// dismissed.
export const EveryKind: Story = {
  play: async () => {
    await userEvent.click(
      await screen.findByRole('button', { name: 'Finish export' }),
    );

    for (const name of [
      'Some characters were removed from the GraphML files',
      'Some characters were removed from protocol text in the GraphML files',
      'Some columns were given new names',
    ]) {
      await expect(
        await screen.findByRole('heading', { name }),
      ).toBeInTheDocument();
    }
    await expect(
      screen.getByText(
        'The node type name “Person” in Friendship study, with U+0007 removed',
      ),
    ).toBeInTheDocument();
    await expect(
      screen.getByText(
        'In the GraphML files of Friendship study, the Person column “Colour_red”, from the variable Colour, was written as “Colour_red_2”.',
      ),
    ).toBeInTheDocument();
  },
};
