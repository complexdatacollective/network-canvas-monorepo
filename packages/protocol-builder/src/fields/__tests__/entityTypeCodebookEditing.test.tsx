import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  packageSource,
  sourceFiles,
  sourcePath,
} from '../../__tests__/packageSource.ts';
import { familyPedigreeStageWithout } from '../../editors/family-pedigree/sections/__tests__/pedigreeFixtures.tsx';
import PedigreeNodeConfigurationSection from '../../editors/family-pedigree/sections/PedigreeNodeConfigurationSection.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import EntityTypePickerField from '../EntityTypePickerField.tsx';

/**
 * A pedigree opened on a protocol that has no node types, which is what a
 * researcher meets when they add one to a protocol they have just started.
 *
 * Both halves are taken away: the codebook's node types, and the stage's own
 * reference to one. A stage still naming a deleted type shows that reference
 * rather than an empty list — the researcher has to be able to see what they
 * are repairing — so a fixture that only deleted the types would be a
 * different state from the one under test.
 */
const pedigreeOnAProtocolWithNoNodeTypes = () => ({
  stage: familyPedigreeStageWithout(['nodeConfig']),
  sections: <PedigreeNodeConfigurationSection />,
});

const FAMILY_MEMBER_SECTION = sectionId({
  kind: 'codebookNode',
  typeId: 'family_member',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * An attribute another editor adds to the held type, on the host only.
 *
 * `receiveCodebookUpdate` would render it here first, which is the state after
 * the window this is about: written straight to the store, the change is on
 * the host when the lock is taken and had not reached this editor's last
 * render — which is the only state a write computed before the lock can be
 * caught in.
 */
const collaboratorAddsFamilyMemberVariable = (
  harness: ReturnType<typeof renderStageEditor>,
  variableId: string,
  variable: Readonly<Record<string, unknown>>,
): void => {
  const current = harness.host.store.read(FAMILY_MEMBER_SECTION).document;
  const variables = isRecord(current.variables) ? current.variables : {};
  harness.host.store.applyAsCollaborator(FAMILY_MEMBER_SECTION, {
    ...current,
    variables: { ...variables, [variableId]: variable },
  });
};

const clearNodeTypes = (
  harness: ReturnType<typeof renderStageEditor>,
): void => {
  harness.receiveCodebookUpdate({
    node: { person: null, family_member: null },
  });
};

describe('making and changing a codebook type from the control that names it', () => {
  /**
   * The empty state is not a dead end.
   *
   * Every pedigree slot below this control is gated on a node type, so a
   * researcher who has none can configure nothing here at all — and until this
   * landed the only way out was the codebook screen, which a stage editor does
   * not say the way to. Architect has offered the way out from inside this
   * control for as long as the control has existed.
   */
  it('offers a way out of a protocol with no node types', async () => {
    const harness = renderStageEditor(pedigreeOnAProtocolWithNoNodeTypes());
    await harness.opened();
    clearNodeTypes(harness);

    expect(
      await screen.findByText('No node types currently defined'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create new node type' }),
    ).toBeInTheDocument();
  });

  /**
   * And the way out works: the type is written to the codebook under that
   * section's own lock, and the stage is pointed at it afterwards as an
   * ordinary unsaved change — which is why the stage itself is never
   * submitted.
   */
  it('writes the new type to the codebook and selects it on the stage', async () => {
    const harness = renderStageEditor(pedigreeOnAProtocolWithNoNodeTypes());
    await harness.opened();
    clearNodeTypes(harness);
    const submit = vi.spyOn(harness.host.store, 'submit');

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new node type' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Node type name' }),
      'relative',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save entity' }),
    );
    // Selecting the new type moves the stage exactly as pressing a chip does,
    // so it costs the stage exactly the same and is asked about in the same
    // words — asked while the editor is still open, which is what keeps focus
    // on a live control.
    await harness.user.click(
      await screen.findByRole('button', { name: 'Change the node type' }),
    );

    expect(
      await screen.findByRole('radio', { name: 'relative' }),
    ).toBeChecked();
    expect(
      Object.values(harness.hostCodebook().node ?? {}).map(({ name }) => name),
    ).toContain('relative');
    // The stage is not part of that edit: a stage just pointed at a brand-new
    // type has no slots filled in for it, and a host keeping the stored
    // protocol valid would be right to refuse the pair as one write.
    expect(submit).not.toHaveBeenCalled();
  });

  /**
   * The dialog is closed by being turned off, not by being taken away.
   *
   * Both of these dialogs used to be rendered only while there was a session
   * to edit, so closing one unmounted it in the same tick — and the exit
   * animation, which belongs to the `AnimatePresence` inside the dialog, went
   * with it. The dialog vanished rather than closing. What proves the fix is
   * WHEN it leaves: the click alone can no longer remove it.
   */
  it('closes the codebook editor by animating it out, not by dropping it', async () => {
    const harness = renderStageEditor(pedigreeOnAProtocolWithNoNodeTypes());
    await harness.opened();
    clearNodeTypes(harness);

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new node type' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Create new node type',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(dialog).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  /**
   * And the editor a close leaves behind is never shown again.
   *
   * A closed session now OUTLIVES the close, so that its dialog can animate
   * out — which is exactly how an abandoned draft could come back. Reopening
   * mints a new session identity, and the editor resets from it.
   */
  it('reopens the codebook editor on an empty draft, not on the abandoned one', async () => {
    const harness = renderStageEditor(pedigreeOnAProtocolWithNoNodeTypes());
    await harness.opened();
    clearNodeTypes(harness);

    const openEditor = async () =>
      harness.user.click(
        await screen.findByRole('button', { name: 'Create new node type' }),
      );

    await openEditor();
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Node type name' }),
      'abandoned',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await openEditor();

    expect(
      await screen.findByRole('textbox', { name: 'Node type name' }),
    ).toHaveValue('');
  });

  /**
   * Changing the type the stage already holds, from the same control.
   *
   * The editor opens on what the codebook holds rather than on an empty draft,
   * because this is an edit of something that exists — and the write goes
   * through the codebook section, not through the stage.
   */
  it('opens the held type in the codebook editor, and writes what it changed', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      sections: <PedigreeNodeConfigurationSection />,
    });
    await harness.opened();

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit this node type' }),
    );
    const editor = within(
      await screen.findByRole('dialog', { name: 'Edit this node type' }),
    );
    const name = await editor.findByRole('textbox', {
      name: 'Node type name',
    });
    // Open on the type the stage holds, which is the whole of what "edit this
    // one" means: a draft that arrived empty would rename it to whatever was
    // typed over nothing.
    expect(name).toHaveValue('family member');

    await harness.user.clear(name);
    await harness.user.type(name, 'relative');
    await harness.user.click(
      editor.getByRole('button', { name: 'Save entity' }),
    );

    await waitFor(() =>
      expect(
        Object.values(harness.hostCodebook().node ?? {}).map(
          ({ name: typeName }) => typeName,
        ),
      ).toContain('relative'),
    );
    // Still the stage's own type: renaming a type is not repointing the stage.
    expect(
      await screen.findByRole('radio', { name: 'relative' }),
    ).toBeChecked();
  });

  /**
   * A rename is judged against the other map's names as firmly as its own.
   *
   * Node and edge types share ONE namespace, and a record key belongs to one
   * map — `VariableNameSchema`'s alphabet is the protocol author's, so an
   * imported codebook may legally key a node type and an edge type the same.
   * A collision list that dropped the edited entry by id alone would drop the
   * OTHER map's entry with it, and the rename would be taken by the field and
   * refused by the schema, on a screen with no name field left to act on.
   */
  it('refuses a node type the name an edge type keyed the same already has', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      sections: <PedigreeNodeConfigurationSection />,
    });
    await harness.opened();
    // The same record key in both maps, which is what a codebook may hold.
    harness.receiveCodebookUpdate({
      edge: {
        family_member: {
          name: 'kinship',
          color: 'edge-color-seq-1',
          variables: {},
        },
      },
    });

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit this node type' }),
    );
    const editor = within(
      await screen.findByRole('dialog', { name: 'Edit this node type' }),
    );
    const name = await editor.findByRole('textbox', { name: 'Node type name' });
    await harness.user.clear(name);
    await harness.user.type(name, 'kinship');
    await harness.user.click(
      editor.getByRole('button', { name: 'Save entity' }),
    );

    expect(
      await editor.findByText('A type named "kinship" already exists.'),
    ).toBeVisible();
    // Refused here, so nothing reached the codebook to be refused there.
    expect(harness.hostCodebook().node?.family_member?.name).toBe(
      'family member',
    );
  });

  /**
   * And neither is offered where the caller says they must not be. Architect's
   * one such caller is the rule builder (`Query/Rules/RuleEditor.tsx:788`,
   * `allowCreation={false}`), whose picker sits inside a dialog inside a
   * dialog.
   */
  it('offers neither where the caller withdraws them', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      sections: (
        <Field<typeof EntityTypePickerField>
          name="nodeConfig.type"
          component={EntityTypePickerField}
          entityType="node"
          allowCodebookEditing={false}
          label="Node type"
        />
      ),
    });
    await harness.opened();

    // The control itself is there, so the reading below is about the two
    // affordances rather than about a control that never rendered.
    expect(
      await screen.findByRole('radio', { name: 'family member' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create new node type' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Edit this node type' }),
    ).toBeNull();
  });

  /**
   * Nor to a researcher who may not write to the stage at all.
   *
   * The same question P5's review asked of the attribute picker's create row:
   * a field that has stopped taking a chosen type has stopped taking an
   * invented one too, and what is offered has to say so before it is pressed
   * rather than after. Here the two affordances open an editor whose save the
   * host would refuse, so they go with the rest of the field's writing.
   */
  it('offers neither to a spectator', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      sections: <PedigreeNodeConfigurationSection />,
      readOnly: true,
    });
    await harness.opened();

    // The picker itself is on screen — a spectator reads what the stage is
    // configured for — so this is about the two affordances, not about a
    // control that never rendered.
    expect(
      await screen.findByRole('radio', { name: 'family member' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create new node type' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Edit this node type' }),
    ).toBeNull();
  });

  /**
   * And no section keeps a create control of its own beside a picker.
   *
   * A source-side claim rather than a sweep over rendered buttons: the three
   * that stood here — the network composer's, the dyad census family's and the
   * subject section's — each said "Create a new …" in words of their own, and a
   * fourth written tomorrow would say something this suite has never heard of.
   * What they had in common is the editor they mounted.
   */
  /**
   * A type is more than the properties this form shows.
   *
   * `variables` belongs to the attribute editors, not to this one, so the
   * write has to lay the form's own properties over the document the LOCK
   * hands back rather than over the one the editor read — or an attribute a
   * collaborator added while the save was taking the lock is deleted by a
   * researcher who only changed a name.
   */
  it('keeps an attribute a collaborator added while the write was taking the lock', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      sections: <PedigreeNodeConfigurationSection />,
    });
    await harness.opened();

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit this node type' }),
    );
    const editor = within(
      await screen.findByRole('dialog', { name: 'Edit this node type' }),
    );
    const name = await editor.findByRole('textbox', { name: 'Node type name' });
    await harness.user.clear(name);
    await harness.user.type(name, 'relative');

    collaboratorAddsFamilyMemberVariable(harness, 'shoe_size', {
      name: 'shoe_size',
      type: 'number',
      component: 'Number',
    });
    // Synchronous, so the save is raised from the render that has not seen the
    // collaborator's attribute yet — the window the lock exists to close.
    fireEvent.click(editor.getByRole('button', { name: 'Save entity' }));

    await waitFor(() =>
      expect(harness.hostCodebook().node?.family_member?.name).toBe('relative'),
    );
    expect(
      Object.keys(harness.hostCodebook().node?.family_member?.variables ?? {}),
    ).toContain('shoe_size');
  });

  it('leaves no section mounting a codebook entity editor of its own', () => {
    const mounts = [
      ...sourceFiles(join(packageSource, 'editors')),
      ...sourceFiles(join(packageSource, 'sections')),
    ]
      .filter((path) =>
        readFileSync(path, 'utf8').includes('CodebookEntityEditor'),
      )
      .map(sourcePath);

    expect(mounts).toEqual([]);
  });
});
