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

export type SubjectSelectFieldProps = CreateFormFieldProps<
  EntitySubject,
  'div',
  { entityType: EntitySubject['entity'] }
>;

/**
 * A stage's `subject`, picked from the protocol's own codebook.
 *
 * The schema stores the subject as `{entity, type}` while the picker speaks
 * bare type ids, and the Fresco form store has no `format`/`parse` seam of its
 * own — so this is where the two are bridged, once, rather than in every
 * section that owns a subject.
 */
export default function SubjectSelectField({
  value,
  onChange,
  entityType,
  ...props
}: SubjectSelectFieldProps) {
  return (
    <EntitySelectControl
      {...props}
      entityType={entityType}
      value={value?.type}
      onChange={(nextType) =>
        // Written out per entity rather than assembled from `entityType`: the
        // subject union discriminates on `entity`, and a computed discriminant
        // would only be a subject after a cast.
        onChange?.(
          nextType === undefined || nextType === ''
            ? undefined
            : entityType === 'node'
              ? { entity: 'node', type: nextType }
              : { entity: 'edge', type: nextType },
        )
      }
    />
  );
}
