import { z } from 'zod';

import { withUniqueObjectIds } from '../../../utils/protocolObjectIds.ts';
import { canvasBehavioursSchema } from '../common/behaviours.ts';
import {
  imageOrCirclesBackgroundSchema,
  NodeStageSubjectSchema,
} from '../common/index.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { entityTypeReference } from '../entity-type-reference.ts';
import { FilterSchema } from '../filters/index.ts';
import { localizedString, nonBlankText } from '../localized-string.ts';
import { protocolObjectId } from '../protocol-object-id.ts';
import { baseStageSchema } from './base.ts';

export const narrativeStage = withUniqueObjectIds(
  baseStageSchema.extend({
    type: z.literal('Narrative'),
    subject: NodeStageSubjectSchema,
    presets: z
      .array(
        z.strictObject({
          id: protocolObjectId('narrativePreset'),
          label: localizedString(nonBlankText(), {
            format: 'plain',
            lines: 'single',
          }),
          layoutVariable: entityAttributeReference({
            subject: 'stageSubject',
          }),
          groupVariable: entityAttributeReference({
            subject: 'stageSubject',
          }).optional(),
          // Which part of the network this preset shows. A Narrative has no
          // filter of its own: each preset may narrow the network differently.
          filter: FilterSchema.optional(),
          edges: z
            .strictObject({
              // Each edge type the preset draws, with the words its legend
              // shows for it: the participant never reads a type's name.
              display: z
                .array(
                  z.strictObject({
                    id: protocolObjectId('narrativePresetEdge'),
                    type: entityTypeReference({ entity: 'edge' }),
                    label: localizedString(nonBlankText(), {
                      format: 'plain',
                      lines: 'single',
                    }),
                  }),
                )
                .optional(),
            })
            .optional(),
          highlight: z
            .array(
              z.strictObject({
                id: protocolObjectId('narrativePresetHighlight'),
                variable: entityAttributeReference({ subject: 'stageSubject' }),
                label: localizedString(nonBlankText(), {
                  format: 'plain',
                  lines: 'single',
                }),
              }),
            )
            .optional(),
        }),
      )
      .min(1),
    background: imageOrCirclesBackgroundSchema,
    behaviours: canvasBehavioursSchema,
    // The interview's own words on this stage, which Network Canvas supplies
    // (`stage-wording/narrative.ts`). Each is required only while the stage
    // shows it, which the protocol checks (`missingRequiredStageSettings`): the
    // headings while a preset has the content they head. The drawing tools'
    // tooltips, which every Narrative shows alike, are interface text
    // (`interface-text-wording.ts`).
    attributesHeading: localizedString(nonBlankText(), {
      format: 'plain',
      lines: 'single',
    }).optional(),
    linksHeading: localizedString(nonBlankText(), {
      format: 'plain',
      lines: 'single',
    }).optional(),
    groupsHeading: localizedString(nonBlankText(), {
      format: 'plain',
      lines: 'single',
    }).optional(),
  }),
);
