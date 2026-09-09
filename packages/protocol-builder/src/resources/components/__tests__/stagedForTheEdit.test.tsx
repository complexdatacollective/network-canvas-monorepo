import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';

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
    <Field
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
