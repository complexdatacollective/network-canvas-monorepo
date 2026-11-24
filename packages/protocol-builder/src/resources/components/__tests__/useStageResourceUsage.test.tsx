import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import ArrayField from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import AssetPickerField from '../../../fields/AssetPickerField.tsx';
import {
  RowDialog,
  RowList,
  RowListItem,
  rowId,
  rowTemplate,
  type RowListConfig,
  type RowPreviewProps,
  type RowValues,
} from '../../../form/rowDialog.tsx';
import { testTypeId } from '../../../testing/testId.ts';
import { useStageResourceUsage } from '../useStageResourceUsage.ts';
import { flushPendingWork } from './asyncControls.ts';
import { renderResourceEditor } from './renderResourceEditor.tsx';
import type { CommittedResource } from './resourceHost.ts';

const PERSON = testTypeId('person');

const STILL_IN_USE =
  'This resource is still used elsewhere on this stage, so it was not discarded.';

/** The id the in-memory host gives the first file staged in an edit. */
const STAGED_ID = 'staged-resource-1';

const ROSTER = JSON.stringify({
  nodes: [{ attributes: { name: 'Ada' } }, { attributes: { name: 'Grace' } }],
  edges: [],
});

const COMMITTED_IMAGE: CommittedResource = {
  kind: 'network',
  id: 'network-1',
  name: 'Community roster',
  source: 'roster.json',
  bytes: ROSTER,
};

/** A file as a researcher would import one. */
const rosterFile = () =>
  new File([ROSTER], 'people.json', { type: 'application/json' });

/**
 * Two side panels of a name generator, which each name a data file:
 * the one stage that holds a list of resource references of one kind.
 */
const panelsNaming = (first: string, second: string): SectionDoc => ({
  label: { 'en-US': 'People' },
  subject: { entity: 'node', type: PERSON },
  panels: [
    { id: 'panel-1', title: { 'en-US': 'One' }, dataSource: first },
    { id: 'panel-2', title: { 'en-US': 'Two' }, dataSource: second },
  ],
});

const ASSET_ITEMS: SectionDoc = panelsNaming('', '');

/** Both panels already naming one committed file, as a saved stage would. */
const SHARED_ITEMS: SectionDoc = panelsNaming(
  COMMITTED_IMAGE.id,
  COMMITTED_IMAGE.id,
);

/**
 * The identity fields an item carries alongside its picker, so the draft the
 * form produces is a real `items` entry the protocol schema recognises as an
 * asset reference.
 */
function itemIdentityFields(index: number) {
  return (
    <>
      <Field
        component={InputField}
        name={`panels[${index}].id`}
        nameMode="path"
        label={`Item ${index + 1} id`}
        labelHidden
      />
      <Field
        component={InputField}
        name={`panels[${index}].title`}
        nameMode="path"
        label={`Item ${index + 1} title`}
        labelHidden
      />
    </>
  );
}

function itemPicker(index: number, label: string) {
  return (
    <Field
      component={AssetPickerField}
      name={`panels[${index}].dataSource`}
      nameMode="path"
      label={label}
      kind="network"
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
    const { formValues, staged } = renderResourceEditor({
      stageType: 'NameGenerator',
      fields: ASSET_ITEMS,
      children: <CollapsibleItems />,
    });

    const first = await screen.findByRole('group', { name: 'First image' });
    const second = screen.getByRole('group', { name: 'Second image' });

    await user.click(
      within(first).getByRole('button', { name: 'Select a data file' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      rosterFile(),
    );
    await within(first).findByRole('button', { name: 'Discard this resource' });

    await user.click(
      within(second).getByRole('button', { name: 'Select a data file' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'people.json' }),
    );
    await act(flushPendingWork);

    return { first, formValues, staged };
  }

  it('counts a reference a collapsed section is still holding', async () => {
    const user = userEvent.setup();
    renderResourceEditor({
      resources: [COMMITTED_IMAGE],
      stageType: 'NameGenerator',
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
    const { first, staged } = await twoItemsSharingAnImage(user);

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
    expect(await staged()).not.toEqual([]);
  });

  it('discards one the collapsed section does not name', async () => {
    const user = userEvent.setup();
    const { staged } = renderResourceEditor({
      stageType: 'NameGenerator',
      fields: ASSET_ITEMS,
      children: <CollapsibleItems />,
    });

    const first = await screen.findByRole('group', { name: 'First image' });
    await user.click(
      within(first).getByRole('button', { name: 'Select a data file' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      rosterFile(),
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

    await waitFor(async () => expect(await staged()).toEqual([]));
    expect(within(first).queryByRole('alert')).toBeNull();
  });
});

/** One block of the page, edited in a dialog of its own. */
function BlockEditor() {
  return (
    <>
      <Field
        name="dataSource"
        label="Block image"
        component={AssetPickerField}
        kind="network"
      />
    </>
  );
}

function BlockPreview({ item }: RowPreviewProps) {
  return (
    <span>
      {typeof item.dataSource === 'string' ? item.dataSource : 'No file'}
    </span>
  );
}

const BLOCKS: RowListConfig = {
  Preview: BlockPreview,
  Editor: BlockEditor,
  addTitle: { id: 'test.addBlock', defaultMessage: 'Add a block' },
  editTitle: { id: 'test.editBlock', defaultMessage: 'Edit a block' },
  formId: 'block-editor',
  name: 'panels',
};

function BlockList() {
  return (
    <RowList config={BLOCKS}>
      <Field<typeof ArrayField<RowValues>>
        name="panels"
        label="Blocks"
        component={ArrayField}
        getId={rowId}
        addButtonLabel="Add a block"
        itemLabel={{ id: 'test.blockNoun', defaultMessage: 'block' }}
        itemComponent={RowListItem}
        editorComponent={RowDialog}
        itemTemplate={rowTemplate()}
      />
    </RowList>
  );
}

/**
 * A row a dialog is still editing is not in the stage form — that is what a row
 * dialog is — so a picker inside one is asking about a stage that does not hold
 * its own answer. Counted that way, the single reference a SIBLING row holds
 * reads as "only this field uses it", and the discard deletes bytes the saved
 * stage goes on to name.
 */
describe('counting the row a dialog is still editing', () => {
  it('refuses a discard the sibling row would be left dangling by', async () => {
    const user = userEvent.setup();
    const { staged } = renderResourceEditor({
      stageType: 'NameGenerator',
      fields: { ...panelsNaming('', ''), panels: [] },
      children: <BlockList />,
    });

    // The first block imports the file and is saved, so the stage form holds
    // the only committed reference to it.
    await user.click(
      await screen.findByRole('button', { name: 'Add a block' }),
    );
    const first = within(await screen.findByRole('dialog'));
    await user.click(first.getByRole('button', { name: 'Select a data file' }));
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      rosterFile(),
    );
    await first.findByRole('button', { name: 'Discard this resource' });
    await user.click(first.getByRole('button', { name: 'Add' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    // The second block points at the same import, in a dialog that is still
    // open: nothing it holds has reached the stage.
    await user.click(screen.getByRole('button', { name: 'Add a block' }));
    const second = within(await screen.findByRole('dialog'));
    await user.click(
      second.getByRole('button', { name: 'Select a data file' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'people.json' }),
    );
    await act(flushPendingWork);

    await user.click(
      second.getByRole('button', { name: 'Discard this resource' }),
    );
    await act(flushPendingWork);

    expect(second.getByRole('alert')).toHaveTextContent(STILL_IN_USE);
    expect(await staged()).not.toEqual([]);
  });
});
