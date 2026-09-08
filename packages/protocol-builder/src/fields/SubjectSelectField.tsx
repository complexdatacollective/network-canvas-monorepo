import { useCallback } from 'react';

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

/**
 * Asks the question a subject change raises, and answers whether the change
 * may go ahead.
 *
 * Shared, because this control is not the only way a researcher moves a
 * stage's subject: creating a type from inside the stage and selecting it on
 * it moves the subject too, and costs the stage exactly the same prompts,
 * form, panels and filter. One definition of the question, so the two cannot
 * ask different ones — or so that one of them cannot quietly stop asking.
 *
 * `undefined` is "nothing to lose", and goes ahead without a dialog: a
 * question about nothing is one a researcher learns to dismiss without
 * reading. The dismissal is the provider's own plain "Cancel", which is what
 * this question wants — backing out of a change that has not happened yet
 * needs no words of its own.
 */
export function useConfirmSubjectChange(): (
  question: SubjectChangeConfirmation | undefined,
) => Promise<boolean> {
  const { confirm } = useDialog();
  return useCallback(
    async (question) => {
      if (question === undefined) return true;
      const confirmed = await confirm({
        title: question.title,
        description: question.description,
        confirmLabel: question.confirmLabel,
        intent: 'warning',
        onConfirm: () => undefined,
      });
      return confirmed === true;
    },
    [confirm],
  );
}

export type SubjectSelectFieldProps = CreateFormFieldProps<
  EntitySubject,
  'div',
  {
    entityType: EntitySubject['entity'];
    /**
     * What to ask before a pick that costs the stage what it is carrying, or
     * `undefined` to let the pick through without asking.
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
 * It is also where a pick is held back until the researcher has agreed to it.
 * Moving a stage's subject throws away every prompt, form, panel and filter
 * the stage was carrying — whether it had a type before or was configured
 * without one — and a radio is one click: asked HERE, before the value moves,
 * rather than by whatever watches it afterwards, which would have to put the
 * picker back and would be answering a question about a change the researcher
 * can already see on screen. The shape Architect has always used (`NodeType`'s
 * `promptBeforeChange`).
 */
export default function SubjectSelectField({
  value,
  onChange,
  entityType,
  confirmChange,
  ...props
}: SubjectSelectFieldProps) {
  const confirmSubjectChange = useConfirmSubjectChange();

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
        // Asked whatever the picker is currently showing. "The stage has no
        // subject yet" is not the same as "the stage has nothing to lose": a
        // filter written before the type was picked is thrown away by the
        // first choice exactly as it is by a later change, and a guard keyed
        // on the value would let that one through in silence. `confirmChange`
        // is where the loss is judged, and it already returns nothing to ask
        // when there is nothing to lose.
        const question = confirmChange?.();
        if (question === undefined) {
          onChange?.(next);
          return;
        }
        void (async () => {
          if (await confirmSubjectChange(question)) onChange?.(next);
        })();
      }}
    />
  );
}
