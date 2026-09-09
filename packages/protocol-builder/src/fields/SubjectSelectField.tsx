import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import type { StageSubject } from '@codaco/protocol-validation';

import {
  EntitySelectControl,
  type EntityTypeChangeConfirmation,
} from './EntitySelectField.tsx';

/**
 * The node and edge members of the subject union.
 *
 * An ego subject carries no type, so it has nothing for this control to pick;
 * a stage whose subject is ego says so by having no subject section at all.
 */
export type EntitySubject = Extract<StageSubject, { type: string }>;

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
    confirmChange?: () => EntityTypeChangeConfirmation | undefined;
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
 * A pick that costs the stage its configuration is held back until the
 * researcher has agreed to it, and `confirmChange` travels to the control that
 * asks: moving a subject throws away every prompt, form, panel and filter the
 * stage was carrying, and so does changing the node or edge type of an
 * interface that names its types outside `subject` — one question, asked by
 * the one control both go through, rather than by each caller of it.
 */
export default function SubjectSelectField({
  value,
  onChange,
  entityType,
  ...props
}: SubjectSelectFieldProps) {
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
      onChange={(nextType) => onChange?.(asSubject(nextType))}
    />
  );
}
