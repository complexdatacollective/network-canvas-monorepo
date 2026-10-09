import { z } from 'zod';

import { findDuplicateId } from '../../../utils/validation-helpers.ts';
import { assetReference } from '../asset-reference.ts';
import { ColorReferenceSchema } from '../color-reference.ts';
import {
  geospatialPromptSchema,
  NodeStageSubjectSchema,
} from '../common/index.ts';
import { FilterSchema } from '../filters/index.ts';
import { localizedString, nonBlankText } from '../localized-string.ts';
import {
  hasMapSearch,
  requireWhenShown,
  type StageRecord,
} from '../stage-wording/conditions.ts';
import { baseStageSchema } from './base.ts';

const mapboxStyleOptions = [
  { label: 'Standard', value: 'mapbox://styles/mapbox/standard' },
  {
    label: 'Standard Satellite',
    value: 'mapbox://styles/mapbox/standard-satellite',
  },
  { label: 'Streets', value: 'mapbox://styles/mapbox/streets-v12' },
  { label: 'Outdoors', value: 'mapbox://styles/mapbox/outdoors-v12' },
  { label: 'Light', value: 'mapbox://styles/mapbox/light-v11' },
  { label: 'Dark', value: 'mapbox://styles/mapbox/dark-v11' },
  { label: 'Satellite', value: 'mapbox://styles/mapbox/satellite-v9' },
  {
    label: 'Satellite Streets',
    value: 'mapbox://styles/mapbox/satellite-streets-v12',
  },
  {
    label: 'Navigation Day',
    value: 'mapbox://styles/mapbox/navigation-day-v1',
  },
  {
    label: 'Navigation Night',
    value: 'mapbox://styles/mapbox/navigation-night-v1',
  },
];

const styleOptions = z.enum(
  mapboxStyleOptions.map((option) => option.value) as [string, ...string[]],
);

const mapOptions = z.strictObject({
  tokenAssetId: assetReference(),
  style: styleOptions,
  center: z.tuple([z.number(), z.number()]),
  initialZoom: z
    .number()
    .min(0, { message: 'Zoom must be at least 0' })
    .max(22, { message: 'Zoom must be less than or equal to 22' }),
  dataSourceAssetId: assetReference(),
  color: ColorReferenceSchema,
  targetFeatureProperty: z
    .string()
    .min(1, { message: 'Target feature property must not be empty' }), // property of geojson to select
  showTransit: z.boolean().optional(),
  allowSearch: z.boolean().optional(),
});

export type MapOptions = z.infer<typeof mapOptions>;

/**
 * The map's own words (`stage-wording/geospatial.ts`). The map is always
 * shown, so its notices are always required; the search's words are required
 * only while the map has a search.
 */
const geospatialWording = {
  offlineNotice: localizedString(nonBlankText(), 'plain'),
  mapUnavailable: localizedString(nonBlankText(), 'plain'),
  outsideAreasLabel: localizedString(nonBlankText(), 'plain'),
  searchLabel: localizedString(nonBlankText(), 'plain').optional(),
  searchNoMatch: localizedString(nonBlankText(), 'plain').optional(),
  searchFailed: localizedString(nonBlankText(), 'plain').optional(),
};

const requireGeospatialWording = (stage: StageRecord, ctx: z.RefinementCtx) =>
  requireWhenShown(stage, ctx, [
    {
      name: 'searchLabel',
      when: hasMapSearch,
      message: 'A map with a search needs a search label.',
    },
    {
      name: 'searchNoMatch',
      when: hasMapSearch,
      message: 'A map with a search needs a no-match notice.',
    },
    {
      name: 'searchFailed',
      when: hasMapSearch,
      message: 'A map with a search needs a search-failed notice.',
    },
  ]);

export const geospatialStage = baseStageSchema
  .extend({
    type: z.literal('Geospatial'),
    subject: NodeStageSubjectSchema,
    filter: FilterSchema.optional(),
    mapOptions: mapOptions,
    ...geospatialWording,
    prompts: z
      .array(geospatialPromptSchema)
      .min(1)
      .superRefine((prompts, ctx) => {
        // Check for duplicate prompt IDs
        const duplicatePromptId = findDuplicateId(prompts);
        if (duplicatePromptId) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `Prompts contain duplicate ID "${duplicatePromptId}"`,
            path: [],
          });
        }
      }),
  })
  .superRefine(requireGeospatialWording);
