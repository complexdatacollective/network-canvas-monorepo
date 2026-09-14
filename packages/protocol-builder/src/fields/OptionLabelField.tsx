import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { toCanonicalText } from '@codaco/shared-consts';

import RichTextField from './RichTextField.tsx';

export type OptionLabelFieldProps = CreateFormFieldProps<
  string,
  'div',
  {
    // Mirrors what `RichTextField` requires of its own caller: this field only
    // ever renders inside a fresco-ui `Field`, which always injects them.
    'id': string;
    'name': string;
    'aria-describedby': string;
    'placeholder'?: string;
    'autoFocus'?: boolean;
  }
>;

/**
 * The words one answer puts in front of a participant.
 *
 * The interview renders an option's label as markdown wherever it shows one —
 * a categorical or ordinal bin, the buttons of a yes-or-no question, a
 * tie-strength scale, a form's radio or checkbox group — so the label is
 * markdown, and every surface that authors one has to author it as markdown.
 * Architect always did (`Options/Option.jsx`'s Slate editor, and the
 * `RichTextEditorField` that replaced it); the plain inputs some of these
 * surfaces grew instead disagreed with the runtime about a capability it
 * already had, and worse, wrote a typed `*` or `_` straight through to the
 * participant as emphasis (#1892).
 *
 * `singleLine` is the whole of the restriction, and it is one word because
 * `RichTextField` and `RichTextEditorField` both read it: a label is one line
 * of a participant's reading, so the value is one paragraph, and the editor
 * offers bold and italic only — no heading, link, list or rule, none of which
 * a single-line document can even hold. Exactly the toolbar Architect withheld
 * for the same field.
 *
 * The label is written canonically (NFC), on the way out and nowhere else.
 * Two labels that read identically are then also identical bytes — which is
 * what the uniqueness rules compare, what a GraphML or CSV export carries, and
 * what makes two protocols that look the same be the same. See shared-consts'
 * `canonical-text`. A label the protocol already holds is handed to the editor
 * exactly as it was stored, so opening a row is not a repair the researcher
 * never asked for; the next edit they DO make is written canonically like any
 * other. `RichTextField` is what withholds the change the editor emits as it
 * mounts, so nothing here needs to ask whether this is an edit at all.
 */
export default function OptionLabelField({
  value,
  onChange,
  ...props
}: OptionLabelFieldProps) {
  return (
    <RichTextField
      {...props}
      singleLine
      value={typeof value === 'string' ? value : ''}
      onChange={(next) => onChange?.(toCanonicalText(next ?? ''))}
    />
  );
}
