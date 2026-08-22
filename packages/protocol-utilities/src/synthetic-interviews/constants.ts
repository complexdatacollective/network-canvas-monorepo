/**
 * What a generation RUN is configured with, as opposed to what a protocol
 * says.
 *
 * Everything that shapes the data itself — how many people a stage elicits,
 * what a variable's values look like, how quickly a participant tires — is
 * defined in `@codaco/protocol-validation` and read from the protocol. These
 * two are properties of asking for synthetic data rather than of the document,
 * so they are the only constants this package holds.
 *
 * See docs/superpowers/specs/2026-08-19-synthetic-parameters-in-schema-design.md
 */
export const MAX_SYNTHETIC_INTERVIEWS = 1000;
export const DEFAULT_SYNTHETIC_SEED = 42;
