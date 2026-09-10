import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import ProtocolField from '../../../form/ProtocolField.tsx';
import StageEditorShell from '../../../form/StageEditorShell.tsx';
import { ProtocolBuilder } from '../../../ProtocolBuilder.tsx';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import type { StageEditorComponent } from '../../../stage-editor-contract.ts';
import StageEditor from '../../../StageEditor.tsx';
import { createInMemoryHost } from '../../../testing/host/createInMemoryHost.ts';
import { sectionsFromProtocol } from '../../../testing/host/sectionsFromProtocol.ts';
import {
  useResourceClient,
  useStagedResources,
  type ResourceClient,
} from '../../client.tsx';
import type { ResourceDescriptor } from '../../types.ts';
import ResourcePickerControl from '../ResourcePickerControl.tsx';
import { renderResourceEditor } from './renderResourceEditor.tsx';
import type { CommittedResource } from './resourceHost.ts';

const NEIGHBOURHOOD: CommittedResource = {
  id: 'image-1',
  kind: 'image',
  name: 'Neighbourhood photo',
  source: 'neighbourhood.png',
  bytes: 'png-bytes',
};

function picker(name: string, label: string) {
  return (
    <ProtocolField
      component={ResourcePickerControl}
      name={name}
      label={label}
      kind="image"
    />
  );
}

/**
 * An imported file is staged for the life of the edit: the host holds it, says
 * it is staged rather than saved, and a field may point at it — all before
 * anything is saved.
 *
 * The two halves are what make this a rule rather than an implementation note.
 * Without the staging, a researcher could not see or preview what they had just
 * imported until they had saved the stage; without the reference being allowed
 * before the save, they could not use it in the stage they are in the middle of
 * writing. Promoting it with the save and dropping it with the cancel is the
 * other half of the rule, and belongs with the edit rather than here.
 */
it('lists an imported file as staged, and lets a second field reference it, before anything is saved', async () => {
  const user = userEvent.setup();
  const { fieldValue, manifest, staged } = renderResourceEditor({
    resources: [NEIGHBOURHOOD],
    children: (
      <>
        {picker('backgroundImage', 'Background image')}
        {picker('secondImage', 'Second image')}
      </>
    ),
  });

  const first = await screen.findByRole('group', { name: 'Background image' });
  await user.click(
    within(first).getByRole('button', { name: 'Select an image' }),
  );
  await user.upload(
    await screen.findByLabelText('Choose a file from your computer'),
    new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
  );

  await waitFor(() =>
    expect(fieldValue('backgroundImage')).toBe('staged-resource-1'),
  );

  // The host is holding it, and says which of the two kinds of resource it is:
  // a researcher looking at their own import is told it is not saved yet.
  expect(await staged()).toEqual([
    expect.objectContaining({ id: 'staged-resource-1', status: 'staged' }),
  ]);
  expect(await screen.findByText('Imported, not yet saved')).toBeVisible();

  // And the protocol itself is unchanged: the manifest still holds exactly what
  // it held when the stage was opened.
  expect(Object.keys(manifest())).toEqual(['image-1']);

  // Referenceable, which is what staging is for: a second field on the stage
  // being written can point at the import without anything having been saved.
  const second = screen.getByRole('group', { name: 'Second image' });
  await user.click(
    within(second).getByRole('button', { name: 'Select an image' }),
  );
  const library = await screen.findByRole('list', {
    name: 'Resources in this protocol',
  });
  expect(
    within(library)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Neighbourhood photo', 'skyline.png']);
  await user.click(
    within(library).getByRole('button', { name: 'skyline.png' }),
  );

  await waitFor(() =>
    expect(fieldValue('secondImage')).toBe('staged-resource-1'),
  );
  expect(Object.keys(manifest())).toEqual(['image-1']);
});

/**
 * Every control that calls the host does so from an effect, and an effect is
 * keyed on what it calls. So the client has to be the same object from one end
 * of the edit to the other: rebuilt whenever anything was staged, a preview
 * would resolve itself again, an inspection re-read its file, and a library
 * re-list the protocol, each time any field on the stage imported anything.
 *
 * What the edit has staged is a separate value, so a control that renders the
 * list still follows it.
 */
it('keeps one resource client across a staging change', async () => {
  const user = userEvent.setup();
  const { fieldValue, resourceClient, staged } = renderResourceEditor({
    resources: [NEIGHBOURHOOD],
    children: picker('backgroundImage', 'Background image'),
  });

  const first = await screen.findByRole('group', { name: 'Background image' });
  const before = resourceClient();

  await user.click(
    within(first).getByRole('button', { name: 'Select an image' }),
  );
  await user.upload(
    await screen.findByLabelText('Choose a file from your computer'),
    new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
  );
  await waitFor(() =>
    expect(fieldValue('backgroundImage')).toBe('staged-resource-1'),
  );

  expect(resourceClient()).toBe(before);
  // And the staging itself did happen, so the identity above is not the
  // identity of a client nothing ever asked to stage anything.
  expect(await staged()).toEqual([
    expect.objectContaining({ id: 'staged-resource-1', status: 'staged' }),
  ]);
});

/**
 * An edit lasts as long as the researcher is on one stage, and no longer.
 *
 * A host does not unmount the editor to open another stage: Studio selects
 * another screen in its outline, which changes `target` on the element it
 * already has. What the researcher imported into the first stage and never
 * saved belongs to that stage's edit, so the move has to end it — otherwise
 * the second stage's save promotes those files into the protocol's manifest,
 * where nothing refers to them and nothing will take them out again.
 */
const FIXTURE: Record<string, unknown> = allInterfaces;
const FIRST_STAGE = sectionId({ kind: 'stage', stageId: 'information-1' });
const SECOND_STAGE = sectionId({ kind: 'stage', stageId: 'ego-form-1' });
const ASSETS = sectionId({ kind: 'assets' });

const openEdit: {
  client: ResourceClient | undefined;
  editId: string | undefined;
  staged: readonly ResourceDescriptor[];
} = { client: undefined, editId: undefined, staged: [] };

function EditProbe() {
  const staged = useStagedResources();
  openEdit.client = useResourceClient();
  openEdit.editId = staged.editId;
  openEdit.staged = staged.staged;
  return null;
}

const NameAndProbe: StageEditorComponent = ({ actions }) => (
  <StageEditorShell {...(actions === undefined ? {} : { actions })}>
    <BuilderSection title="Stage name">
      <ProtocolField name="label" label="Stage name" component={InputField} />
    </BuilderSection>
    <EditProbe />
  </StageEditorShell>
);

it('ends the edit when the host opens another stage in the same editor', async () => {
  const host = createInMemoryHost({ sections: sectionsFromProtocol(FIXTURE) });
  const registry = {
    Information: NameAndProbe as StageEditorComponent<'Information'>,
    EgoForm: NameAndProbe as StageEditorComponent<'EgoForm'>,
  };
  const editorOn = (stage: ProtocolSectionId) => (
    <DialogProvider>
      <ProtocolBuilder client={host.client} protocolId={host.protocolId}>
        <StageEditor
          target={{ sectionId: stage }}
          registry={registry}
          actions={({ formId }) => (
            <SubmitButton form={formId}>Save screen</SubmitButton>
          )}
        />
      </ProtocolBuilder>
    </DialogProvider>
  );

  const view = render(editorOn(FIRST_STAGE));
  await screen.findByRole('textbox', { name: 'Stage name' });
  await waitFor(() => expect(openEdit.client).toBeDefined());
  const firstEdit = openEdit.editId;

  const imported = await openEdit.client?.stageUpload({
    requestId: 'import-1',
    kind: 'image',
    name: 'Portrait',
    source: 'portrait.png',
    contentType: 'image/png',
    bytes: new Uint8Array([1, 2, 3]),
  });
  expect(imported?.status).toBe('ok');
  await waitFor(() => expect(openEdit.staged).toHaveLength(1));
  const manifestBefore = Object.keys(host.store.read(ASSETS).document);

  // The researcher opens another screen without saving the first.
  await act(async () => {
    view.rerender(editorOn(SECOND_STAGE));
  });
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Stage name' })).toBeEnabled(),
  );

  expect(openEdit.editId).not.toBe(firstEdit);
  expect(openEdit.staged).toEqual([]);

  // And the second screen's save commits nothing the first screen imported.
  const user = userEvent.setup();
  const field = screen.getByRole('textbox', { name: 'Stage name' });
  await user.clear(field);
  await user.type(field, 'The second screen, renamed');
  await user.click(screen.getByRole('button', { name: 'Save screen' }));
  await waitFor(() =>
    expect(host.store.read(SECOND_STAGE).document.label).toBe(
      'The second screen, renamed',
    ),
  );
  expect(Object.keys(host.store.read(ASSETS).document)).toEqual(manifestBefore);
});
