import { z } from 'zod';

import { assetReference } from '../asset-reference.ts';
import { type Filter, FilterSchema } from '../filters/index.ts';
import {
  type PanelSynthetic,
  PanelSyntheticSchema,
} from '../synthetic/index.ts';

/**
 * The descriptor an existing-network panel that declares none is read as
 * having.
 *
 * `.prefault({})` rather than `.default({})`. In Zod 4 an outer `.default()`
 * SHORT-CIRCUITS: given an absent value it hands back the literal it was
 * given, unparsed, so no field-level default inside ever fires and the panel
 * would come out carrying `{}` with no odds at all. `.prefault()` substitutes
 * and then parses, which is what puts `nominationProbability` there.
 *
 * Applied in the transform below rather than on the field, because only an
 * existing-network panel gets one — see the refusal.
 */
const resolvedPanelSynthetic = PanelSyntheticSchema.prefault({});

/**
 * Either a manifest asset id or the sentinel naming the interview network
 * itself. `ignoreValues` keeps the sentinel out of the asset usage index.
 *
 * Named so the hand-written `Panel` below can infer `dataSource` from it
 * rather than restate it: spelling the type by hand is what would let the
 * schema's tagging and the exported type drift apart.
 */
const PanelDataSourceSchema = z.union([
  assetReference({ ignoreValues: ['existing'] }),
  z.literal('existing'),
]);

/**
 * A parsed panel. Named rather than inferred so the transform below states
 * what it produces: `synthetic` is present on an existing-network panel and
 * absent everywhere else, which no inference over the two branches would say
 * as plainly.
 */
export type Panel = {
  id: string;
  title: string;
  filter?: Filter;
  dataSource: z.infer<typeof PanelDataSourceSchema>;
  synthetic?: PanelSynthetic;
};

export const panelSchema = z
  .strictObject({
    id: z.string(),
    title: z.string().min(1),
    filter: FilterSchema.optional(),
    dataSource: PanelDataSourceSchema,
    synthetic: PanelSyntheticSchema.optional(),
  })
  .superRefine((panel, ctx) => {
    // Only an existing-network panel decides person by person. A roster
    // panel's contribution is budget-driven — the participant works down a
    // list and how far they get is drawn once for the whole stage — so
    // per-candidate odds set on one could never be consulted.
    //
    // Refused rather than ignored, for the same reason an option weight
    // naming a value the variable does not offer is refused, or a
    // `probabilityTrue` on a one-sided boolean: metadata that can never take
    // effect is better rejected than quietly dropped, because the author
    // wrote it expecting it to do something.
    //
    // This reads the AUTHORED value. The field carries no default of its own,
    // so it is absent here unless a human wrote it, and the resolved default
    // is applied by the transform below — after this check has already run.
    // Were the order reversed, every roster panel in every protocol would be
    // refused for metadata the schema itself had just put there.
    if (panel.dataSource !== 'existing' && panel.synthetic !== undefined) {
      ctx.addIssue({
        code: 'custom' as const,
        message:
          'Synthetic nomination odds apply only to a panel whose dataSource is "existing"',
        path: ['synthetic'],
      });
    }
  })
  .transform((panel): Panel =>
    panel.dataSource === 'existing'
      ? { ...panel, synthetic: resolvedPanelSynthetic.parse(panel.synthetic) }
      : panel,
  );
