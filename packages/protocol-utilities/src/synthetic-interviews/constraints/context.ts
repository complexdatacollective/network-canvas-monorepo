import type { StructuralCodebook } from '@codaco/protocol-validation';

import type { UniqueRegistry } from './uniqueRegistry';
import type { ValueGenerator } from './ValueGenerator';

/**
 * Everything constrained value generation needs to draw one entity's
 * attributes.
 *
 * Deliberately narrower than the deleted engine's context, which also carried
 * a `GenerationConfig` of default counts and edge probabilities. Those now
 * live in the v8 schema as resolved `synthetic` descriptors, or in this
 * package's own constants — keeping a second set here would be the duplicate
 * source of truth that consolidation removed.
 */
export type GenerationContext = {
  codebook: StructuralCodebook;
  valueGen: ValueGenerator;
  /**
   * Values already issued for `unique` variables. Shared across an entire
   * interview rather than per entity or per stage: a `unique` variable is
   * unique within its scope for the whole session.
   */
  uniqueRegistry: UniqueRegistry;
};
