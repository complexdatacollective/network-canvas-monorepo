import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Effect } from 'effect';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { PromotionFailed } from '@codaco/protocol-builder-core/contract/errors';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { CodebookSubject } from '../../protocol-context.ts';
import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import {
  committedManifest,
  createResourceHost,
  stagedResources,
  resourceProcedures,
} from '../../resources/components/__tests__/resourceHost.ts';
import type {
  HandlerOverrides,
  InMemoryHost,
} from '../../testing/host/createInMemoryHost.ts';
import { testTypeId } from '../../testing/testId.ts';
import CodebookEntityEditor from '../components/CodebookEntityEditor.tsx';
import { useCodebookSectionWrite } from '../writes.ts';

const PERSON_TYPE = testTypeId('person');

const PERSON = sectionId({ kind: 'codebookNode', typeId: PERSON_TYPE });
const SUBJECT: CodebookSubject = { entity: 'node', type: PERSON_TYPE };

const HOME_SVG =
  '<svg viewBox="0 0 100 100"><path d="M10 50 L50 10 L90 50 V90 H10 Z"/></svg>';

function PersonEditor({ document }: Readonly<{ document: SectionDoc }>) {
  const writeSection = useCodebookSectionWrite();
  const [open, setOpen] = useState(true);
  if (!open) return <p>Editor closed</p>;
  return (
    <CodebookEntityEditor
      mode="update"
      sessionKey="person"
      subject={SUBJECT}
      initialDraft={document}
      authoritativeDocument={document}
      existingEntityNames={[]}
      onSubmit={(next, promote) => writeSection(SUBJECT, () => next, promote)}
      onApplied={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    />
  );
}

/** Renders the editor, noting the edit it stages imported files into. */
const renderEditor = (host: InMemoryHost, overrides: HandlerOverrides = {}) => {
  const edits: string[] = [];
  const adapter = host.adapterWith({
    ...resourceProcedures({
      stage: (input) => {
        edits.push(input.editId);
        return host.adapter.rpcCall('ResourcesStage', input);
      },
    }),
    ...overrides,
  });
  render(
    <DialogProvider>
      <ProtocolBuilder adapter={adapter} protocolId={host.protocolId}>
        <PersonEditor
          document={{
            ...host.store.read(PERSON).document,
            icon: 'add-a-person',
          }}
        />
      </ProtocolBuilder>
    </DialogProvider>,
  );
  return { edits };
};

const importShape = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Add a shape' }));
  const dialog = await screen.findByRole('dialog', {
    name: 'Choose a node shape',
  });
  await user.upload(
    within(dialog).getByLabelText('Choose a file from your computer'),
    new File([HOME_SVG], 'home.svg', { type: 'image/svg+xml' }),
  );
  await screen.findByDisplayValue('home');
};

const shapeAssets = (host: InMemoryHost): unknown[] => {
  const shapes: unknown = host.store.read(PERSON).document.customShapes;
  if (typeof shapes !== 'object' || shapes === null) return [];
  return Object.values(shapes).map((shape: unknown) =>
    typeof shape === 'object' && shape !== null && 'asset' in shape
      ? shape.asset
      : undefined,
  );
};

const refusedPromotion = (
  naming: 'the image' | 'nothing',
): HandlerOverrides => ({
  Submit: (submitted) => {
    const resourceId =
      naming === 'the image' ? submitted.promote?.resourceIds[0] : undefined;
    return Effect.fail(
      new PromotionFailed({
        sectionId: submitted.sectionId,
        failure: {
          reason: 'promotion-failed',
          message: 'the staged file is gone',
          retryable: false,
          ...(resourceId === undefined ? {} : { resourceId }),
        },
      }),
    );
  },
});

describe('a shape image imported in the node type editor', () => {
  it('is committed with the node type it was imported for', async () => {
    const user = userEvent.setup();
    const host = createResourceHost();
    const { edits } = renderEditor(host);

    await importShape(user);
    await user.click(screen.getByRole('button', { name: 'Save entity' }));
    await screen.findByText('Editor closed');

    const [asset] = shapeAssets(host);
    expect(typeof asset).toBe('string');
    expect(Object.keys(committedManifest(host))).toContain(asset);
    expect(
      await stagedResources(host.adapter, host.protocolId, edits[0] ?? ''),
    ).toEqual([]);
  });

  it('is let go when the editor is cancelled', async () => {
    const user = userEvent.setup();
    const host = createResourceHost();
    const { edits } = renderEditor(host);

    await importShape(user);
    const editId = edits[0] ?? '';
    expect(
      await stagedResources(host.adapter, host.protocolId, editId),
    ).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await screen.findByText('Editor closed');

    await waitFor(async () =>
      expect(
        await stagedResources(host.adapter, host.protocolId, editId),
      ).toEqual([]),
    );
    expect(committedManifest(host)).toEqual({});
    expect(shapeAssets(host)).toEqual([]);
  });

  it('keeps the draft open and names the shape whose image cannot be committed', async () => {
    const user = userEvent.setup();
    const host = createResourceHost();
    renderEditor(host, refusedPromotion('the image'));

    await importShape(user);
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    expect(
      await screen.findByText(
        'The image for the shape "home" is no longer available. Remove this shape and add it again.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('home')).toBeInTheDocument();
    expect(shapeAssets(host)).toEqual([]);
  });

  it('says an image is unavailable when the host does not say which', async () => {
    const user = userEvent.setup();
    const host = createResourceHost();
    renderEditor(host, refusedPromotion('nothing'));

    await importShape(user);
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    expect(
      await screen.findByText(
        'An image added to this node type is no longer available. Remove the shape that uses it, then add the shape again.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('home')).toBeInTheDocument();
  });

  it('closes without asking when nothing was changed', async () => {
    const user = userEvent.setup();
    renderEditor(createResourceHost());

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await screen.findByText('Editor closed');
  });

  it('keeps the draft when the researcher chooses to keep editing', async () => {
    const user = userEvent.setup();
    renderEditor(createResourceHost());

    await importShape(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(
      await screen.findByRole('button', { name: 'Keep editing' }),
    );

    expect(screen.getByDisplayValue('home')).toBeInTheDocument();
    expect(screen.queryByText('Editor closed')).not.toBeInTheDocument();
  });
});
