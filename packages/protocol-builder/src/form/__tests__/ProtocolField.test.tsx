import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentType, type ReactNode, useState } from 'react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../controller.ts';
import BuilderSection, {
  type SectionCapability,
} from '../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import MultiSelect, {
  makeMultiSelectValidation,
  type OptionGetter,
  type PropertyField,
} from '../arrayFields/MultiSelect.tsx';
import ProtocolArrayField from '../ProtocolArrayField.tsx';
import ProtocolField from '../ProtocolField.tsx';
import StageEditorShell from '../StageEditorShell.tsx';
import { useClearStageValue, useStageValue } from '../stageFormHooks.ts';

function createSession(fields: SectionDoc) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Protocol field test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

function renderEditor(
  session: ProtocolBuilderSessionStore,
  children: ReactNode,
) {
  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell controller={controller}>{children}</StageEditorShell>
    );
  }

  return render(
    <DialogProvider>
      <Host />
    </DialogProvider>,
  );
}

function renderField(
  session: ProtocolBuilderSessionStore,
  children: React.ReactNode,
) {
  return renderEditor(
    session,
    <BuilderSection title="Introduction">{children}</BuilderSection>,
  );
}

describe('ProtocolField', () => {
  it('seeds a field from the path it is really registered under', async () => {
    renderField(
      createSession({
        label: 'Welcome',
        introductionPanel: { title: 'Before we start' },
      }),
      <FieldNamespace prefix="introductionPanel">
        <ProtocolField
          name="title"
          label="Panel title"
          component={InputField}
        />
      </FieldNamespace>,
    );

    // The namespace is part of where this field lives. Reading the committed
    // draft from the root instead would start the control blank and then save
    // that blank over what the author wrote.
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Panel title' })).toHaveValue(
        'Before we start',
      ),
    );
  });

  it('treats an opaque name as one key rather than a route', async () => {
    renderField(
      createSession({
        label: 'Welcome',
        // A protocol-authored variable id, which may contain a dot and is not
        // a path into anything.
        attributes: { 'person.age': 'seeded' },
      }),
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

/** Writes out what the stage form holds at a path, so a test can read it. */
function ValueProbe({ path }: Readonly<{ path: string }>) {
  const value = useStageValue(path);
  return (
    <output data-testid={`value:${path}`}>
      {JSON.stringify(value ?? null)}
    </output>
  );
}

const probedValue = (path: string): unknown =>
  JSON.parse(screen.getByTestId(`value:${path}`).textContent ?? 'null');

const EXTRAS_CAPABILITY: SectionCapability = {
  fields: ['extras'],
  confirmClear: {
    title: 'This will clear the extras',
    description: 'Everything in this section will be removed.',
    confirmLabel: 'Clear extras',
  },
};

const CARDS_CAPABILITY: SectionCapability = {
  fields: ['cards'],
  confirmClear: {
    title: 'This will clear the card details',
    description: 'Every extra attribute the cards show will be removed.',
    confirmLabel: 'Clear card details',
  },
};

const CARD_COLUMNS: PropertyField[] = [
  { fieldName: 'variable', label: 'Attribute' },
  { fieldName: 'label', control: 'input', label: 'Label' },
];

const CARD_VALIDATION = makeMultiSelectValidation(CARD_COLUMNS);

const cardOptions: OptionGetter = (fieldName) =>
  fieldName === 'variable'
    ? [
        { value: 'age', label: 'age' },
        { value: 'city', label: 'city' },
      ]
    : [];

const capabilitySwitch = (title: string) =>
  screen.getByRole('switch', { name: title });

/** Switches a configured capability off, confirming the loss it warns of. */
const switchOff = async (
  user: ReturnType<typeof userEvent.setup>,
  title: string,
  confirmLabel: string,
) => {
  await user.click(capabilitySwitch(title));
  await user.click(await screen.findByRole('button', { name: confirmLabel }));
  await waitFor(() => expect(capabilitySwitch(title)).not.toBeChecked());
};

/**
 * Switching a capability off clears every path it owns, and the clear has to
 * hold when the capability is switched back on — however the section's
 * controls come to be mounted afterwards, and wherever the value the clear
 * removed is still remembered.
 */
describe('a capability switched off and back on', () => {
  it('starts a field that never registered before the clear empty', async () => {
    const user = userEvent.setup({ delay: null });
    renderEditor(
      createSession({
        label: 'Welcome',
        title: 'Hello',
        items: [],
        extras: { note: 'Remember this', detail: 'Hidden detail' },
      }),
      <BuilderSection title="Extras" capability={EXTRAS_CAPABILITY}>
        <ProtocolField name="extras.note" label="Note" component={InputField} />
        <Disclosure label="Show detail">
          <ProtocolField
            name="extras.detail"
            label="Detail"
            component={InputField}
          />
        </Disclosure>
        <ValueProbe path="extras.detail" />
      </BuilderSection>,
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue(
        'Remember this',
      ),
    );

    await switchOff(user, 'Extras', 'Clear extras');
    await user.click(capabilitySwitch('Extras'));
    expect(await screen.findByRole('textbox', { name: 'Note' })).toHaveValue(
      '',
    );

    // The detail field had never registered when the clear ran, so the form
    // holds no record of its own for it — only the tombstone at the path the
    // capability owns, above it. The committed draft still remembers the
    // detail, and that memory must not be where the field starts.
    await user.click(screen.getByRole('button', { name: 'Show detail' }));
    expect(await screen.findByRole('textbox', { name: 'Detail' })).toHaveValue(
      '',
    );
    await waitFor(() => expect(probedValue('extras.detail')).toBeNull());
  });

  it('adds to the emptied list rather than to the rows the clear removed', async () => {
    const user = userEvent.setup({ delay: null });
    const session = createSession({
      label: 'Welcome',
      title: 'Hello',
      items: [],
      cards: [{ variable: 'age', label: 'Age' }],
    });
    renderEditor(
      session,
      <BuilderSection title="Card details" capability={CARDS_CAPABILITY}>
        <ProtocolArrayField
          name="cards"
          label="Attributes shown on a card"
          component={MultiSelect}
          addButtonLabel="Add new card detail"
          properties={CARD_COLUMNS}
          options={cardOptions}
          {...CARD_VALIDATION}
        />
      </BuilderSection>,
    );
    const cards = () =>
      within(screen.getByRole('region', { name: 'Card details' }));
    await waitFor(() =>
      expect(cards().getByRole('textbox', { name: /Label/ })).toHaveValue(
        'Age',
      ),
    );

    await switchOff(user, 'Card details', 'Clear card details');
    await user.click(capabilitySwitch('Card details'));
    await user.click(
      await screen.findByRole('button', { name: 'Add new card detail' }),
    );

    // A list bound to a document key commits each edit as a command against
    // the list the SESSION holds — and the session never saw the clear, which
    // is form-local until the save. Resolved against the session's rows, the
    // add would put the cleared row back beside the new one.
    expect(
      cards().getAllByRole('combobox', { name: 'Attribute' }),
    ).toHaveLength(1);
    await user.selectOptions(
      cards().getByRole('combobox', { name: 'Attribute' }),
      'city',
    );
    await user.type(cards().getByRole('textbox', { name: /Label/ }), 'City');

    await waitFor(() =>
      expect(session.getSnapshot().editedSection.fields.cards).toEqual([
        { variable: 'city', label: 'City' },
      ]),
    );
    expect(
      cards().getAllByRole('combobox', { name: 'Attribute' }),
    ).toHaveLength(1);
  });
});

/** Empties a stage path the way a capability's switch does. */
function ClearButton({ path }: Readonly<{ path: string }>) {
  const clear = useClearStageValue();
  return (
    <button type="button" onClick={() => clear(path)}>
      Clear {path}
    </button>
  );
}

/** A control that shows whatever value it is handed, of any shape. */
const ValueOutput = (({ value }: Readonly<{ value?: unknown }>) => (
  <output data-testid="field-value">{JSON.stringify(value ?? null)}</output>
)) as ComponentType<Record<string, unknown>>;

/**
 * The form can empty part of a container before any field has registered at
 * the container itself — a capability owning a leaf inside it, cleared while
 * the compound control above is still behind a disclosure. What that control
 * then starts out holding follows the same rule every other clear applies to
 * an emptied container.
 */
describe('a field mounting over a path the form has emptied inside', () => {
  it('starts a container the form emptied absent rather than as an empty object', async () => {
    const user = userEvent.setup({ delay: null });
    renderEditor(
      createSession({
        label: 'Welcome',
        title: 'Hello',
        items: [],
        extras: { note: 'Remember this' },
      }),
      <BuilderSection title="Extras">
        <ClearButton path="extras.note" />
        <Disclosure label="Show extras">
          <ProtocolField name="extras" label="Extras" component={ValueOutput} />
        </Disclosure>
        <ValueProbe path="extras" />
      </BuilderSection>,
    );

    await user.click(screen.getByRole('button', { name: 'Clear extras.note' }));
    await user.click(screen.getByRole('button', { name: 'Show extras' }));

    // `{}` is not "no extras" to the schema; absence is.
    await waitFor(() => expect(probedValue('extras')).toBeNull());
  });

  it('keeps a row the form emptied as an empty row', async () => {
    const user = userEvent.setup({ delay: null });
    renderEditor(
      createSession({
        label: 'Welcome',
        title: 'Hello',
        items: [{ content: 'Old' }],
      }),
      <BuilderSection title="Items">
        <ClearButton path="items[0].content" />
        <Disclosure label="Show item">
          <ProtocolField name="items[0]" label="Item" component={ValueOutput} />
        </Disclosure>
        <ValueProbe path="items[0]" />
      </BuilderSection>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Clear items[0].content' }),
    );
    await user.click(screen.getByRole('button', { name: 'Show item' }));

    // Removing an array index leaves a hole rather than closing the gap, so an
    // emptied row stays an empty row; taking one out is a deliberate array
    // operation, not a consequence of clearing one of its settings.
    await waitFor(() => expect(probedValue('items[0]')).toEqual({}));
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
 * it. What a leaf mounting beneath both starts out holding has to follow the
 * store's own precedence between them, or the leaf becomes a way for a value
 * the form had already set aside to come back.
 */
describe('a field mounting beneath overlapping fields', () => {
  it('starts from the mounted ancestor rather than a parked one beneath it', async () => {
    const user = userEvent.setup({ delay: null });
    renderEditor(
      createSession({
        label: 'Welcome',
        title: 'Hello',
        items: [],
        settings: { bounds: { min: 'one' } },
      }),
      <BuilderSection title="Settings">
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
      </BuilderSection>,
    );

    // An edit made in the bounds control, then folded away: parked, with the
    // settings container still mounted above it.
    await user.click(screen.getByRole('button', { name: 'Show bounds' }));
    await user.click(screen.getByRole('button', { name: 'Set bounds' }));
    await user.click(screen.getByRole('button', { name: 'Hide bounds' }));

    // The mounted container is what the form assembles and what the save
    // writes; the parked bounds beneath it are dropped by both. A leaf seeded
    // from them would put that parked edit back over the container.
    await user.click(screen.getByRole('button', { name: 'Show minimum' }));
    expect(await screen.findByRole('textbox', { name: 'Minimum' })).toHaveValue(
      'one',
    );
  });
});
