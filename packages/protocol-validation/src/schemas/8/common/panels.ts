import { z } from 'zod';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import { assetReference } from '../asset-reference.ts';
import { FilterSchema } from '../filters/index.ts';

export const panelSchema = z.strictObject({
  id: z.string(),
  title: z.string().min(1),
  filter: FilterSchema.optional(),
  // Either a manifest asset id or the sentinel naming the interview network
  // itself. `ignoreValues` keeps the sentinel out of the asset usage index.
  dataSource: z.union([
    assetReference({ ignoreValues: ['existing'] }),
    z.literal('existing'),
  ]),
});

export type Panel = z.infer<typeof panelSchema>;

/**
 * A stage's side panels, and everything true of them that reads no further
 * than the stage itself.
 *
 * Both checks live here rather than in the whole-protocol refinement because
 * neither needs the protocol: a duplicate id and an edge rule on an
 * external-data panel are visible in the stage alone. Declaring them on the
 * stage means a host validating one stage on its own — a stage editor saving
 * the stage it is editing — refuses them at that moment, instead of letting
 * them through and reporting them only when the whole protocol is validated.
 */
export const panelsSchema = z
  .array(panelSchema)
  .optional()
  .superRefine((panels, ctx) => {
    if (!panels) return;

    const duplicatePanelId = findDuplicateId(panels);
    if (duplicatePanelId) {
      ctx.addIssue({
        code: 'custom' as const,
        message: `Panels contain duplicate ID "${duplicatePanelId}"`,
        path: [],
      });
    }

    // External-data panels: filter rules must target node attributes, not
    // edges (the panel data source is a flat list of node rows).
    panels.forEach((panel, panelIndex) => {
      if (panel.dataSource === 'existing' || !panel.filter?.rules) return;
      panel.filter.rules.forEach((rule, ruleIndex) => {
        if (rule.type !== 'edge') return;
        ctx.addIssue({
          code: 'custom' as const,
          message:
            'External-data panel filters cannot use edge rules; rules must target node attributes.',
          path: [panelIndex, 'filter', 'rules', ruleIndex, 'type'],
        });
      });
    });
  });
