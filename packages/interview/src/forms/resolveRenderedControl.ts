import type { ComponentType, Variable } from '@codaco/protocol-validation';

/** What a field authored in a protocol says about the control it wants. */
export type AuthoredControl = {
  /** The codebook variable's type. */
  type: Variable['type'];
  /**
   * The control the protocol authored — a NetworkComposer field's own choice,
   * otherwise the codebook variable's.
   */
  component: ComponentType;
  /** The codebook variable's validation block, if it has one. */
  validation?: { required?: unknown } | undefined;
};

export type RenderedControl = {
  /** The control the field actually renders with. */
  component: ComponentType;
  /**
   * Whether the codebook's `options` still describe what the rendered control
   * offers. False when the authored control was swapped below, because the
   * replacement asks its own two-valued question.
   */
  optionsApply: boolean;
};

/**
 * The control a field actually renders with, and whether the codebook's
 * options still describe it.
 *
 * A REQUIRED boolean never renders as a `Toggle`. A toggle is a
 * `role="switch"`, and ARIA gives a switch only `true`/`false` — there is no
 * "unset" — so an unanswered required boolean both looks and announces like a
 * definite "No" while `required` still refuses to let the participant
 * continue. The visible state, the stored value and the validation verdict
 * disagree, and the only way past it is to switch the control on and then off
 * again. `Boolean` asks the same two-valued question as a pair of radio cards
 * that genuinely start unselected, so every required boolean resolves to it
 * whatever the protocol authored.
 *
 * A swapped field renders `Boolean`'s own Yes/No pair rather than the
 * codebook's `options`, which is what `optionsApply: false` says. A toggle
 * never rendered those options — it is unconditionally two-valued — so
 * carrying them into the swapped control would silently change the question: a
 * variable whose options list only `{label: 'Yes', value: true}` would become a
 * required question the participant can only answer one way. Dropping them
 * keeps the rendered domain identical to the toggle's, which is what every
 * other layer (protocol-validation's satisfiability analyser included) already
 * assumes for a `Toggle`.
 *
 * This is a rendering correction, not a protocol change: it applies to
 * protocols already in the field the moment they are loaded, with no schema
 * change, no migration and no revalidation.
 *
 * Every path that renders a protocol-authored control resolves it here — the
 * interview's field metadata and the standalone `ProtocolField` alike — so the
 * swap and the options it invalidates cannot be applied by one and not the
 * other.
 */
export function resolveRenderedControl({
  type,
  component,
  validation,
}: AuthoredControl): RenderedControl {
  const swapped =
    type === 'boolean' &&
    component === 'Toggle' &&
    validation?.required === true;

  return {
    component: swapped ? 'Boolean' : component,
    optionsApply: !swapped,
  };
}
