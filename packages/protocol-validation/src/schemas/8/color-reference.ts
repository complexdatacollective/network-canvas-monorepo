import { z } from 'zod';

export const NodeColorSequence = [
  'node-color-seq-1',
  'node-color-seq-2',
  'node-color-seq-3',
  'node-color-seq-4',
  'node-color-seq-5',
  'node-color-seq-6',
  'node-color-seq-7',
  'node-color-seq-8',
] as const;

export const NodeColorReferenceSchema = z.enum(NodeColorSequence);
export type NodeColorReference = z.infer<typeof NodeColorReferenceSchema>;

export const EdgeColorSequence = [
  'edge-color-seq-1',
  'edge-color-seq-2',
  'edge-color-seq-3',
  'edge-color-seq-4',
  'edge-color-seq-5',
  'edge-color-seq-6',
  'edge-color-seq-7',
  'edge-color-seq-8',
] as const;

export const EdgeColorReferenceSchema = z.enum(EdgeColorSequence);
export type EdgeColorReference = z.infer<typeof EdgeColorReferenceSchema>;

export const OrdinalColorSequence = [
  'ord-color-seq-1',
  'ord-color-seq-2',
  'ord-color-seq-3',
  'ord-color-seq-4',
  'ord-color-seq-5',
  'ord-color-seq-6',
  'ord-color-seq-7',
  'ord-color-seq-8',
  'ord-color-seq-9',
  'ord-color-seq-10',
] as const;

export const OrdinalColorReferenceSchema = z.enum(OrdinalColorSequence);
export type OrdinalColorReference = z.infer<typeof OrdinalColorReferenceSchema>;

export const CategoricalColorSequence = [
  'cat-color-seq-1',
  'cat-color-seq-2',
  'cat-color-seq-3',
  'cat-color-seq-4',
  'cat-color-seq-5',
  'cat-color-seq-6',
  'cat-color-seq-7',
  'cat-color-seq-8',
  'cat-color-seq-9',
  'cat-color-seq-10',
] as const;

export const CategoricalColorReferenceSchema = z.enum(CategoricalColorSequence);
export type CategoricalColorReference = z.infer<
  typeof CategoricalColorReferenceSchema
>;

export const ColorReferenceSchema = z.union([
  NodeColorReferenceSchema,
  EdgeColorReferenceSchema,
  OrdinalColorReferenceSchema,
  CategoricalColorReferenceSchema,
]);
export type ColorReference = z.infer<typeof ColorReferenceSchema>;
