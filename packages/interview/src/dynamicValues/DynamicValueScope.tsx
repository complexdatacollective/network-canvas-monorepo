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
  IntrinsicDynamicValue,
  Stage,
  Variable,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import {
  EMPTY_CONNECTIVITY,
  getConnectivityIndex,
} from '../nodeLabels/connectivity';
import { getCodebook } from '../store/modules/protocol';
import type { RootState } from '../store/store';
import { conditionReadsNetwork } from './conditions';
import {
  type DynamicValueSources,
  showsDynamicValues,
} from './resolveDynamicText';

const DynamicValueScopeContext = createContext<DynamicValueSources | null>(
  null,
);

/**
 * The values text can show where it is rendered, or null outside a stage.
 * Read by the protocol text resolver; nothing else needs it.
 */
export const useDynamicValueSources = (): DynamicValueSources | null =>
  useContext(DynamicValueScopeContext);

const StageShowsValuesContext = createContext(false);

/**
 * Whether any of the stage's text shows or chooses its wording by a value.
 * A form follows its answers as they are given only on such a stage, since
 * nothing else would read them.
 */
export const useStageShowsDynamicValues = (): boolean =>
  useContext(StageShowsValuesContext);

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
 * Supplies a stage's dynamic values to the text inside it: today's date, the
 * participant's attributes and the stage's conditions, read live from the
 * network so a correction made earlier shows at once. Entities the stage's
 * interface is on are added beneath it by `DynamicValueEntity`.
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

  // Followed only by a stage whose conditions ask about edges, so that text
  // elsewhere is not read again each time the network changes.
  const readsNetwork = useMemo(
    () => Object.values(stage?.conditions ?? {}).some(conditionReadsNetwork),
    [stage],
  );
  const connectivity = useSelector((state: RootState) =>
    readsNetwork ? getConnectivityIndex(state) : EMPTY_CONNECTIVITY,
  );

  const sources = useMemo((): DynamicValueSources | null => {
    if (stage === undefined) return null;
    const variables = subjectVariables(codebook, stage);
    const intrinsics: Record<IntrinsicDynamicValue, unknown> = { now };
    const subject = 'subject' in stage ? stage.subject : undefined;
    return {
      intrinsics,
      attributes: { ego: egoAttributes },
      labels: NO_LABELS,
      conditions: stage.conditions,
      nodeType: subject?.entity === 'node' ? subject.type : undefined,
      connectivity,
      variablesFor: (role) => {
        if (role === 'ego') return codebook?.ego?.variables ?? {};
        if (role === 'edge') return variables.edge;
        // An edge's ends are nodes of any type, shown only by their labels.
        if (role === 'edgeFrom' || role === 'edgeTo') return undefined;
        return variables.node;
      },
    };
  }, [codebook, stage, egoAttributes, now, connectivity]);
  const showsValues = useMemo(
    () => stage !== undefined && showsDynamicValues(stage),
    [stage],
  );

  return (
    <StageShowsValuesContext.Provider value={showsValues}>
      <DynamicValueScopeContext.Provider value={sources}>
        {children}
      </DynamicValueScopeContext.Provider>
    </StageShowsValuesContext.Provider>
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
  /**
   * The id of each entity that is saved in the network, which a condition
   * that asks about a node's edges finds them by. One not saved yet (a node
   * a form is adding) has none, and so no edges.
   */
  ids?: RoleValues<string>;
  /** Whether each node that may be the participant is. */
  participants?: RoleValues<boolean>;
}>;

/** `values` with each role in `given` replaced, and each given undefined removed. */
const withRoles = <T,>(
  values: Readonly<Partial<Record<DynamicValueRole, T>>>,
  given: RoleValues<T> | undefined,
): Readonly<Partial<Record<DynamicValueRole, T>>> => {
  if (given === undefined) return values;
  const merged: Partial<Record<DynamicValueRole, T>> = { ...values };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- RoleValues is keyed only by DynamicValueRole, which Object.entries types as string
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
  { attributes, labels, ids, participants }: DynamicValueEntities,
): DynamicValueSources => ({
  ...sources,
  attributes: withRoles(sources.attributes, attributes),
  labels: withRoles(sources.labels, labels),
  entityIds: withRoles(sources.entityIds ?? {}, ids),
  participants: withRoles(sources.participants ?? {}, participants),
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
  ids,
  participants,
  children,
}: DynamicValueEntities & { children: ReactNode }) {
  const parent = useContext(DynamicValueScopeContext);
  const sources = useMemo(
    () =>
      parent === null
        ? null
        : withDynamicValueEntities(parent, {
            attributes,
            labels,
            ids,
            participants,
          }),
    [parent, attributes, labels, ids, participants],
  );

  return (
    <DynamicValueScopeContext.Provider value={sources}>
      {children}
    </DynamicValueScopeContext.Provider>
  );
}
