import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { useStageEditorController } from '../../controller.ts';
import BuilderSection from '../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import ProtocolField from '../ProtocolField.tsx';
import StageEditorShell from '../StageEditorShell.tsx';
import { useStageValue } from '../stageFormHooks.ts';

const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });
const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });

/**
 * A key a researcher authored that contains a dot.
 *
 * Protocol-authored keys are not written by this package, and a variable id or
 * a prompt key may legally contain the character a path uses as its
 * separator.
 */
const DOTTED_KEY = 'my.title';

const protocolSections: Record<string, SectionDoc> = {
  [settingsSection]: { name: 'Stage value reading', schemaVersion: 8 },
  [stageOrderSection]: { stages: ['stage-1'] },
  [stageSection]: {
    id: 'stage-1',
    type: 'Information',
    label: 'Welcome',
    title: 'Welcome',
    items: [],
  },
};

function createSession(fields: SectionDoc) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields,
    protocolSections,
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Stage value reading',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

/** Writes out whatever the hook reports, so a test can read it back. */
function ValueProbe({ path }: { path: string }) {
  const value = useStageValue(path);
  return (
    <output data-testid="stage-value">{JSON.stringify(value ?? null)}</output>
  );
}

const probedValue = (): unknown =>
  JSON.parse(screen.getByTestId('stage-value').textContent ?? 'null');

function renderEditor({
  fields,
  path,
  fieldName,
}: Readonly<{ fields: SectionDoc; path: string; fieldName?: string }>) {
  const session = createSession(fields);

  function Editor() {
    const controller = useStageEditorController(session, 'stage-form');

    return (
      <StageEditorShell controller={controller}>
        <BuilderSection title="Page content">
          {fieldName !== undefined && (
            <ProtocolField
              name={fieldName}
              nameMode="opaque"
              label="Page heading"
              component={InputField}
            />
          )}
          <ValueProbe path={path} />
        </BuilderSection>
      </StageEditorShell>
    );
  }

  render(
    <DialogProvider>
      <Editor />
    </DialogProvider>,
  );

  return { session };
}

/**
 * The one way anything in this package reads a stage value it does not own a
 * field for.
 *
 * What it addresses is a PATH, spelled the way `formatObjectPath` spells one —
 * so a protocol-authored key containing a dot is one name in brackets rather
 * than a route through the document. Reading the same string the legacy way
 * would split it in two and find nothing there.
 */
describe('useStageValue', () => {
  it('reads a value the committed draft holds', () => {
    renderEditor({
      fields: { label: 'Welcome', title: 'Hello', items: [] },
      path: 'title',
    });

    expect(probedValue()).toBe('Hello');
  });

  it('reads a nested value by path', () => {
    renderEditor({
      fields: {
        label: 'Welcome',
        title: 'Hello',
        items: [],
        skipLogic: { action: 'SKIP' },
      },
      path: 'skipLogic.action',
    });

    expect(probedValue()).toBe('SKIP');
  });

  it('reads an authored key containing a dot as one name', () => {
    renderEditor({
      fields: {
        label: 'Welcome',
        title: 'Hello',
        items: [],
        [DOTTED_KEY]: 'An authored value',
      },
      // Bracketed and quoted: this is one key, not a route into a `my` object.
      path: `["${DOTTED_KEY}"]`,
    });

    expect(probedValue()).toBe('An authored value');
  });

  it('does not mistake a dotted key for a route through the document', () => {
    renderEditor({
      fields: {
        label: 'Welcome',
        title: 'Hello',
        items: [],
        // Both shapes at once. Only the parsing decides which of them the
        // bracketed path finds.
        [DOTTED_KEY]: 'the authored key',
        my: { title: 'the nested route' },
      },
      path: `["${DOTTED_KEY}"]`,
    });

    expect(probedValue()).toBe('the authored key');
  });

  it('prefers what the form holds over the draft it was opened with', async () => {
    const user = userEvent.setup();
    renderEditor({
      fields: {
        label: 'Welcome',
        title: 'Hello',
        items: [],
        [DOTTED_KEY]: 'An authored value',
      },
      path: `["${DOTTED_KEY}"]`,
      fieldName: DOTTED_KEY,
    });

    await user.type(
      screen.getByRole('textbox', { name: 'Page heading' }),
      ' edited',
    );

    // The field registered under the same one-segment path, so the hook reads
    // what the researcher is typing rather than the value the editor opened on.
    await waitFor(() => expect(probedValue()).toBe('An authored value edited'));
  });

  it('answers undefined — never null — for a path nothing holds', () => {
    renderEditor({
      fields: { label: 'Welcome', title: 'Hello', items: [] },
      path: 'skipLogic.action',
    });

    expect(probedValue()).toBeNull(); // the probe's own stand-in for undefined
  });
});
