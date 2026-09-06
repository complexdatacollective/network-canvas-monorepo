import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentType, type ReactNode, useState } from 'react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../controller.ts';
import BuilderSection from '../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import ProtocolField from '../ProtocolField.tsx';
import StageEditorShell from '../StageEditorShell.tsx';

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

function renderField(
  session: ProtocolBuilderSessionStore,
  children: React.ReactNode,
) {
  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell controller={controller}>
        <BuilderSection title="Introduction">{children}</BuilderSection>
      </StageEditorShell>
    );
  }

  return render(
    <DialogProvider>
      <Host />
    </DialogProvider>,
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
 * it. A leaf mounting beneath both starts from the committed draft, which is
 * the one account of what a path holds — so an edit the form has PARKED
 * cannot come back through it.
 *
 * That matters because a parked value under a mounted container is not a
 * value the save will write: the form assembles its values from the fields
 * that are mounted, and drops a parked write a mounted field overlaps. A leaf
 * seeded from the parked edit instead would show the researcher something the
 * next save is about to throw away, and put that edit back over the container
 * as soon as they touched it.
 */
describe('a field mounting beneath overlapping fields', () => {
  it('starts from the committed draft rather than a parked edit beneath a mounted container', async () => {
    const user = userEvent.setup({ delay: null });
    renderField(
      createSession({
        label: 'Welcome',
        settings: { bounds: { min: 'one' } },
      }),
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
    await user.click(screen.getByRole('button', { name: 'Show bounds' }));
    await user.click(screen.getByRole('button', { name: 'Set bounds' }));
    await user.click(screen.getByRole('button', { name: 'Hide bounds' }));

    // The draft's value, not the parked one.
    await user.click(screen.getByRole('button', { name: 'Show minimum' }));
    expect(await screen.findByRole('textbox', { name: 'Minimum' })).toHaveValue(
      'one',
    );
  });
});
