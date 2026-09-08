import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import type { StageSubject } from '@codaco/protocol-validation';

import { EntitySelectControl } from './EntitySelectField.tsx';

/**
 * The node and edge members of the subject union.
 *
 * An ego subject carries no type, so it has nothing for this control to pick;
 * a stage whose subject is ego says so by having no subject section at all.
 */
export type EntitySubject = Extract<StageSubject, { type: string }>;

/**
 * What the researcher is asked before a change that costs them something.
 *
 * Whole strings rather than a noun dropped into a frame, like every other word
 * a subject uses: "the node type" and "the edge type" do not differ only in
 * the noun in every language.
 */
export type SubjectChangeConfirmation = Readonly<{
  title: string;
  description: string;
  confirmLabel: string;
}>;

export type SubjectSelectFieldProps = CreateFormFieldProps<
  EntitySubject,
  'div',
  {
    entityType: EntitySubject['entity'];
    /**
     * What to ask before REPLACING a subject the stage already has, or
     * `undefined` to change it without asking.
     *
     * A function, because it is asked at the moment of the change: the answer
     * depends on what the stage is carrying, and a control re-rendering on
     * every keystroke to keep it current is one re-rendering for a question
     * nobody has asked yet. The same reason `useDiscardDraftGuard` takes
     * `hasDraft` as one.
     */
    confirmChange?: () => SubjectChangeConfirmation | undefined;
  }
>;

/**
 * A stage's `subject`, picked from the protocol's own codebook.
 *
 * The schema stores the subject as `{entity, type}` while the picker speaks
 * bare type ids, and the Fresco form store has no `format`/`parse` seam of its
 * own — so this is where the two are bridged, once, rather than in every
 * section that owns a subject.
 *
 * It is also where a change is held back until the researcher has agreed to
 * it. Changing a stage's subject throws away every prompt, form, panel and
 * filter that described the old type, and a radio is one click: asked HERE,
 * before the value moves, rather than by whatever watches it afterwards —
 * which would have to put the picker back, and would be answering a question
 * about a change the researcher can already see on screen. The shape Architect
 * has always used (`NodeType`'s `promptBeforeChange`).
 */
export default function SubjectSelectField({
  value,
  onChange,
  entityType,
  confirmChange,
  ...props
}: SubjectSelectFieldProps) {
  const { confirm } = useDialog();

  // Written out per entity rather than assembled from `entityType`: the
  // subject union discriminates on `entity`, and a computed discriminant would
  // only be a subject after a cast.
  const asSubject = (
    nextType: string | undefined,
  ): EntitySubject | undefined =>
    nextType === undefined || nextType === ''
      ? undefined
      : entityType === 'node'
        ? { entity: 'node', type: nextType }
        : { entity: 'edge', type: nextType };

  return (
    <EntitySelectControl
      {...props}
      entityType={entityType}
      value={value?.type}
      onChange={(nextType) => {
        const next = asSubject(nextType);
        // Nothing to lose: a stage with no subject yet is being filled in for
        // the first time, and a question about nothing is one a researcher
        // learns to dismiss without reading.
        const question = value === undefined ? undefined : confirmChange?.();
        if (question === undefined) {
          onChange?.(next);
          return;
        }
        void (async () => {
          const confirmed = await confirm({
            title: question.title,
            description: question.description,
            confirmLabel: question.confirmLabel,
            // The provider's own default, which is the plain "Cancel" this
            // question wants: backing out of a change that has not happened
            // yet needs no words of its own.
            intent: 'warning',
            onConfirm: () => undefined,
          });
          if (confirmed === true) onChange?.(next);
        })();
      }}
    />
  );
}
