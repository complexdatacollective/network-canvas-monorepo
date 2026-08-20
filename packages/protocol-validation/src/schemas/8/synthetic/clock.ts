// ---------------------------------------------------------------------------
// The simulated clock: how a protocol's declared burden becomes elapsed time
// ---------------------------------------------------------------------------
//
// A generated session carries timestamps a researcher will read as if a person
// produced them, so the clock is calibrated rather than invented. Every number
// here is a property of the PROTOCOL FORMAT — the same conversion any host
// applies to any protocol — which is why it lives beside
// `DEFAULT_RESPONSE_BURDEN` rather than in the engine that reads it.

/**
 * Response burden converts to elapsed time at a fixed rate, so a protocol's
 * declared burden is the only thing that decides how long its interview takes.
 *
 * 200 seconds per unit of burden. The sample protocol carries 7.5 total
 * burden, which puts a complete run at roughly 25 simulated minutes — the
 * length a real sitting with it takes. Recalibrating means changing this one
 * number: every stage's share is already priced relative to every other by
 * `DEFAULT_RESPONSE_BURDEN`, so the rate scales the whole interview without
 * disturbing the proportions between its stages.
 */
export const SYNTHETIC_SECONDS_PER_BURDEN = 200;

/**
 * Two participants given the same stage do not take the same time over it, so
 * each stage's duration is multiplied by a lognormal draw.
 *
 * Sigma 0.35, mu 0. Lognormal because durations are positive and right-skewed:
 * a participant can take twice as long as usual but never less than no time at
 * all. A mu of zero makes the MEDIAN multiplier exactly 1, so jitter never
 * shifts the central estimate — the calibration above stays the calibration
 * however much variation is layered on top. At sigma 0.35 the middle half of
 * draws lands between about 0.79 and 1.27, and the extremes reach roughly half
 * and double: visible variation between sessions, and no session that reads as
 * impossible.
 */
export const SYNTHETIC_CLOCK_JITTER_SIGMA = 0.35;

/**
 * Sessions in one generated batch are spread over a window of recent days
 * rather than stamped at a single instant, because a batch stands in for
 * fieldwork and fieldwork happens over days.
 *
 * Seven days: long enough that dates, weekday/weekend splits, and any
 * date-anchored variable vary across the batch, short enough that the batch
 * still reads as one round of collection rather than a longitudinal study.
 */
export const SYNTHETIC_START_WINDOW_DAYS = 7;

/**
 * On a Geospatial stage, an answer outside every selectable area is the
 * residual: the participant is being asked to place someone on a map that was
 * drawn to contain the answer, so landing outside it is rare by construction
 * and never the modal response.
 *
 * 0.05. Non-zero because the interface offers the outcome and data that never
 * exercises it would hide every consumer that mishandles it; small because a
 * protocol whose map missed one participant in twenty would be a protocol with
 * a badly drawn map.
 */
export const GEOSPATIAL_OUTSIDE_AREAS_PROBABILITY = 0.05;
