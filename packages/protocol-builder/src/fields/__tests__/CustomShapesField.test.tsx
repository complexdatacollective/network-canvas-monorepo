import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Redacted } from 'effect';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { isValidNodeShapeSvg } from '@codaco/fresco-ui/node/nodeShapeSvg';

import type {
  CustomShapes,
  CustomShapeUsage,
} from '../../codebook/customShapes.ts';
import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import { ResourceClientProvider } from '../../resources/client.tsx';
import {
  createResourceHost,
  type CommittedResource,
  withResourceProcedures,
} from '../../resources/components/__tests__/resourceHost.ts';
import CustomShapesField from '../CustomShapesField.tsx';

const HOME_SVG =
  '<svg viewBox="0 0 100 100"><path d="M10 50 L50 10 L90 50 V90 H10 Z" fill="#e04f6d"/><rect id="label-area" x="20" y="55" width="60" height="30" fill="#ffffff"/></svg>';

const CHOOSE_FILE = 'Choose a file from your computer';

const STORED: readonly CommittedResource[] = [
  {
    id: 'stored-home',
    kind: 'image',
    name: 'Stored home',
    source: 'stored-home.svg',
    bytes: HOME_SVG,
  },
  {
    id: 'stored-broken',
    kind: 'image',
    name: 'Broken drawing',
    source: 'stored-broken.svg',
    bytes: '<svg><circle r="2"/></svg>',
  },
  {
    id: 'stored-photo',
    kind: 'image',
    name: 'Photo',
    source: 'stored-photo.png',
    bytes: 'not really a png',
  },
];

const svgFile = (name: string, source: string) =>
  new File([source], name, { type: 'image/svg+xml' });

function Harness({
  initial,
  usage,
  onValue,
}: {
  initial?: CustomShapes;
  usage?: Readonly<Record<string, CustomShapeUsage>>;
  onValue: (value: CustomShapes | undefined) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CustomShapesField
      name="customShapes"
      value={value}
      usage={usage}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

const renderField = (
  options: Readonly<{
    initial?: CustomShapes;
    usage?: Readonly<Record<string, CustomShapeUsage>>;
  }> = {},
) => {
  const host = createResourceHost({ resources: STORED });
  const values: (CustomShapes | undefined)[] = [];
  const stagedBytes: string[] = [];
  const adapter = withResourceProcedures(host, {
    stage: (input) => {
      if (input.request.kind === 'content') {
        stagedBytes.push(
          new TextDecoder().decode(Redacted.value(input.request.bytes)),
        );
      }
      return host.adapter.rpcCall('ResourcesStage', input);
    },
  });
  render(
    <DialogProvider>
      <ProtocolBuilder adapter={adapter} protocolId={host.protocolId}>
        <ResourceClientProvider>
          <Harness
            initial={options.initial}
            usage={options.usage}
            onValue={(value) => values.push(value)}
          />
        </ResourceClientProvider>
      </ProtocolBuilder>
    </DialogProvider>,
  );
  return { host, values, stagedBytes };
};

const openBrowser = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Add a shape' }));
  return screen.findByRole('dialog', { name: 'Choose a node shape' });
};

describe('CustomShapesField', () => {
  it('imports an SVG file as a resource, named after the file and stored clean', async () => {
    const user = userEvent.setup();
    const { values, stagedBytes } = renderField();

    const dialog = await openBrowser(user);
    await user.upload(
      within(dialog).getByLabelText(CHOOSE_FILE),
      svgFile(
        'home.svg',
        HOME_SVG.replace('<path', '<script>alert(1)</script><path'),
      ),
    );
    expect(await screen.findByLabelText(/Shape name/)).toHaveValue('home');
    const stored = Object.values(values.at(-1) ?? {});
    expect(stored).toHaveLength(1);
    const asset = stored[0]?.asset ?? '';
    expect(asset).not.toBe('');
    expect(screen.getByText(/was left out: scripts\./)).toBeInTheDocument();

    expect(stagedBytes).toHaveLength(1);
    expect(stagedBytes[0]).not.toContain('script');
    expect(isValidNodeShapeSvg(stagedBytes[0] ?? '')).toBe(true);
  });

  it('refuses a file that is not an SVG and keeps the value unchanged', async () => {
    const user = userEvent.setup();
    const { values, stagedBytes } = renderField();

    const dialog = await openBrowser(user);
    await user.upload(
      within(dialog).getByLabelText(CHOOSE_FILE),
      svgFile('notes.svg', 'just some words'),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '"notes.svg" is not an SVG image.',
    );
    expect(values).toEqual([]);
    expect(stagedBytes).toEqual([]);
  });

  it('offers only the SVG images the protocol holds, and adds one it can draw', async () => {
    const user = userEvent.setup();
    const { values } = renderField();

    const dialog = await openBrowser(user);
    await within(dialog).findByRole('button', { name: 'Stored home' });
    expect(
      within(dialog).queryByRole('button', { name: 'Photo' }),
    ).not.toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', { name: 'Stored home' }),
    );

    await waitFor(() =>
      expect(values.at(-1)).toEqual({
        [Object.keys(values.at(-1) ?? {})[0] ?? '']: {
          name: 'Stored home',
          asset: 'stored-home',
        },
      }),
    );
    expect(await screen.findByLabelText(/Shape name/)).toHaveValue(
      'Stored home',
    );
  });

  it('refuses a stored image that cannot draw a node, inside the dialog', async () => {
    const user = userEvent.setup();
    const { values } = renderField();

    const dialog = await openBrowser(user);
    await user.click(
      await within(dialog).findByRole('button', { name: 'Broken drawing' }),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '"Broken drawing" has no viewBox',
    );
    expect(values).toEqual([]);
  });

  it('adds no second shape for an image that is already one', async () => {
    const user = userEvent.setup();
    const { values } = renderField({
      initial: { a: { name: 'Home', asset: 'stored-home' } },
    });

    const dialog = await openBrowser(user);
    await user.click(
      await within(dialog).findByRole('button', { name: 'Stored home' }),
    );

    expect(
      await screen.findByText(
        'This image is already the shape Home, so no new shape was added.',
      ),
    ).toBeInTheDocument();
    expect(values).toEqual([]);
    expect(screen.getAllByLabelText(/Shape name/)).toHaveLength(1);
  });

  it('renames a shape and reports a name another shape already has', async () => {
    const user = userEvent.setup();
    const { values } = renderField({
      initial: {
        a: { name: 'Home', asset: 'stored-home' },
        b: { name: 'School', asset: 'stored-broken' },
      },
    });

    const school = screen.getByDisplayValue('School');
    await user.clear(school);
    await user.type(school, 'home');

    expect(values.at(-1)?.b?.name).toBe('home');
    await waitFor(() =>
      expect(
        screen.getAllByText(/Another shape of this node type is already named/)
          .length,
      ).toBeGreaterThan(0),
    );
  });

  it('removes an unused shape, keeps its image, and will not remove one in use', async () => {
    const user = userEvent.setup();
    const { host, values } = renderField({
      initial: {
        a: { name: 'Home', asset: 'stored-home' },
        b: { name: 'School', asset: 'stored-broken' },
      },
      usage: { a: 'default' },
    });

    expect(
      screen.getByRole('button', { name: 'Remove shape Home' }),
    ).toBeDisabled();
    expect(screen.getByText(/Used as the default shape\./)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Remove shape School' }),
    );
    expect(values.at(-1)).toEqual({
      a: { name: 'Home', asset: 'stored-home' },
    });
    expect(screen.getByRole('button', { name: 'Add a shape' })).toHaveFocus();
    expect(
      await screen.findByText(
        'Removed the shape School. Its image stays in the protocol’s resources.',
      ),
    ).toBeInTheDocument();

    const listed = await host.adapter.rpcCall('ResourcesList', {
      protocolId: host.protocolId,
    });
    expect(
      listed.status === 'ok' &&
        listed.data.resources.some(({ id }) => id === 'stored-broken'),
    ).toBe(true);
  });
});
