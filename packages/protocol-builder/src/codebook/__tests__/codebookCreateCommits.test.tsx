import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import Button from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { parseSectionId, sectionId } from '@codaco/studio-sync/taxonomy';

import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import { useEntityTypes } from '../../state/hooks.ts';
import {
  createInMemoryHost,
  type InMemoryHost,
} from '../../testing/host/createInMemoryHost.ts';
import { sectionsFromProtocol } from '../../testing/host/sectionsFromProtocol.ts';
import CodebookEntityEditor from '../components/CodebookEntityEditor.tsx';
import { useCreateCodebookVariable } from '../useCodebookVariableEdits.ts';
import { useCreateCodebookEntity } from '../writes.ts';

const FIXTURE: Record<string, unknown> = allInterfaces;

const STAGE = sectionId({ kind: 'stage', stageId: 'information-1' });
const PERSON = sectionId({ kind: 'codebookNode', typeId: 'person' });

const ANA = { sessionId: 'session-2', userId: 'user-2', displayName: 'Ana' };

/** Read from the host rather than from the cache: the protocol, not a view of it. */
const nodeTypeNames = (host: InMemoryHost): string[] =>
  host.store
    .sectionIds()
    .filter((id) => parseSectionId(id).kind === 'codebookNode')
    .map((id) => String(host.store.read(id).document.name));

/**
 * A stage editor as far as this rule is concerned: unsaved local state, a
 * codebook dialog opened from inside it, and a way to abandon the stage edit.
 *
 * The stage is never submitted. Everything that reaches the host here reached
 * it because the codebook dialog put it there.
 */
function StageEditorWithACodebookDialog({
  seededLabel,
}: Readonly<{ seededLabel: string }>) {
  const createEntity = useCreateCodebookEntity();
  const nodeTypes = useEntityTypes('node');
  const [label, setLabel] = useState(seededLabel);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <UnconnectedField
        name="stage-label"
        label="Stage name"
        component={InputField}
        value={label}
        onChange={(value) => setLabel(value ?? '')}
      />
      <ul aria-label="Node types">
        {nodeTypes.map((type) => (
          <li key={type.id}>{type.name}</li>
        ))}
      </ul>
      <Button type="button" onClick={() => setCreating(true)}>
        Create a new node type
      </Button>
      <Button type="button" onClick={() => setLabel(seededLabel)}>
        Discard this stage edit
      </Button>
      {creating && (
        <CodebookEntityEditor
          mode="create"
          sessionKey="create-node"
          // Only the entity KIND is settled while creating: the host mints the
          // type id with the section.
          subject={{ entity: 'node', type: 'pending' }}
          initialDraft={{
            color: 'node-color-seq-1',
            icon: 'add-a-person',
            shape: { default: 'circle' },
          }}
          existingEntityNames={nodeTypes.map((type) => type.name)}
          onSubmit={(document) => createEntity('node', document)}
          onApplied={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      )}
    </>
  );
}

describe('a codebook type created from inside a stage editor', () => {
  it('is in the protocol without the stage being saved, and survives the stage edit being cancelled', async () => {
    const user = userEvent.setup();
    const host = createInMemoryHost({
      sections: sectionsFromProtocol(FIXTURE),
    });
    const seededLabel = String(host.store.read(STAGE).document.label);

    render(
      <ProtocolBuilder client={host.client} protocolId={host.protocolId}>
        <StageEditorWithACodebookDialog seededLabel={seededLabel} />
      </ProtocolBuilder>,
    );

    // The list has actually loaded, and does not already answer the question.
    const list = screen.getByRole('list', { name: 'Node types' });
    await waitFor(() => expect(list).not.toBeEmptyDOMElement());
    expect(list).not.toHaveTextContent('Place');
    expect(nodeTypeNames(host)).not.toContain('Place');

    // The researcher is halfway through the stage, and never saves it.
    const stageName = screen.getByRole('textbox', { name: 'Stage name' });
    await user.clear(stageName);
    await user.type(stageName, 'Half-written stage name');

    await user.click(
      screen.getByRole('button', { name: 'Create a new node type' }),
    );
    await user.type(
      await screen.findByRole('textbox', { name: 'Node type name' }),
      'Place',
    );
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    // It is in the protocol, and every component reading the codebook sees it.
    await waitFor(() => expect(list).toHaveTextContent('Place'));
    expect(nodeTypeNames(host)).toContain('Place');
    // And the stage the researcher was writing has not been saved with it.
    expect(host.store.read(STAGE).document.label).toBe(seededLabel);
    expect(stageName).toHaveValue('Half-written stage name');

    await user.click(
      screen.getByRole('button', { name: 'Discard this stage edit' }),
    );

    expect(stageName).toHaveValue(seededLabel);
    expect(nodeTypeNames(host)).toContain('Place');
    expect(list).toHaveTextContent('Place');
  });
});

/**
 * The same write, refused: a collaborator is holding the codebook section it
 * has to take.
 */
function AttributeInventor() {
  const createVariable = useCreateCodebookVariable({
    entity: 'node',
    type: 'person',
  });
  const [answer, setAnswer] = useState('');

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          void (async () => {
            const outcome = await createVariable({
              name: 'shoeSize',
              type: 'number',
            });
            setAnswer(
              outcome.status === 'created' ? 'created' : outcome.message,
            );
          })();
        }}
      >
        Invent an attribute
      </Button>
      <output aria-label="What happened">{answer}</output>
    </>
  );
}

const personVariableNames = (host: InMemoryHost): string[] =>
  Object.values(host.store.read(PERSON).document.variables ?? {}).map(
    (variable) => String((variable as Record<string, unknown>).name),
  );

describe('a codebook write whose section a collaborator is holding', () => {
  it('names the holder, writes nothing, and gives the lock back once it can write', async () => {
    const user = userEvent.setup();
    const host = createInMemoryHost({
      sections: sectionsFromProtocol(FIXTURE),
    });
    const collaborator = host.asCollaborator(ANA);
    const held = await collaborator.acquireLock({
      protocolId: host.protocolId,
      sectionId: PERSON,
    });
    expect(held.lock).toBe('held');
    const before = personVariableNames(host);
    expect(before.length).toBeGreaterThan(0);

    render(
      <ProtocolBuilder client={host.client} protocolId={host.protocolId}>
        <AttributeInventor />
      </ProtocolBuilder>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Invent an attribute' }),
    );

    const answer = screen.getByLabelText('What happened');
    await waitFor(() =>
      expect(answer).toHaveTextContent(
        'Ana is currently editing a section needed for this change.',
      ),
    );
    expect(personVariableNames(host)).toEqual(before);

    await collaborator.releaseLock({
      protocolId: host.protocolId,
      sectionId: PERSON,
    });
    await user.click(
      screen.getByRole('button', { name: 'Invent an attribute' }),
    );

    await waitFor(() => expect(answer).toHaveTextContent('created'));
    expect(personVariableNames(host)).toContain('shoeSize');
    // The lock the write took is given back, so the collaborator can take it
    // again rather than being locked out for the rest of the session.
    const after = await collaborator.acquireLock({
      protocolId: host.protocolId,
      sectionId: PERSON,
    });
    expect(after.lock).toBe('held');
  });
});
