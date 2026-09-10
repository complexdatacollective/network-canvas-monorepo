import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { hostResponsibilities } from './hostResponsibilities.ts';

/**
 * What a host has to serve for the editors in this Storybook to work at all.
 *
 * Every row is a procedure `src/contract/contract.ts` declares, found by asking
 * the contract rather than by anybody writing the list down — so a procedure
 * added to the contract appears here, and one removed disappears. See
 * `hostResponsibilities.ts` for why that matters more than it sounds.
 */
function HostResponsibilities() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <Heading level="h1">What a host must serve</Heading>
      <Paragraph>
        Every procedure <code>@codaco/protocol-builder</code>’s contract
        declares. The in-memory host in <code>src/testing/host/</code> serves
        all of them; Studio serves them over its transport, and Architect
        in-process.
      </Paragraph>
      <dl className="flex flex-col gap-4">
        {hostResponsibilities().map(({ path, responsibility }) => (
          <div key={path} className="flex flex-col gap-1">
            <dt className="font-bold">
              <code>{path}</code>
            </dt>
            <dd className="m-0">{responsibility}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}

const meta = {
  title: 'Protocol Builder/Host responsibilities',
  component: HostResponsibilities,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The minimum a host must serve, read off the package’s own oRPC contract. The list is derived at render time from `src/contract/contract.ts`, so it cannot describe a host the package does not actually ask for: a procedure the contract gains appears here with nothing edited, and a sentence left behind for a procedure the contract has dropped is a thrown error rather than a stale line.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof HostResponsibilities>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The list, and the two facts about it worth asserting: every procedure the
 * contract declares is on the page, and the page invents none.
 */
export const EveryProcedure: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const expected = hostResponsibilities();

    // A page that rendered nothing would satisfy every "each row is present"
    // check below by vacuity.
    await expect(expected.length).toBeGreaterThan(0);

    const terms = await canvas.findAllByRole('term');
    await expect(terms.map((term) => term.textContent)).toEqual(
      expected.map(({ path }) => path),
    );

    for (const { responsibility } of expected) {
      await expect(canvas.getByText(responsibility)).toBeInTheDocument();
    }
  },
};
