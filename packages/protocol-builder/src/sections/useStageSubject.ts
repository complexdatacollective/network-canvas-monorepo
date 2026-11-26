import { useMemo } from 'react';

import { useStageValue } from '../form/stageFormHooks.ts';
import type { CodebookSubject } from '../protocol-context.ts';

/** Which part of the network a section's codebook reads belong to. */
export type SubjectEntity = 'node' | 'edge' | 'ego';

const fieldOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;

/**
 * The node types a draft subject lists, or `undefined` while the stage has no
 * node subject or its list is empty or holds anything but type ids.
 */
export function draftSubjectNodeTypes(
  subject: unknown,
): readonly string[] | undefined {
  if (fieldOf(subject, 'entity') !== 'node') return undefined;
  const types = fieldOf(subject, 'types');
  if (!Array.isArray(types) || types.length === 0) return undefined;
  const ids = types.filter(
    (type): type is string => typeof type === 'string' && type !== '',
  );
  return ids.length === types.length ? ids : undefined;
}

/**
 * The node types this stage is currently configured against, read from the
 * live draft. `undefined` means none chosen yet.
 */
export function useStageNodeTypes(): readonly string[] | undefined {
  const value = useStageValue('subject');
  return useMemo(() => draftSubjectNodeTypes(value), [value]);
}

/**
 * The stage's node type when its draft subject lists exactly one, which every
 * stage does while each stage type runs a single node type.
 */
export function useSingleStageNodeType(): string | undefined {
  const types = useStageNodeTypes();
  return types?.length === 1 ? types[0] : undefined;
}

/**
 * The codebook subject this stage is currently configured against.
 *
 * `undefined` means "not chosen yet", which is a real state a section has to
 * render: a form-fields list on a brand-new Name Generator has no codebook to
 * draw attributes from, and offering an empty picker would suggest the
 * protocol has no attributes rather than that the stage has no type.
 *
 * Ego is never undefined. An ego stage's subject is fixed by the interface
 * rather than authored, so there is nothing to wait for — see the schema's
 * `withStageSubjectResolution({ from: 'ego' })`.
 *
 * A node stage resolves to its single node type (`useSingleStageNodeType`).
 *
 * Read from the live draft rather than the committed stage, so a type the
 * researcher has just chosen (or just created) takes effect without saving.
 */
export function useStageSubject(
  entity: SubjectEntity,
): CodebookSubject | undefined {
  const value = useStageValue('subject');
  const nodeType = useSingleStageNodeType();

  return useMemo(() => {
    if (entity === 'ego') return { entity: 'ego' };
    if (entity === 'node') {
      return nodeType === undefined
        ? undefined
        : { entity: 'node', type: nodeType };
    }
    const type = fieldOf(value, 'type');
    if (typeof type !== 'string' || type === '') return undefined;
    return { entity: 'edge', type };
  }, [entity, nodeType, value]);
}
