import { useMemo } from 'react';

import { useStageValue } from '../form/stageFormHooks.ts';
import type { CodebookSubject } from '../protocol-context.ts';

/** Which part of the network a section's codebook reads belong to. */
export type SubjectEntity = 'node' | 'edge' | 'ego';

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
 * Read from the live draft rather than the committed stage, so a type the
 * researcher has just chosen (or just created) takes effect without saving.
 *
 * `typePath` is for the stages that name their entity type somewhere other
 * than `subject`, holding a bare type id rather than a subject object — a
 * Family Pedigree names its node type at `nodeConfig.type`. The schema says
 * the same thing about those stages in its own terms
 * (`withStageSubjectResolution({ from: 'stagePath', path: [...] })`), and a
 * section handed the wrong place to look would draw a picker from an empty
 * codebook rather than fail.
 */
export function useStageSubject(
  entity: SubjectEntity,
  typePath?: string,
): CodebookSubject | undefined {
  const value = useStageValue(typePath ?? 'subject');

  return useMemo(() => {
    if (entity === 'ego') return { entity: 'ego' };
    const type =
      typePath === undefined
        ? typeof value === 'object' && value !== null
          ? Reflect.get(value, 'type')
          : undefined
        : value;
    if (typeof type !== 'string' || type === '') return undefined;
    return entity === 'node'
      ? { entity: 'node', type }
      : { entity: 'edge', type };
  }, [entity, typePath, value]);
}
