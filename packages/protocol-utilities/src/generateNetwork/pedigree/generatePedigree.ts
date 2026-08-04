/**
 * Generates a family pedigree: demography, then parentage variants, then
 * disease transmission, then rendering.
 *
 * Entirely separate from the generic attribute machinery, because a pedigree's
 * variables are not attributes that happen to live on a person. They are a
 * relational data model in which sex, gamete role, relationship type and the
 * edge topology constrain one another. Filling those slots independently — as
 * the general generator must, knowing nothing of the model — cannot produce a
 * pedigree; it produces people with impossible sexes, several probands, and
 * children with one parent.
 */

import {
  demographyFor,
  type PedigreeDemography,
  type PedigreeMode,
  type Rng,
} from './demography.ts';
import { computeAffected, type InheritancePattern } from './inheritance.ts';
import {
  type AbstractPedigree,
  buildKinshipSkeleton,
  type PedigreeBoundaries,
} from './kinship.ts';
import {
  type PedigreeRenderResult,
  type PedigreeVariableConfig,
  renderPedigree,
} from './render.ts';
import { applyParentageVariants } from './variants.ts';

export type PedigreeNomination = {
  /** The boolean node variable a nomination prompt writes. */
  variable: string;
  /**
   * How the condition is transmitted.
   *
   * Read from the `NarrativePedigree` stage that renders this pedigree where
   * one exists, so the generated data matches what will actually be drawn. A
   * dominant pathway rendered under a recessive model looks broken, and the
   * fault would appear to lie with the interface.
   */
  inheritancePattern: InheritancePattern;
};

export type GeneratePedigreeOptions = {
  rng: Rng;
  mode?: PedigreeMode;
  demography?: PedigreeDemography;
  config: PedigreeVariableConfig;
  nominations?: PedigreeNomination[];
  nextId: () => string;
  nextName: () => string;
  stageId: string;
  /** Upper bound on people, so feasibility can count a worst case. */
  maxPeople?: number;
  /**
   * The stage's own completeness boundaries. A `required` boundary is what the
   * interface refuses to finalize without, so it is the only thing that forces
   * the generator to draw a branch it would otherwise sample.
   */
  boundaries?: PedigreeBoundaries;
  /** The framing the stage fixed, or the participant chose, for the metadata. */
  selectedFraming?: string;
};

export type GeneratedPedigree = PedigreeRenderResult & {
  /** The abstract structure, for tests and for callers that want to inspect it. */
  structure: AbstractPedigree;
};

/**
 * Everyone a `required` boundary inspects, and so everyone the variant pass
 * must leave alone. Ego's own ancestors are already excluded by the variant
 * pass itself; this adds the descent `requireChildrenContributors` reaches —
 * each child, its other parent, and that parent's two generations.
 */
function boundaryProtected(
  pedigree: AbstractPedigree,
  boundaries: GeneratePedigreeOptions['boundaries'],
): Set<string> {
  const protect = new Set<string>();
  if (boundaries?.requireChildrenContributors !== 'required') return protect;

  const ascend = (id: string): void => {
    for (const link of pedigree.parents.get(id) ?? []) {
      if (protect.has(link.parent)) continue;
      protect.add(link.parent);
      ascend(link.parent);
    }
  };

  for (const [childId, links] of pedigree.parents) {
    if (!links.some((link) => link.parent === pedigree.egoId)) continue;
    protect.add(childId);
    for (const link of links) {
      protect.add(link.parent);
      ascend(link.parent);
    }
  }

  return protect;
}

export function generatePedigree(
  options: GeneratePedigreeOptions,
): GeneratedPedigree {
  const { rng, config, nextId, nextName, stageId } = options;
  const demography =
    options.demography ?? demographyFor(options.mode ?? 'showcase');

  const skeleton = buildKinshipSkeleton(rng, demography, {
    maxPeople: options.maxPeople,
    boundaries: options.boundaries,
  });
  const structure = applyParentageVariants(
    rng,
    demography,
    skeleton,
    boundaryProtected(skeleton, options.boundaries),
  );

  // Re-settle the children affirmation after the variant pass. The interface
  // counts only *genetic* children toward `requireChildrenContributors`, and an
  // adoption strips exactly those links — so a pedigree whose only children are
  // adopted has to affirm having none, or the interface will not finalize it.
  if (options.boundaries?.requireChildrenContributors === 'required') {
    const hasGeneticChild = [...structure.parents.values()].some((links) =>
      links.some(
        (link) =>
          link.parent === structure.egoId &&
          (link.relationshipType === 'biological' ||
            link.relationshipType === 'donor'),
      ),
    );
    if (!hasGeneticChild) structure.noChildrenAffirmed = true;
  }

  const nominations = (options.nominations ?? []).map((nomination) => ({
    variable: nomination.variable,
    affected: computeAffected(rng, structure, nomination.inheritancePattern),
  }));

  const rendered = renderPedigree({
    rng,
    demography,
    pedigree: structure,
    config,
    nextId,
    nextName,
    nominations,
    stageId,
  });

  return {
    ...rendered,
    metadata: {
      ...rendered.metadata,
      noChildrenAffirmed: structure.noChildrenAffirmed,
      ...(options.selectedFraming === undefined
        ? {}
        : { selectedFraming: options.selectedFraming }),
    },
    structure,
  };
}
