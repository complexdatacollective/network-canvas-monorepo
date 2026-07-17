import { z } from 'zod';

import type { BackgroundDocument } from '~/model/types';

// Normalized document-space values (fractions of the canvas) are bounded to
// [0, 1]; clamping out-of-range drawing back into range is the editor's job, so
// the persisted contract enforced here stays inside the coordinate system.
const normalized = z.number().finite().min(0).max(1);
const opacity = z.number().finite().min(0).max(1);
const strokeWidth = z.number().finite().min(0.25).max(20);
// Colours are baked into the exported SVG as literal fill/stroke values, so the
// contract accepts only hex colours (3/4/6/8 digit). This blocks a hand-edited
// metadata payload from smuggling `url(...)` or other external references back
// out under the tool's own metadata banner.
const colour = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
const identifier = z.string();
const fontPx = z.number().finite().positive();
const fontVmin = z.number().finite().nonnegative();
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
  fontMinPx: fontPx,
  fontVmin,
  fontMaxPx: fontPx,
  fontWeight: z.union([
    z.literal(400),
    z.literal(500),
    z.literal(600),
    z.literal(700),
  ]),
  anchor: z.enum(['start', 'middle', 'end']),
  opacity,
});

const svgElementSchema = z.discriminatedUnion('kind', [
  rectElementSchema,
  ellipseElementSchema,
  lineElementSchema,
  polygonElementSchema,
  textElementSchema,
]);

export const backgroundDocumentSchema = z.strictObject({
  version: z.literal(1),
  title: z.string(),
  description: z.string(),
  elements: z.array(svgElementSchema),
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
