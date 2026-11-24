import {
  collectEntityAttributeReferences,
  type EntityAttributeReferenceHit,
} from '@codaco/protocol-validation';

type Variables = Readonly<Record<string, Readonly<{ name: string }>>>;

type EntityTypes = Readonly<
  Record<string, Readonly<{ variables?: Variables }> | undefined>
>;

type ProtocolWithCodebook = {
  codebook?: Readonly<{ node?: EntityTypes; edge?: EntityTypes }>;
};

const variableIdNamedBy = (
  variables: Variables | undefined,
  column: string,
): string | undefined => {
  if (!variables || Object.hasOwn(variables, column)) return undefined;
  const target = column.normalize('NFC');
  return Object.entries(variables).find(
    ([, variable]) => variable.name.normalize('NFC') === target,
  )?.[0];
};

/**
 * Every variable reference in `protocol`, with each roster data-source column
 * resolved to the variable it fills. The interview reads a roster column as
 * the subject type's variable with that id or, failing that, with that name
 * (NFC), so a column spelled as a variable's name refers to that variable.
 */
export const collectVariableReferences = (
  protocol: ProtocolWithCodebook,
): EntityAttributeReferenceHit[] =>
  collectEntityAttributeReferences(protocol).map((hit) => {
    if (!hit.dataSourceColumn || !hit.subject || hit.subject.entity === 'ego') {
      return hit;
    }
    const variables =
      protocol.codebook?.[hit.subject.entity]?.[hit.subject.type]?.variables;
    const variableId = variableIdNamedBy(variables, hit.variableId);
    return variableId === undefined ? hit : { ...hit, variableId };
  });
