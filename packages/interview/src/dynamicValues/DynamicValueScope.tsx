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
const NO_LABELS: Readonly<Partial<Record<DynamicValueRole, string>>> = {};

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
 * bindings, today's date, and the participant's
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
  const egoAttributes = useSelector(
    (state: RootState) =>
      state.session.network?.ego?.[entityAttributesProperty] ?? NO_ATTRIBUTES,
  );

  const sources = useMemo((): DynamicValueSources | null => {
    if (stage === undefined) return null;
    const variables = subjectVariables(codebook, stage);
    const intrinsics: Record<IntrinsicDynamicValue, unknown> = { now };
    return {
      bindings: stage.dynamicValues ?? NO_BINDINGS,
      intrinsics,
      attributes: { ego: egoAttributes },
      labels: NO_LABELS,
      variablesFor: (role) => {
        if (role === 'ego') return codebook?.ego?.variables ?? {};
        if (role === 'edge') return variables.edge;
        // An edge's ends are nodes of any type, shown only by their labels.
        if (role === 'edgeFrom' || role === 'edgeTo') return undefined;
        return variables.node;
      },
    };
  }, [codebook, stage, egoAttributes, now]);

  return (
    <DynamicValueScopeContext.Provider value={sources}>
      {children}
    </DynamicValueScopeContext.Provider>
  );
}

type RoleValues<T> = Readonly<Partial<Record<DynamicValueRole, T | undefined>>>;

/**
 * The entities on screen for text, as `DynamicValueEntity` puts them there:
 * each role's attributes, and each node role's label (`useNodeLabel`).
 */
export type DynamicValueEntities = Readonly<{
  attributes?: RoleValues<Readonly<Record<string, unknown>>>;
  labels?: RoleValues<string>;
}>;

/** `values` with each role in `given` replaced, and each given undefined removed. */
const withRoles = <T,>(
  values: Readonly<Partial<Record<DynamicValueRole, T>>>,
  given: RoleValues<T> | undefined,
): Readonly<Partial<Record<DynamicValueRole, T>>> => {
  if (given === undefined) return values;
  const merged: Partial<Record<DynamicValueRole, T>> = { ...values };
  for (const [role, value] of Object.entries(given) as [
    DynamicValueRole,
    T | undefined,
  ][]) {
    if (value === undefined) delete merged[role];
    else merged[role] = value;
  }
  return merged;
};

/**
 * `sources` with `entities` on screen, for text resolved outside the React
 * tree below a `DynamicValueEntity` (a dialog opened from an event).
 */
export const withDynamicValueEntities = (
  sources: DynamicValueSources,
  { attributes, labels }: DynamicValueEntities,
): DynamicValueSources => ({
  ...sources,
  attributes: withRoles(sources.attributes, attributes),
  labels: withRoles(sources.labels, labels),
});

/**
 * Puts entities on screen for the text inside: the node a form describes,
 * the pair a census asks about, the focal node of a one-to-many census.
 * Their attributes are read as given, so a caller passes live values (a
 * form's answers so far over what is stored) where the text should follow
 * them, and each node's label as it shows it. A role given `undefined` is not
 * on screen, and its values read as missing. Outside a stage it does nothing.
 */
export function DynamicValueEntity({
  attributes,
  labels,
  children,
}: DynamicValueEntities & { children: ReactNode }) {
  const parent = useContext(DynamicValueScopeContext);
  const sources = useMemo(
    () =>
      parent === null
        ? null
        : withDynamicValueEntities(parent, { attributes, labels }),
    [parent, attributes, labels],
  );

  return (
    <DynamicValueScopeContext.Provider value={sources}>
      {children}
    </DynamicValueScopeContext.Provider>
  );
}
