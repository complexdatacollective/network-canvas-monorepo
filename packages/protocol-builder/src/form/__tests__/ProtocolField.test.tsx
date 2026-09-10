import { screen, waitFor } from '@testing-library/react';
import { type ComponentType, type ReactNode, useState } from 'react';
import { describe, expect, it } from 'vitest';

import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import BuilderSection from '../../sections/BuilderSection.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import ProtocolField from '../ProtocolField.tsx';

const renderField = (fields: SectionDoc, children: ReactNode) =>
  renderStageEditor({
    stage: { type: 'Information', fields },
    sections: <BuilderSection title="Introduction">{children}</BuilderSection>,
  });

describe('ProtocolField', () => {
  it('seeds a field from the path it is really registered under', async () => {
    renderField(
      { label: 'Welcome', introductionPanel: { title: 'Before we start' } },
      <FieldNamespace prefix="introductionPanel">
        <ProtocolField
          name="title"
          label="Panel title"
          component={InputField}
        />
      </FieldNamespace>,
    );

    // The namespace is part of where this field lives. Reading the opened
    // document from the root instead would start the control blank and then
    // save that blank over what the author wrote.
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Panel title' })).toHaveValue(
        'Before we start',
      ),
    );
  });

  it('treats an opaque name as one key rather than a route', async () => {
    renderField(
      {
        label: 'Welcome',
        // A protocol-authored variable id, which may contain a dot and is not
        // a path into anything.
        attributes: { 'person.age': 'seeded' },
      },
      <FieldNamespace prefix="attributes">
        <ProtocolField
          name="person.age"
          nameMode="opaque"
          label="Age"
          component={InputField}
        />
      </FieldNamespace>,
    );

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Age' })).toHaveValue(
        'seeded',
      ),
    );
  });
});

/** Mounts and unmounts its children on demand — a group that can be folded away again. */
function Collapsible({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen((current) => !current)}>
        {open ? `Hide ${label}` : `Show ${label}`}
      </button>
      {open && children}
    </>
  );
}

/** Mounts its children only once asked to — a group of advanced options. */
function Disclosure({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && children}
    </>
  );
}

/** A control that shows whatever value it is handed, of any shape. */
const ValueOutput = (({ value }: Readonly<{ value?: unknown }>) => (
  <output>{JSON.stringify(value ?? null)}</output>
)) as ComponentType<Record<string, unknown>>;

/** A control that writes one fixed value when pressed. */
const SetBounds = (({
  onChange,
}: Readonly<{ onChange?: (value: unknown) => void }>) => (
  <button type="button" onClick={() => onChange?.({ min: 'five' })}>
    Set bounds
  </button>
)) as ComponentType<Record<string, unknown>>;

/**
 * Fields may overlap: one registered at a container, others at paths inside
 * it. A leaf mounting beneath both starts from the document the editor was
 * opened with, which is the one account of what a path holds — so an edit the
 * form has PARKED cannot come back through it.
 *
 * That matters because a parked value under a mounted container is not a
 * value the save will write: the form assembles its values from the fields
 * that are mounted, and drops a parked write a mounted field overlaps. A leaf
 * seeded from the parked edit instead would show the researcher something the
 * next save is about to throw away, and put that edit back over the container
 * as soon as they touched it.
 */
describe('a field mounting beneath overlapping fields', () => {
  it('starts from the opened document rather than a parked edit beneath a mounted container', async () => {
    const harness = renderField(
      { label: 'Welcome', settings: { bounds: { min: 'one' } } },
      <>
        <ProtocolField
          name="settings"
          label="Settings"
          component={ValueOutput}
        />
        <Collapsible label="bounds">
          <ProtocolField
            name="settings.bounds"
            label="Bounds"
            component={SetBounds}
          />
        </Collapsible>
        <Disclosure label="Show minimum">
          <ProtocolField
            name="settings.bounds.min"
            label="Minimum"
            component={InputField}
          />
        </Disclosure>
      </>,
    );

    // An edit made in the bounds control, then folded away: parked, with the
    // settings container still mounted above it.
    await harness.user.click(
      screen.getByRole('button', { name: 'Show bounds' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Set bounds' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Hide bounds' }),
    );

    // The opened document's value, not the parked one.
    await harness.user.click(
      screen.getByRole('button', { name: 'Show minimum' }),
    );
    expect(await screen.findByRole('textbox', { name: 'Minimum' })).toHaveValue(
      'one',
    );
  });
});

/** A control that replaces the whole list it is registered at. */
const SetItems = (({
  onChange,
}: Readonly<{ onChange?: (value: unknown) => void }>) => (
  <button
    type="button"
    onClick={() =>
      onChange?.([{ id: 'item-1', type: 'text', content: 'Rewritten' }])
    }
  >
    Rewrite the items
  </button>
)) as ComponentType<Record<string, unknown>>;

const SEEDED_ITEMS: SectionDoc = {
  label: 'Welcome',
  title: 'Welcome to the study',
  items: [{ id: 'item-1', type: 'text', content: 'As it was seeded' }],
};

/**
 * The other half of the overlap: a container that is still MOUNTED, holding an
 * edit the researcher has made and no save has taken yet.
 *
 * The opened document is the account of what a path held when the stage was
 * handed over, and the live form is the account of the edit since. A leaf
 * mounting beneath a live container and seeding from the opened document shows
 * the value the researcher has just replaced — and, because a submit replays
 * deeper fields after the containers above them, writes it back over their
 * edit on the very next save.
 */
describe('a field mounting beneath a container holding an unsaved edit', () => {
  const overlappingItems = (
    <>
      <ProtocolField name="items" label="Page items" component={SetItems} />
      <Disclosure label="Show the first item">
        <ProtocolField
          name="items[0].content"
          nameMode="path"
          label="First item"
          component={InputField}
        />
      </Disclosure>
    </>
  );

  it('shows the edit rather than the value it replaced', async () => {
    const harness = renderStageEditor({
      stage: { type: 'Information', fields: SEEDED_ITEMS },
      sections: overlappingItems,
    });

    await harness.user.click(
      await harness.findByRole('button', { name: 'Rewrite the items' }),
    );
    await harness.user.click(
      harness.getByRole('button', { name: 'Show the first item' }),
    );

    expect(
      await harness.findByRole('textbox', { name: 'First item' }),
    ).toHaveValue('Rewritten');
  });

  it('does not write the replaced draft back over it on save', async () => {
    const harness = renderStageEditor({
      stage: { type: 'Information', fields: SEEDED_ITEMS },
      sections: overlappingItems,
    });

    await harness.user.click(
      await harness.findByRole('button', { name: 'Rewrite the items' }),
    );
    await harness.user.click(
      harness.getByRole('button', { name: 'Show the first item' }),
    );
    await harness.findByRole('textbox', { name: 'First item' });

    const request = await harness.submit();

    expect(request?.stageDocument.items).toEqual([
      { id: 'item-1', type: 'text', content: 'Rewritten' },
    ]);
  });
});
