import { z } from 'zod';

import type { BackgroundDocument } from '~/model/types';

// Normalized document-space values (fractions of the canvas) are bounded to
// [0, 1]; clamping out-of-range drawing back into range is the editor's job, so
// the persisted contract enforced here stays inside the coordinate system.
const normalized = z.number().finite().min(0).max(1);
const opacity = z.number().finite().min(0).max(1);
const strokeWidth = z.number().finite().min(0.25).max(20);
// Colours are baked into the exported SVG as literal fill/stroke values or as
// the theme sentinel classes, so the contract accepts only hex colours
// (3/4/6/8 digit) plus the 'text'/'background' sentinels. This blocks a
// hand-edited metadata payload from smuggling `url(...)` or other external
// references back out under the tool's own metadata banner.
const colour = z.union([
  z
    .string()
    .regex(
      /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
    ),
  z.literal('text'),
  z.literal('background'),
]);
const identifier = z.string().min(1);
const fontSize = z.enum(['small', 'medium', 'large', 'extra-large']);
const zoneLabel = z.string().nullable();

const vecSchema = z.strictObject({ x: normalized, y: normalized });

const rectElementSchema = z.strictObject({
  id: identifier,
  kind: z.literal('rect'),
  x: normalized,
  y: normalized,
  width: normalized,
  height: normalized,
  fill: colour,
  fillOpacity: opacity,
  stroke: colour.nullable(),
  strokeWidth,
  zoneLabel,
});

const ellipseElementSchema = z.strictObject({
  id: identifier,
  kind: z.literal('ellipse'),
  cx: normalized,
  cy: normalized,
  rx: normalized,
  ry: normalized,
  fill: colour,
  fillOpacity: opacity,
  stroke: colour.nullable(),
  strokeWidth,
  zoneLabel,
});

const lineElementSchema = z.strictObject({
  id: identifier,
  kind: z.literal('line'),
  x1: normalized,
  y1: normalized,
  x2: normalized,
  y2: normalized,
  stroke: colour,
  strokeWidth,
  startArrow: z.boolean(),
  endArrow: z.boolean(),
});

const polygonElementSchema = z.strictObject({
  id: identifier,
  kind: z.literal('polygon'),
  points: z.array(vecSchema).min(3),
  fill: colour,
  fillOpacity: opacity,
  stroke: colour.nullable(),
  strokeWidth,
  zoneLabel,
});

const textElementSchema = z.strictObject({
  id: identifier,
  kind: z.literal('text'),
  x: normalized,
  y: normalized,
  lines: z.array(z.string()).min(1),
  fill: colour,
  fontSize,
  fontWeight: z.union([
    z.literal(400),
    z.literal(500),
    z.literal(600),
    z.literal(700),
  ]),
  opacity,
});

const svgElementSchema = z.discriminatedUnion('kind', [
  rectElementSchema,
  ellipseElementSchema,
  lineElementSchema,
  polygonElementSchema,
  textElementSchema,
]);

// Element ids index selection, update, and delete, and become React keys, so a
// duplicate makes those operations ambiguous. Uniqueness can't be expressed on
// the per-element schema, so it is enforced document-wide here. Zone-label
// uniqueness is deliberately NOT enforced: duplicate/blank labels are normal
// while editing and are surfaced with actionable UX at export time
// (validateZoneLabels), per the design spec §5.
export const backgroundDocumentSchema = z
  .strictObject({
    version: z.literal(1),
    title: z.string(),
    description: z.string(),
    elements: z.array(svgElementSchema),
  })
  .superRefine(({ elements }, ctx) => {
    const seen = new Set<string>();
    elements.forEach((element, index) => {
      if (seen.has(element.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['elements', index, 'id'],
          message: 'Element ids must be unique',
        });
      }
      seen.add(element.id);
    });
  });

// Compile-time guarantee that the schema stays a faithful mirror of the
// hand-authored contract in types.ts. Passing a type that is not assignable to
// the constraint is a type error, so drift on either side fails `typecheck`.
type AssertExtends<A extends B, B> = A;
type _SchemaAssignableToTypes = AssertExtends<
  z.infer<typeof backgroundDocumentSchema>,
  BackgroundDocument
>;
type _TypesAssignableToSchema = AssertExtends<
  BackgroundDocument,
  z.infer<typeof backgroundDocumentSchema>
>;

export function parseBackgroundDocument(data: unknown): BackgroundDocument {
  return backgroundDocumentSchema.parse(data);
}
