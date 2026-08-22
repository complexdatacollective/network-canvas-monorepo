import type { CurrentProtocol } from '@codaco/protocol-validation';

/**
 * Finding a codebook entry a spec created THROUGH THE UI.
 *
 * `createTypeAsync`/`createVariableAsync` key the codebook by a generated
 * uuid, not by the name the researcher typed — so a spec that built its own
 * node type cannot look it up by that name as a key. Reading the pair back
 * (the key AND the definition) is what lets an assertion name both the type and
 * the attributes hanging off it.
 *
 * It THROWS when it finds nothing, rather than returning a sentinel: a lookup
 * that quietly resolved to `undefined` would turn every assertion built on it
 * into a claim about nothing.
 */

type NodeTypes = NonNullable<CurrentProtocol['codebook']['node']>;
type NodeDefinition = NodeTypes[string];
type CodebookVariables = NonNullable<NodeDefinition['variables']>;

export type NodeTypeEntry = {
  /** The codebook key — the uuid a deep link and a stage subject name. */
  typeId: string;
  definition: NodeDefinition;
  /** Empty where the type has no attributes yet, never `undefined`. */
  variables: CodebookVariables;
};

export function nodeTypeByName(
  protocol: CurrentProtocol,
  name: string,
): NodeTypeEntry {
  const entry = Object.entries(protocol.codebook.node ?? {}).find(
    ([, definition]) => definition.name === name,
  );
  if (!entry) {
    throw new Error(
      `no node type named "${name}" in ${JSON.stringify(
        Object.values(protocol.codebook.node ?? {}).map(
          (definition) => definition.name,
        ),
      )}`,
    );
  }
  const [typeId, definition] = entry;
  return { typeId, definition, variables: definition.variables ?? {} };
}
