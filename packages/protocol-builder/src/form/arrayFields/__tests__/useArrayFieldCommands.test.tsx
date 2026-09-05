import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../../controller.ts';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../../session.ts';
import StageEditorShell from '../../StageEditorShell.tsx';
import {
  ArrayFieldBindingContext,
  useArrayFieldCommands,
  type ArrayFieldCommands,
} from '../useArrayFieldCommands.ts';

type Row = { id?: string; text?: string };

const byId = (row: Row) => row.id;

const A: Row = { id: 'a', text: 'Alpha' };
const B: Row = { id: 'b', text: 'Bravo' };

function createSession(fields: SectionDoc) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Array commands test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

/**
 * The hook as a list editor holds it, inside a real stage form.
 *
 * A row operation is what reaches it in the product, but the branches below
 * belong to the hook: whether a list is bound to a document key at all, and
 * what a save that outlived its editing session may commit. Driving them
 * through a particular list would make each of them a fact about that list.
 */
function renderCommands(
  session: ProtocolBuilderSessionStore,
  rendered: readonly Row[],
  documentKey: string | undefined,
  onChange: (next: Row[]) => void,
) {
  const held: { commands?: ArrayFieldCommands<Row> } = {};

  function Probe() {
    held.commands = useArrayFieldCommands<Row>(rendered, onChange, byId);
    return null;
  }

  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell controller={controller}>
        {documentKey === undefined ? (
          <Probe />
        ) : (
          <ArrayFieldBindingContext value={{ documentKey }}>
            <Probe />
          </ArrayFieldBindingContext>
        )}
      </StageEditorShell>
    );
  }

  render(
    <DialogProvider>
      <Host />
    </DialogProvider>,
  );

  return held.commands!;
}

describe('a list bound to a document key', () => {
  it('takes the list operations, so each row edit commits as what it was', () => {
    const session = createSession({ prompts: [A, B] });
    const commands = renderCommands(session, [A, B], 'prompts', vi.fn());

    // Handed to `ArrayField`, which then reports the operation rather than
    // just the new array. An unbound list has no key to address and answers
    // `undefined`, so this is the whole difference between the two.
    expect(commands.onOperation).toBeTypeOf('function');
  });

  it('commits a save that outlived its editor onto the row it was made on', () => {
    const session = createSession({ prompts: [A, B] });
    const onChange = vi.fn();
    const commands = renderCommands(session, [A, B], 'prompts', onChange);

    let committed = false;
    act(() => {
      committed = commands.commitDetachedRow(
        { id: 'b', text: 'Bravo edited' },
        'b',
        false,
      );
    });

    expect(committed).toBe(true);
    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([
      A,
      { id: 'b', text: 'Bravo edited' },
    ]);
  });

  it('answers no when the row it was asked to commit to has gone', () => {
    const session = createSession({ prompts: [A] });
    const onChange = vi.fn();
    const commands = renderCommands(session, [A, B], 'prompts', onChange);

    let committed = true;
    act(() => {
      committed = commands.commitDetachedRow(
        { id: 'b', text: 'Bravo edited' },
        'b',
        false,
      );
    });

    // There is nothing left to commit the edit to, and appending it would add
    // back a row the researcher deleted. Answering yes is what closes the
    // dialog over an edit that reached nothing.
    expect(committed).toBe(false);
    expect(session.getSnapshot().editedSection.fields.prompts).toEqual([A]);
    expect(session.getSnapshot().pendingCommands).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('a list with no document key of its own', () => {
  it('withholds the list operations, so it commits as an ordinary value', () => {
    const session = createSession({ prompts: [A, B] });
    const commands = renderCommands(session, [A, B], undefined, vi.fn());

    // A list nested inside a row dialog is committed as part of the row around
    // it. Writing its rows into the document as they change would commit half
    // of an edit the researcher can still cancel.
    expect(commands.onOperation).toBeUndefined();
  });

  it('answers no when the row it was asked to commit to has gone', () => {
    const session = createSession({ prompts: [A, B] });
    const onChange = vi.fn();
    const commands = renderCommands(session, [A], undefined, onChange);

    let committed = true;
    act(() => {
      committed = commands.commitDetachedRow(
        { id: 'b', text: 'Bravo edited' },
        'b',
        false,
      );
    });

    expect(committed).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('appends a row that was still being added when its editor went', () => {
    const session = createSession({ prompts: [A, B] });
    const onChange = vi.fn();
    const commands = renderCommands(session, [A], undefined, onChange);

    let committed = false;
    act(() => {
      committed = commands.commitDetachedRow(
        { id: 'n', text: 'New' },
        'n',
        true,
      );
    });

    // The one exception to the rule above: a row being added was never in the
    // list to begin with, so there is no wrong row for it to land on.
    expect(committed).toBe(true);
    expect(onChange).toHaveBeenCalledWith([A, { id: 'n', text: 'New' }]);
  });
});
