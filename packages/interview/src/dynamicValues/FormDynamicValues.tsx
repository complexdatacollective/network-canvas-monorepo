'use client';

import { type ReactNode, useMemo } from 'react';
import { useSelector } from 'react-redux';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import {
  useFormHasValue,
  useFormValue,
} from '@codaco/fresco-ui/form/hooks/useFormValue';
import type {
  DynamicValueRole,
  StageSubject,
} from '@codaco/protocol-validation';
import {
  edgeSourceProperty,
  edgeTargetProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { useNodeLabel } from '../interfaces/Anonymisation/useNodeLabel';
import type { RootState } from '../store/store';
import { readOwnProperty, writeOwnProperty } from '../utils/ownProperty';
import { DynamicValueEntity } from './DynamicValueScope';

const NO_ATTRIBUTES: Readonly<Record<string, unknown>> = {};

/**
 * The answers a node's label can be read from: text and numbers, and the
 * stored ciphertext of an encrypted one. No other kind of answer is ever a
 * node's label.
 */
const labelAttributes = (
  attributes: Readonly<Record<string, unknown>>,
): Record<string, string | number | number[]> =>
  Object.fromEntries(
    Object.entries(attributes).filter(
      (entry): entry is [string, string | number | number[]] => {
        const value: unknown = entry[1];
        return (
          typeof value === 'string' ||
          typeof value === 'number' ||
          (Array.isArray(value) &&
            value.every((item) => typeof item === 'number'))
        );
      },
    ),
  );

const nodeWithId = (state: RootState, id: string | undefined) =>
  id === undefined
    ? undefined
    : state.session.network?.nodes.find(
        (node) => node[entityPrimaryKeyProperty] === id,
      );

const ROLES: Readonly<Record<StageSubject['entity'], DynamicValueRole>> = {
  ego: 'ego',
  node: 'node',
  edge: 'edge',
};

/**
 * Puts the entity a form describes on screen for its fields' text, with the
 * participant's answers so far over what is stored: a caption can name an
 * answer given in an earlier field of the same form as soon as it is given,
 * or in a control the form's interface asks before its fields. A new entity
 * starts from the attributes it will be created with. A node is also on
 * screen by its label, which follows those answers too, as the node will
 * show it.
 *
 * Only a form about the stage's own subject puts its entity on screen.
 * Validation lets a field show a value of the form's entity only then, and a
 * form about another type (a Network Composer edge type's form) gets only
 * what follows. A form about a stored edge puts the two nodes it joins on
 * screen by their labels.
 */
export function FormDynamicValues({
  formSubject,
  stageSubject,
  entityId,
  initialValues,
  variables,
  newEntityAttributes,
  coerce,
  children,
}: {
  formSubject: StageSubject | null | undefined;
  /** Absent where the form is not on a stage. */
  stageSubject: StageSubject | null | undefined;
  /** The node or edge the form edits, when it edits a stored one. */
  entityId: string | undefined;
  initialValues: Readonly<Record<string, FieldValue>> | undefined;
  /**
   * The variables the form writes: its fields', and those of any control
   * its interface asks before them.
   */
  variables: readonly string[];
  /**
   * What a new entity is created with besides the form's answers (a Name
   * Generator prompt's additional attributes). Ignored for a stored one.
   */
  newEntityAttributes?: Readonly<Record<string, unknown>>;
  /** Turns raw answers into stored values, as submitting does. */
  coerce: (values: Record<string, FieldValue>) => Record<string, FieldValue>;
  children: ReactNode;
}) {
  const describesStageSubject =
    formSubject != null &&
    stageSubject != null &&
    formSubject.entity === stageSubject.entity &&
    (formSubject.entity === 'ego' ||
      (stageSubject.entity !== 'ego' &&
        formSubject.type === stageSubject.type));

  const storedNode = useSelector((state: RootState) =>
    formSubject?.entity === 'node' ? nodeWithId(state, entityId) : undefined,
  );
  const storedEdge = useSelector((state: RootState): NcEdge | undefined =>
    formSubject?.entity === 'edge' && entityId !== undefined
      ? state.session.network?.edges.find(
          (edge) => edge[entityPrimaryKeyProperty] === entityId,
        )
      : undefined,
  );
  const storedEgo = useSelector((state: RootState) =>
    formSubject?.entity === 'ego'
      ? state.session.network?.ego?.[entityAttributesProperty]
      : undefined,
  );
  const stored =
    (formSubject?.entity === 'ego'
      ? storedEgo
      : (storedNode ?? storedEdge)?.[entityAttributesProperty]) ??
    NO_ATTRIBUTES;
  const fromNode = useSelector((state: RootState) =>
    nodeWithId(state, storedEdge?.[edgeSourceProperty]),
  );
  const toNode = useSelector((state: RootState) =>
    nodeWithId(state, storedEdge?.[edgeTargetProperty]),
  );
  const live = useFormValue(variables, 'opaque');
  const answered = useFormHasValue(variables, 'opaque');

  const liveAttributes = useMemo(() => {
    if (!describesStageSubject || formSubject == null) return undefined;
    // Attribute ids come from the protocol and may be `__proto__`, so every
    // key is written as the record's own.
    const merged: Record<string, unknown> = {
      ...(entityId === undefined ? newEntityAttributes : undefined),
      ...stored,
      ...initialValues,
    };
    const answers: Record<string, FieldValue> = {};
    const cleared: string[] = [];
    for (const variable of variables) {
      if (readOwnProperty(answered, variable) !== true) continue;
      const answer = readOwnProperty(live, variable);
      if (answer === undefined) cleared.push(variable);
      else writeOwnProperty(answers, variable, answer);
    }
    for (const [variable, value] of Object.entries(coerce(answers))) {
      writeOwnProperty(merged, variable, value);
    }
    // An answer the participant has emptied is missing, not what is stored.
    for (const variable of cleared) {
      writeOwnProperty(merged, variable, undefined);
    }
    return merged;
  }, [
    describesStageSubject,
    formSubject,
    stored,
    entityId,
    newEntityAttributes,
    initialValues,
    variables,
    live,
    answered,
    coerce,
  ]);

  // The node as it will be saved, which a new one is not yet.
  const liveNode = useMemo((): NcNode | undefined => {
    if (liveAttributes === undefined || formSubject?.entity !== 'node') {
      return undefined;
    }
    return {
      ...storedNode,
      [entityPrimaryKeyProperty]: entityId ?? '',
      type: formSubject.type,
      [entityAttributesProperty]: labelAttributes(liveAttributes),
    };
  }, [liveAttributes, formSubject, storedNode, entityId]);
  const nodeLabel = useNodeLabel(liveNode);
  const fromLabel = useNodeLabel(fromNode);
  const toLabel = useNodeLabel(toNode);

  const entities = useMemo(
    () => ({
      attributes:
        liveAttributes === undefined || formSubject == null
          ? {}
          : { [ROLES[formSubject.entity]]: liveAttributes },
      labels: {
        ...(nodeLabel !== undefined && { node: nodeLabel }),
        ...(fromLabel !== undefined && { edgeFrom: fromLabel }),
        ...(toLabel !== undefined && { edgeTo: toLabel }),
      },
    }),
    [liveAttributes, formSubject, nodeLabel, fromLabel, toLabel],
  );

  return <DynamicValueEntity {...entities}>{children}</DynamicValueEntity>;
}
