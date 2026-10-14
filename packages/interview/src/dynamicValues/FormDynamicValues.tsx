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
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { RootState } from '../store/store';
import { readOwnProperty, writeOwnProperty } from '../utils/ownProperty';
import { DynamicValueEntity } from './DynamicValueScope';

const NO_ATTRIBUTES: Readonly<Record<string, unknown>> = {};

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
 * starts from the attributes it will be created with.
 *
 * Only a form about the stage's own subject does this. Validation lets a
 * field show a value of the form's entity only then, and a form about
 * another type (a Network Composer edge type's form) gets nothing.
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

  const stored = useSelector((state: RootState) => {
    if (!describesStageSubject || formSubject == null) return NO_ATTRIBUTES;
    const network = state.session.network;
    if (formSubject.entity === 'ego') {
      return network?.ego?.[entityAttributesProperty] ?? NO_ATTRIBUTES;
    }
    if (entityId === undefined) return NO_ATTRIBUTES;
    const entities =
      formSubject.entity === 'node' ? network?.nodes : network?.edges;
    return (
      entities?.find(
        (entity) => entity[entityPrimaryKeyProperty] === entityId,
      )?.[entityAttributesProperty] ?? NO_ATTRIBUTES
    );
  });
  const live = useFormValue(variables, 'opaque');
  const answered = useFormHasValue(variables, 'opaque');

  const attributes = useMemo(() => {
    if (!describesStageSubject || formSubject == null) return {};
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
    return { [ROLES[formSubject.entity]]: merged };
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

  return (
    <DynamicValueEntity attributes={attributes}>{children}</DynamicValueEntity>
  );
}
