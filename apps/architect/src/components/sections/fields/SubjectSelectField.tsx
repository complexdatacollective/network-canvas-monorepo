import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import type { StageSubject } from '@codaco/protocol-validation';

import { EntitySelectControl } from './EntitySelectField/EntitySelectField';

/** The node/edge members of the subject union — ego subjects carry no type. */
export type EntitySubject = Extract<StageSubject, { type: string }>;

type SubjectSelectFieldProps = CreateFormFieldProps<
  EntitySubject,
  'div',
  {
    entityType: EntitySubject['entity'];
    promptBeforeChange?: string | null;
    blockChangeReason?: string | null;
  }
>;

/**
 * A stage's `subject` is stored as `{entity, type}` but the picker speaks bare
 * type ids, so this field bridges the two — the fresco-ui form store has no
 * `format`/`parse` hook of its own.
 */
const SubjectSelectField = ({
  value,
  onChange,
  entityType,
  ...props
}: SubjectSelectFieldProps) => (
  <EntitySelectControl
    {...props}
    entityType={entityType}
    value={value?.type}
    onChange={(nextType) =>
      onChange?.(
        nextType == null
          ? undefined
          : ({ entity: entityType, type: nextType } as EntitySubject),
      )
    }
  />
);

export default SubjectSelectField;
