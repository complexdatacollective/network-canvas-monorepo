/**
 * Bounds on the finite-domain solver's work, shared by feasibility analysis
 * and generation so the two always agree about which components are solved.
 *
 * Exceeding any of them never refuses a protocol: an oversized component falls
 * back to the greedy draw path, and a search that runs out of budget reports
 * "unknown", which both consumers treat exactly like oversized.
 *
 * The values are set from measurement rather than taste (full numbers in the
 * PR's implementation report). Components are re-solved once per generated
 * entity, so the budget that matters is a single solve: at these limits the
 * worst per-entity cost observed across the acceptance corpus and a battery
 * of adversarial shapes — eight-variable rings, exact-fit chains, a
 * 101x101-value scalar pair — was 0.06ms mean and 0.5ms worst, and the
 * bundled development protocol generates 100 sessions within 2.5% of the
 * pre-solver time. The variable cap is wider than any constraint web in the
 * bundled protocols; the product cap keeps a component's full enumeration in
 * the tens of microseconds; the node cap is two orders of magnitude above the
 * deepest search those two caps admitted in measurement (a few hundred
 * nodes), while still bounding a pathological instance to well under a
 * second.
 */
export const MAX_COMPONENT_VARIABLES = 8;
export const MAX_DOMAIN_PRODUCT = 200_000;
export const MAX_SEARCH_NODES = 50_000;
