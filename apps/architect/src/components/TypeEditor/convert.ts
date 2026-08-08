// convert protocol format into redux-form compatible format
const format = (
  configuration: Record<string, unknown>,
): Record<string, unknown> => ({
  ...configuration,
});

/**
 * Convert redux-form format into protocol format.
 *
 * Redux-form has no way to say "this key is gone" — a control that clears
 * itself writes a null, and the entity-type reducers replace the whole
 * definition with what they are handed. An optional property left as null
 * therefore reaches the protocol, where a schema that made it optional rejects
 * it: turning the synthetic section off would save a definition that no longer
 * validates. Dropping the key here restores the distinction the form cannot
 * express, at the one seam both the create and update paths pass through.
 */
const parse = (
  configuration: Record<string, unknown>,
): Record<string, unknown> => {
  const parsed = { ...configuration };
  if (parsed.synthetic === null || parsed.synthetic === undefined) {
    delete parsed.synthetic;
  }
  return parsed;
};

export { format, parse };
