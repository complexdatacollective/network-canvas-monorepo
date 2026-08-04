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
import { type AbstractPedigree, buildKinshipSkeleton } from './kinship.ts';
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
};

export type GeneratedPedigree = PedigreeRenderResult & {
  /** The abstract structure, for tests and for callers that want to inspect it. */
  structure: AbstractPedigree;
};

export function generatePedigree(
  options: GeneratePedigreeOptions,
): GeneratedPedigree {
  const { rng, config, nextId, nextName, stageId } = options;
  const demography =
    options.demography ?? demographyFor(options.mode ?? 'showcase');

  const skeleton = buildKinshipSkeleton(rng, demography, options.maxPeople);
  const structure = applyParentageVariants(rng, demography, skeleton);

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

  return { ...rendered, structure };
}
