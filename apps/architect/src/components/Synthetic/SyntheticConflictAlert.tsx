import { useId } from 'react';
import { Link } from 'wouter';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import type { ConstraintConflict } from '@codaco/protocol-utilities';
import { codebookHref } from '~/components/Codebook/deepLink';
import {
  STAGE_SECTION_SYNTHETIC,
  stageSectionHref,
} from '~/components/StageEditor/deepLink';

/**
 * One structured refusal from the feasibility gate, rendered as the engine
 * wrote it.
 *
 * The `reason` is reproduced verbatim (spec governing rule 3: the UI never
 * paraphrases a refusal) — it is the same sentence a generation run would throw
 * with, so a researcher who reads it here and then hits it in Interviewer or
 * Fresco meets one explanation rather than two. Everything around it is
 * addressing: which type and attributes the refusal is about, and which rules
 * it names.
 */

const EGO_SUBJECT_LABEL = 'Ego';
const UNNAMED_SUBJECT_LABEL = 'This type';

const OPEN_STAGE_LABEL = 'Open the stage';
const OPEN_ATTRIBUTE_LABEL = 'Open this attribute';
const OPEN_TYPE_LABEL = 'Open this type';

/**
 * Where a refusal can be answered, from the addressing it carries.
 *
 * A conflict names its owner structurally — `stageId` where one stage owns it,
 * the entity type and attribute keys otherwise — precisely so a surface can
 * route to the controls without parsing the prose written for a human. A stage
 * owns it where it says so; everything else is answered in the Codebook, at
 * the attribute the refusal is about.
 *
 * The FIRST attribute where a refusal names several: a `unique` slot exhausted
 * across two attributes is one problem, and either end of it is somewhere to
 * start.
 */
const conflictOwner = (
  conflict: ConstraintConflict,
): { href: string; label: string } | null => {
  if (conflict.stageId !== undefined) {
    return {
      href: stageSectionHref(conflict.stageId, STAGE_SECTION_SYNTHETIC),
      label: OPEN_STAGE_LABEL,
    };
  }
  // A node or edge refusal with no type key names nothing the codebook can be
  // opened at; ego needs none, since there is only one.
  if (conflict.entity !== 'ego' && conflict.entityType === undefined) {
    return null;
  }
  const subject = {
    entity: conflict.entity,
    ...(conflict.entityType === undefined ? {} : { type: conflict.entityType }),
  };
  const [variableId] = conflict.variableIds;
  return variableId === undefined
    ? { href: codebookHref(subject), label: OPEN_TYPE_LABEL }
    : { href: codebookHref(subject, variableId), label: OPEN_ATTRIBUTE_LABEL };
};

export type SyntheticConflictAlertProps = {
  conflict: ConstraintConflict;
  /**
   * Offer a link to the editor that owns this refusal.
   *
   * Opt-in because it depends on where the alert is: the Codebook's verdict
   * tells the researcher to open the stage a refusal names, and can only mean
   * it with a link. A modal — the generation dialog, the preview popup —
   * would be left standing over whatever the link opened, and a stage's own
   * section is already the place its refusals name.
   */
  linkToOwner?: boolean;
};

export function SyntheticConflictAlert({
  conflict,
  linkToOwner = false,
}: SyntheticConflictAlertProps) {
  const titleId = useId();
  const linkId = useId();
  const owner = linkToOwner ? conflictOwner(conflict) : null;
  const subject =
    conflict.entity === 'ego'
      ? EGO_SUBJECT_LABEL
      : (conflict.entityTypeName ??
        conflict.entityType ??
        UNNAMED_SUBJECT_LABEL);
  // A roster or pair refusal names no attribute at all, so the type alone is
  // the title; joining an empty list would leave a dangling separator.
  const title =
    conflict.variableNames.length === 0
      ? subject
      : `${subject}: ${conflict.variableNames.join(', ')}`;

  return (
    <Alert variant="destructive" density="compact" className="my-0">
      <AlertTitle id={titleId}>{title}</AlertTitle>
      <AlertDescription>
        <p>{conflict.reason}</p>
        {owner === null ? null : (
          <Link
            id={linkId}
            href={owner.href}
            // Named by what it opens AND by what it is about, so a reader
            // moving through a list of links does not meet the same sentence
            // once per refusal.
            aria-labelledby={`${linkId} ${titleId}`}
            className="underline"
          >
            {owner.label}
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
}

/** A stable key for a conflict, which carries no id of its own. */
export const conflictKey = (
  conflict: ConstraintConflict,
  index: number,
): string =>
  `${conflict.entity}-${conflict.entityType ?? ''}-${conflict.variableIds.join(',')}-${index}`;

export type SyntheticConflictListProps = {
  conflicts: readonly ConstraintConflict[];
};

/** Every conflict in a batch, one titled alert per refusal. */
export function SyntheticConflictList({
  conflicts,
}: SyntheticConflictListProps) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {conflicts.map((conflict, index) => (
        <li key={conflictKey(conflict, index)}>
          <SyntheticConflictAlert conflict={conflict} />
        </li>
      ))}
    </ul>
  );
}
