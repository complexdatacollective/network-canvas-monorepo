import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';

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
   * And no section keeps a create control of its own beside a picker.
   *
   * A source-side claim rather than a sweep over rendered buttons: the three
   * that stood here — the network composer's, the dyad census family's and the
   * subject section's — each said "Create a new …" in words of their own, and a
   * fourth written tomorrow would say something this suite has never heard of.
   * What they had in common is the editor they mounted.
   */
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
