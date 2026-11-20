import { z } from 'zod';

import { assetReference } from '../asset-reference.ts';
import { FilterSchema } from '../filters/index.ts';
import { localizedString, nonBlankText } from '../localized-string.ts';
import { protocolObjectId } from '../protocol-object-id.ts';

export const panelSchema = z.strictObject({
  id: protocolObjectId('panel'),
  title: localizedString(
    nonBlankText(),
    { format: 'plain', lines: 'single' },
    {
      dynamicValues: 'stageText',
    },
  ),
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
 * The edge-rule check lives here rather than in the whole-protocol refinement
 * because it needs only the stage: a host validating one stage on its own (a
 * stage editor saving the stage it is editing) refuses it at that moment,
 * instead of letting it through until the whole protocol is validated.
 */
export const panelsSchema = z
  .array(panelSchema)
  .optional()
  .superRefine((panels, ctx) => {
    if (!panels) return;

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
