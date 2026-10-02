import { Predicate } from 'effect';

export const hasTag = (u: unknown): u is { readonly _tag: string } =>
  Predicate.hasProperty(u, '_tag') && Predicate.isString(u._tag);

export const isTaggedError = <const Tag extends string>(
  u: unknown,
  tag: Tag,
): u is { readonly _tag: Tag } => Predicate.isTagged(u, tag);
