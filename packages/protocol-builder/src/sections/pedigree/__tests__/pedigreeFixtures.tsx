import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import type { RowEditorProps, RowPreviewProps } from '../../rowRenderers.tsx';

/**
 * A stand-in for the form-fields family's own row editor.
 *
 * Deliberately plain: these tests are about the pedigree's node configuration
 * around the list — that it owns `nodeConfig.form`, and that a field's
 * attribute is a validated writer the structural slots must not also claim —
 * and a row editor that did anything clever would make a failure ambiguous
 * between the two.
 */
export function TestFormFieldEditor({ item }: RowEditorProps) {
  return (
    <>
      <Field
        name="variable"
        label="Field attribute"
        component={InputField}
        initialValue={typeof item.variable === 'string' ? item.variable : ''}
        required="Name the attribute this field collects."
      />
      <Field
        name="prompt"
        label="Field prompt"
        component={InputField}
        initialValue={typeof item.prompt === 'string' ? item.prompt : ''}
        required="Write the question this field asks."
      />
    </>
  );
}

export function TestFormFieldPreview({ item }: RowPreviewProps) {
  return (
    <span>{typeof item.prompt === 'string' ? item.prompt : 'Empty field'}</span>
  );
}

/**
 * The fixture pedigree, with whatever the test needs added to it.
 *
 * The shared all-interfaces protocol carries no nomination prompts and no
 * family-member form, so the paths that edit them have to be seeded here — but
 * from the fixture stage rather than from a hand-written one, so a test still
 * fails when the fixture and the schema disagree.
 */
export function familyPedigreeStageWith(extra: SectionDoc): Readonly<{
  id: string;
  type: 'FamilyPedigree';
  fields: SectionDoc;
}> {
  const seeded = loadFixtureStage('family-pedigree-1');
  if (seeded.type !== 'FamilyPedigree') {
    throw new Error('The fixture stage "family-pedigree-1" changed interface.');
  }
  return {
    id: seeded.id,
    type: 'FamilyPedigree',
    fields: { ...seeded.fields, ...extra },
  };
}
