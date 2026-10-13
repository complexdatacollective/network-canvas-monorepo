'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useSelector } from 'react-redux';

import type {
  Codebook,
  DynamicValueRole,
  DynamicValues,
  IntrinsicDynamicValue,
  Stage,
  Variable,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { getCodebook } from '../store/modules/protocol';
import type { RootState } from '../store/store';
import type { DynamicValueSources } from './resolveDynamicText';

const DynamicValueScopeContext = createContext<DynamicValueSources | null>(
  null,
);

/**
 * The values text can show where it is rendered, or null outside a stage.
 * Read by the protocol text resolver; nothing else needs it.
 */
export const useDynamicValueSources = (): DynamicValueSources | null =>
  useContext(DynamicValueScopeContext);

const NO_BINDINGS: DynamicValues = {};
const NO_ATTRIBUTES: Readonly<Record<string, unknown>> = {};

type EntityVariables = Readonly<Record<string, Variable>> | undefined;

const subjectVariables = (
  codebook: Codebook | undefined,
  stage: Stage,
): Readonly<Record<'node' | 'edge', EntityVariables>> => {
  const subject = 'subject' in stage ? stage.subject : undefined;
  if (subject === undefined) {
    return { node: undefined, edge: undefined };
  }
  const variables =
    subject.entity === 'node'
      ? codebook?.node?.[subject.type]?.variables
      : codebook?.edge?.[subject.type]?.variables;
  return {
    node: subject.entity === 'node' ? (variables ?? {}) : undefined,
    edge: subject.entity === 'edge' ? (variables ?? {}) : undefined,
  };
};

/**
 * Supplies a stage's dynamic values to the text inside it: the stage's
 * bindings, what the interview knows about itself, and the participant's
 * attributes, read live from the network so a correction made earlier shows
 * at once. Entities the stage's interface is on are added beneath it by
 * `DynamicValueEntity`.
 *
 * `now` is when the stage was shown, so the text does not change while the
 * participant reads it.
 */
export function StageDynamicValues({
  stage,
  children,
}: {
  /** Absent where no stage is shown, which leaves text without values. */
  stage: Stage | undefined;
  children: ReactNode;
}) {
  const [now] = useState(() => new Date());
  const codebook = useSelector(getCodebook);
  const interviewId = useSelector((state: RootState) => state.session.id);
  const startedAt = useSelector((state: RootState) => state.session.startTime);
  const protocolName = useSelector((state: RootState) => state.protocol.name);
  const protocolHash = useSelector((state: RootState) => state.protocol.hash);
  const egoAttributes = useSelector(
    (state: RootState) =>
      state.session.network?.ego?.[entityAttributesProperty] ?? NO_ATTRIBUTES,
  );

  const sources = useMemo((): DynamicValueSources | null => {
    if (stage === undefined) return null;
    const variables = subjectVariables(codebook, stage);
    const intrinsics: Record<IntrinsicDynamicValue, unknown> = {
      'interview.id': interviewId,
      'interview.startedAt': startedAt,
      'protocol.name': protocolName,
      'protocol.hash': protocolHash,
      'stage.id': stage.id,
      'now': now,
    };
    return {
      bindings: stage.dynamicValues ?? NO_BINDINGS,
      intrinsics,
      attributes: { ego: egoAttributes },
      variablesFor: (role) => {
        if (role === 'ego') return codebook?.ego?.variables ?? {};
        if (role === 'edge') return variables.edge;
        return variables.node;
      },
    };
  }, [
    codebook,
    stage,
    interviewId,
    startedAt,
    protocolName,
    protocolHash,
    egoAttributes,
    now,
  ]);

  return (
    <DynamicValueScopeContext.Provider value={sources}>
      {children}
    </DynamicValueScopeContext.Provider>
  );
}

/**
 * Puts entities on screen for the text inside: the person a form describes,
 * the pair a census asks about, the focal person of a one-to-many census.
 * Their attributes are read as given, so a caller passes live values (a
 * form's answers so far over what is stored) where the text should follow
 * them. A role given `undefined` is not on screen, and its values read as
 * missing. Outside a stage it does nothing.
 */
export function DynamicValueEntity({
  attributes,
  children,
}: {
  attributes: Readonly<
    Partial<
      Record<DynamicValueRole, Readonly<Record<string, unknown>> | undefined>
    >
  >;
  children: ReactNode;
}) {
  const parent = useContext(DynamicValueScopeContext);
  const sources = useMemo(() => {
    if (parent === null) return null;
    const merged: Partial<
      Record<DynamicValueRole, Readonly<Record<string, unknown>>>
    > = { ...parent.attributes };
    for (const [role, values] of Object.entries(attributes) as [
      DynamicValueRole,
      Readonly<Record<string, unknown>> | undefined,
    ][]) {
      if (values === undefined) delete merged[role];
      else merged[role] = values;
    }
    return { ...parent, attributes: merged };
  }, [parent, attributes]);

  return (
    <DynamicValueScopeContext.Provider value={sources}>
      {children}
    </DynamicValueScopeContext.Provider>
  );
}
