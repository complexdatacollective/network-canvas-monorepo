import {
  type EdgeColor,
  EdgeColorSequence,
  type EntityDefinition,
  type NodeColor,
  NodeColorSequence,
} from '@codaco/protocol-validation';
import { normalizeCodebookName } from '@codaco/shared-consts';

/** The colour the next type of `entity` takes when `typeCount` already exist. */
function categoryColorAt(
  entity: 'node' | 'edge' | 'ego',
  typeCount: number,
): NodeColor | EdgeColor {
  // Wrapped around when the count exceeds the palette size.
  if (entity === 'node') {
    return (
      NodeColorSequence[typeCount % NodeColorSequence.length] ??
      NodeColorSequence[0]
    );
  }

  return (
    EdgeColorSequence[typeCount % EdgeColorSequence.length] ??
    EdgeColorSequence[0]
  );
}

const defaultTypeTemplate: Partial<EntityDefinition> = {
  variables: {},
};

// Names are saved normalized (`normalizeCodebookName`), whatever the editor
// that wrote them let through.
export const normalizedName = (name: unknown) =>
  typeof name === 'string' ? { name: normalizeCodebookName(name) } : {};

/**
 * A codebook entity definition as the codebook stores it. Every write of one
 * goes through here, so a definition carried with a stage is stored exactly as
 * a direct codebook write would store it.
 *
 * `existingTypeCount` is the number of types of this entity the codebook holds
 * when the definition is for a type it does not hold yet (a new node type
 * takes the default template, a new connection type takes the next category
 * colour unless it names one; the ego definition takes neither), and
 * `undefined` for a type it already holds: only the name is normalised.
 */
export function definitionAsStored<T extends Partial<EntityDefinition>>(
  entity: 'node' | 'edge' | 'ego',
  definition: T,
  existingTypeCount?: number,
): T {
  const named = {
    ...definition,
    ...normalizedName('name' in definition ? definition.name : undefined),
  };
  if (existingTypeCount === undefined) return named;
  if (entity === 'node') return { ...defaultTypeTemplate, ...named };
  if (entity === 'edge' && !('color' in named && named.color)) {
    return { ...named, color: categoryColorAt('edge', existingTypeCount) };
  }
  return named;
}
