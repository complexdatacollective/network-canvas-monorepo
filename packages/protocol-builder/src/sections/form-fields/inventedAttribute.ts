import { defineMessages } from '@codaco/app-i18n/messages';

import type { RowValues } from '../../form/rowDialog.tsx';
import { useRowValue } from '../AttributeCodebookControls.tsx';

/**
 * What the chosen input control will make the attribute.
 *
 * Shared by both inventing rows, and declared once because it says one thing:
 * the kind of answer follows from the control, and cannot be changed once the
 * attribute exists. Its id stays under `formFields`, where it was first
 * written — an id is a translator's key, not a filing cabinet.
 */
export const INVENTED_TYPE_NOTICE = defineMessages({
  newTypeNotice: {
    id: 'protocolBuilder.formFields.newTypeNotice',
    defaultMessage:
      'The selected input control will cause this attribute to be defined as type <strong>{variableType}</strong>. Once set, this cannot be changed (although you may change the input control within this type).',
    description:
      'Shown while the field is inventing an attribute, saying which kind the chosen input control will make it. variableType is that kind, already translated.',
  },
}).newTypeNotice;

/**
 * Why a kind of answer a name cannot finish is refused at the row's own save.
 *
 * Shared by both inventing rows for the reason the notice above is: one rule,
 * `needsCodebookEditorToCreate`, decides which inventions come here, and a row
 * that phrased the refusal for itself could say something the rule does not
 * mean. Both file them against the control that DECIDED the kind, which is the
 * input control in either row — the one question this package asks about an
 * invention, and the one the researcher has to change to get past the refusal.
 */
export const CREATE_FIRST_REFUSALS = defineMessages({
  createWithValuesFirst: {
    id: 'protocolBuilder.formFields.createWithValuesFirst',
    defaultMessage:
      'Create this attribute and the values it offers before adding the field that collects it.',
    description:
      'Refusal shown under the control that decided the kind of answer when a researcher tries to invent an attribute whose answers come from a list, which cannot be made from a name and a kind alone.',
  },
  createWithSettingsFirst: {
    id: 'protocolBuilder.formFields.createWithSettingsFirst',
    defaultMessage:
      'Create this attribute and what it accepts before adding the field that collects it.',
    description:
      'The same refusal for an attribute whose answer is not chosen from a list but still needs something the researcher has not been asked for — a scale, whose two end labels tell the participant what each end means.',
  },
});

/**
 * What a form row holds while the attribute it collects is being invented.
 *
 * The picker's create row takes the name the researcher searched for and
 * writes this here, because the attribute cannot be created yet: which control
 * collects it is the next question, and the kind of answer it holds follows
 * from that, and the codebook refuses an attribute without them. So the row
 * says "an attribute I am still making" until its own save makes it — which is
 * what Architect does too (`Form/fieldCommit.ts` creates the attribute as the
 * row commits). It is never written to the protocol: each family's own commit
 * replaces it with the created attribute's own id before the row is committed.
 *
 * Spelled with a `#`, which is the whole of why this value and not another
 * one. An attribute's record key is the researcher's — `VariableNameSchema` is
 * `/^[a-zA-Z0-9._:-]+$/`, and the uuids this package mints are only what IT
 * creates, so an imported or hand-written protocol may key an attribute
 * anything that regex allows. A sentinel inside that alphabet is a name the
 * codebook may legally hold: the picker would then offer the real attribute
 * and this option under one value, choosing the attribute would read as a
 * request to invent one, and saving would create a second attribute beside it.
 * `#` is outside the alphabet, so no attribute can ever be called this.
 *
 * Its own module because both form families invent: the shared form-fields
 * row and the network composer's. One sentinel and one pair of keys, so a row
 * of either shape is recognised as inventing by the same question — and both
 * shapes answer the kind of answer the same way, from the input control.
 */
export const NEW_VARIABLE = '#create-new-attribute';

/**
 * Row keys that describe the CODEBOOK rather than the field.
 *
 * A form field holds only its attribute, its question and its hints; what the
 * attribute is called and what its answers have to satisfy belong to the
 * codebook. They are authored on the row because that is where the researcher
 * is looking, written with the create, and stripped from the row before it
 * reaches the protocol.
 */
export const NEW_VARIABLE_NAME = '_newVariableName';
export const NEW_VARIABLE_VALIDATION = '_newVariableValidation';

/**
 * Whether this row is inventing an attribute right now.
 *
 * The live choice, falling back to the committed one for the render before the
 * picker has registered — otherwise a row saved mid-invention would open with
 * its invention controls missing, and saving it again would drop them.
 */
export function useInventingAttribute(item: RowValues): boolean {
  const chosen = useRowValue('variable');
  return (chosen ?? item.variable) === NEW_VARIABLE;
}
