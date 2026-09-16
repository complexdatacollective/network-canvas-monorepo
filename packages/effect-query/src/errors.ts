import { Predicate } from 'effect';

/**
 * A `catch` binds its parameter as `unknown`, and a screen that wants to branch on
 * the rpc error it just threw needs to get back to `_tag` first. These two guards are
 * that step, and nothing more: they prove a `_tag` is there, they do not decode.
 */
export const hasTag = (u: unknown): u is { readonly _tag: string } =>
  Predicate.hasProperty(u, '_tag') && Predicate.isString(u._tag);

export const isTaggedError = <const Tag extends string>(
  u: unknown,
  tag: Tag,
): u is { readonly _tag: Tag } => Predicate.isTagged(u, tag);
