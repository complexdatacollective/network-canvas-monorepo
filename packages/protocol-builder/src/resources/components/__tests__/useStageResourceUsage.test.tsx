import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import ProtocolField from '../../../form/ProtocolField.tsx';
import {
  InMemoryResourceGateway,
  type InMemoryResourceSeed,
} from '../../InMemoryResourceGateway.ts';
import ResourcePickerControl from '../ResourcePickerControl.tsx';
import { useStageResourceUsage } from '../useStageResourceUsage.ts';
import { flushPendingWork } from './asyncControls.ts';
import { renderResourceEditor } from './renderResourceEditor.tsx';

const STILL_IN_USE =
  'This resource is still used elsewhere on this stage, so it was not discarded.';

/** The id the in-memory host gives the first file staged in a session. */
const STAGED_ID = 'staged-resource-1';

const COMMITTED_IMAGE: InMemoryResourceSeed = {
  kind: 'image',
  id: 'image-1',
  name: 'Neighbourhood photo',
  source: 'neighbourhood.png',
  contentType: 'image/png',
  bytes: new TextEncoder().encode('png-bytes'),
};

const ASSET_ITEMS: SectionDoc = {
  title: 'Welcome',
  items: [
    { id: 'item-1', type: 'asset', content: '' },
    { id: 'item-2', type: 'asset', content: '' },
  ],
};

/** Both items already naming one committed image, as a saved stage would. */
const SHARED_ITEMS: SectionDoc = {
  title: 'Welcome',
  items: [
    { id: 'item-1', type: 'asset', content: COMMITTED_IMAGE.id },
    { id: 'item-2', type: 'asset', content: COMMITTED_IMAGE.id },
  ],
};

/**
 * The identity fields an item carries alongside its picker, so the draft the
 * form produces is a real `items` entry the protocol schema recognises as an
 * asset reference.
 */
function itemIdentityFields(index: number) {
  return (
    <>
      <ProtocolField
        component={InputField}
        name={`items[${index}].id`}
        nameMode="path"
        label={`Item ${index + 1} id`}
        labelHidden
      />
      <ProtocolField
        component={InputField}
        name={`items[${index}].type`}
        nameMode="path"
        label={`Item ${index + 1} type`}
        labelHidden
      />
    </>
  );
}

function itemPicker(index: number, label: string) {
  return (
    <ProtocolField
      component={ResourcePickerControl}
      name={`items[${index}].content`}
      nameMode="path"
      label={label}
      kind="image"
    />
  );
}

/**
 * Reads the count where the picker reads it — inside a handler, at the moment
 * the researcher acts — rather than during a render, which would be a reading
 * taken before the unmount that parks the value it is about.
 */
function UsageProbe({ resourceId }: Readonly<{ resourceId: string }>) {
  const usage = useStageResourceUsage();
  // Numbered, so a second reading that never happened cannot be mistaken for
  // one that happened and agreed with the first.
  const [reading, setReading] =
    useState<Readonly<{ uses: number; read: number }>>();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          setReading((previous) => ({
            uses: usage(resourceId),
            read: (previous?.read ?? 0) + 1,
          }))
        }
      >
        Count uses
      </button>
      {reading !== undefined && (
        <p>{`Reading ${reading.read}: used in ${reading.uses} places`}</p>
      )}
    </>
  );
}

/**
 * A stage whose second item sits inside a group the researcher can collapse.
 * Collapsing unmounts the picker, and the form parks the value it was holding
 * rather than throwing it away — which is what the submit writes back.
 */
function CollapsibleItems({
  counting = STAGED_ID,
}: Readonly<{ counting?: string }>) {
  const [open, setOpen] = useState(true);
  return (
    <>
      {itemIdentityFields(0)}
      {itemPicker(0, 'First image')}
      <UsageProbe resourceId={counting} />
      <button type="button" onClick={() => setOpen(false)}>
        Hide the advanced options
      </button>
      {open && (
        <>
          {itemIdentityFields(1)}
          {itemPicker(1, 'Second image')}
        </>
      )}
    </>
  );
}

/**
 * A field that is not on screen is still a field the stage has. Hiding one
 * says nothing about its value: the submit writes the parked value back, so a
 * resource a hidden field names is a resource the saved protocol references.
 * Anything asking "is this still in use?" has to see it too, or a picker the
 * researcher can see is allowed to delete bytes the very next save will name.
 */
describe('counting the resource references a stage holds', () => {
  /** Both items pointed at one imported image, with the second then hidden. */
  async function twoItemsSharingAnImage(
    user: ReturnType<typeof userEvent.setup>,
  ) {
    const gateway = new InMemoryResourceGateway();
    const { formValues } = renderResourceEditor({
      gateway,
      fields: ASSET_ITEMS,
      children: <CollapsibleItems />,
    });

    const first = await screen.findByRole('group', { name: 'First image' });
    const second = screen.getByRole('group', { name: 'Second image' });

    await user.click(
      within(first).getByRole('button', { name: 'Select an image' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
    );
    await within(first).findByRole('button', { name: 'Discard this resource' });

    await user.click(
      within(second).getByRole('button', { name: 'Select an image' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'skyline.png' }),
    );
    await act(flushPendingWork);

    return { first, formValues, gateway };
  }

  it('counts a reference a collapsed section is still holding', async () => {
    const user = userEvent.setup();
    renderResourceEditor({
      gateway: new InMemoryResourceGateway({ committed: [COMMITTED_IMAGE] }),
      fields: SHARED_ITEMS,
      children: <CollapsibleItems counting={COMMITTED_IMAGE.id} />,
    });

    await user.click(await screen.findByRole('button', { name: 'Count uses' }));
    expect(
      await screen.findByText('Reading 1: used in 2 places'),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Hide the advanced options' }),
    );
    await user.click(screen.getByRole('button', { name: 'Count uses' }));

    // Still two. The form is only showing one of them, but the submit writes
    // the parked value back, so both are references the saved stage has.
    expect(
      await screen.findByText('Reading 2: used in 2 places'),
    ).toBeVisible();
  });

  it('refuses a discard a collapsed section would be left dangling by', async () => {
    const user = userEvent.setup();
    const { first, gateway } = await twoItemsSharingAnImage(user);

    await user.click(
      screen.getByRole('button', { name: 'Hide the advanced options' }),
    );
    await user.click(
      within(first).getByRole('button', { name: 'Discard this resource' }),
    );
    await act(flushPendingWork);

    // The visible field is the only one the researcher can see naming it, and
    // the discard here would delete bytes the hidden field goes on to name at
    // save — a reference the protocol cannot resolve, from an action the
    // researcher was told had worked.
    expect(within(first).getByRole('alert')).toHaveTextContent(STILL_IN_USE);
    expect(gateway.getStagingResidue()).not.toEqual([]);
  });

  it('discards one the collapsed section does not name', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    renderResourceEditor({
      gateway,
      fields: ASSET_ITEMS,
      children: <CollapsibleItems />,
    });

    const first = await screen.findByRole('group', { name: 'First image' });
    await user.click(
      within(first).getByRole('button', { name: 'Select an image' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
    );
    await within(first).findByRole('button', { name: 'Discard this resource' });

    // The second item was never pointed at anything, so hiding it parks an
    // empty value: counting the hidden field must not turn every collapsed
    // section into a reason to refuse.
    await user.click(
      screen.getByRole('button', { name: 'Hide the advanced options' }),
    );
    await user.click(
      within(first).getByRole('button', { name: 'Discard this resource' }),
    );

    await waitFor(() => expect(gateway.getStagingResidue()).toEqual([]));
    expect(within(first).queryByRole('alert')).toBeNull();
  });
});
