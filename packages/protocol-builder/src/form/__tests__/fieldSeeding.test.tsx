import { screen, waitFor } from '@testing-library/react';
import { type ComponentType, type ReactNode, useState } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { LocalizedInputField } from '../../fields/LocalizedStringField.tsx';
import BuilderSection from '../../sections/BuilderSection.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { testId } from '../../testing/testId.ts';

const en = (text: string) => ({ 'en-US': text });

const renderField = (fields: SectionDoc, children: ReactNode) =>
  renderStageEditor({
    stage: {
      id: testId('field-seeding-stage'),
      type: 'Information',
      fields,
    },
    sections: (
      <BuilderSection sectionKey="form-fields" title="Form">
        {children}
      </BuilderSection>
    ),
  });

describe('a field seeded from the document the form was handed', () => {
  it('seeds a field from the path it is really registered under', async () => {
    renderStageEditor({
      stage: {
        type: 'EgoForm',
        fields: {
          label: en('About you'),
          form: { title: en('Before we start') },
        },
      },
      sections: (
        <BuilderSection sectionKey="form-fields" title="Form">
          <FieldNamespace prefix="form">
            <Field
              name="title"
              label="Form title"
              component={LocalizedInputField}
            />
          </FieldNamespace>
        </BuilderSection>
      ),
    });

    // The namespace is part of where this field lives. Reading the opened
    // document from the root instead would start the control blank and then
    // save that blank over what the author wrote.
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Form title' })).toHaveValue(
        'Before we start',
      ),
    );
  });

  it('treats an opaque name as one key rather than a route', async () => {
    renderField(
      {
        label: en('Welcome'),
        // A protocol-authored variable id, which may contain a dot and is not
        // a path into anything.
        attributes: { 'person.age': 'seeded' },
      },
      <FieldNamespace prefix="attributes">
        <Field
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
      { label: en('Welcome'), settings: { bounds: { min: 'one' } } },
      <>
        <Field name="settings" label="Settings" component={ValueOutput} />
        <Collapsible label="bounds">
          <Field name="settings.bounds" label="Bounds" component={SetBounds} />
        </Collapsible>
        <Disclosure label="Show minimum">
          <Field
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

/**
 * A skip logic holding one rule, written the way a stage holds it. The rule
 * names an ego attribute the fixture protocol's codebook really has, so a
 * stage holding it is one the protocol would take.
 */
const skipLogicOf = (value: string) => ({
  action: 'SHOW',
  filter: {
    rules: [
      {
        type: 'ego',
        id: testId('rule-1'),
        options: {
          operator: 'CONTAINS',
          attribute: '3377af3f-3c79-41da-9b0b-6570fb519b93',
          value,
        },
      },
    ],
  },
});

/** A control that replaces the whole skip logic it is registered at. */
const SetItems = (({
  onChange,
}: Readonly<{ onChange?: (value: unknown) => void }>) => (
  <button type="button" onClick={() => onChange?.(skipLogicOf('Rewritten'))}>
    Rewrite the rule
  </button>
)) as ComponentType<Record<string, unknown>>;

const SEEDED_ITEMS: SectionDoc = {
  label: en('Welcome'),
  content: en('Welcome to the study'),
  skipLogic: skipLogicOf('As it was seeded'),
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
      <Field name="skipLogic" label="Skip logic" component={SetItems} />
      <Disclosure label="Show the rule's value">
        <Field
          name="skipLogic.filter.rules[0].options.value"
          nameMode="path"
          label="Rule value"
          component={InputField}
        />
      </Disclosure>
    </>
  );

  it('shows the edit rather than the value it replaced', async () => {
    const harness = renderStageEditor({
      stage: {
        id: testId('field-seeding-stage'),
        type: 'Information',
        fields: SEEDED_ITEMS,
      },
      sections: overlappingItems,
    });

    await harness.user.click(
      await harness.findByRole('button', { name: 'Rewrite the rule' }),
    );
    await harness.user.click(
      harness.getByRole('button', { name: "Show the rule's value" }),
    );

    expect(
      await harness.findByRole('textbox', { name: 'Rule value' }),
    ).toHaveValue('Rewritten');
  });

  it('does not write the replaced draft back over it on save', async () => {
    const harness = renderStageEditor({
      stage: {
        id: testId('field-seeding-stage'),
        type: 'Information',
        fields: SEEDED_ITEMS,
      },
      sections: overlappingItems,
    });

    await harness.user.click(
      await harness.findByRole('button', { name: 'Rewrite the rule' }),
    );
    await harness.user.click(
      harness.getByRole('button', { name: "Show the rule's value" }),
    );
    await harness.findByRole('textbox', { name: 'Rule value' });

    const request = await harness.submit();

    expect(request?.stageDocument.skipLogic).toEqual(skipLogicOf('Rewritten'));
  });
});
