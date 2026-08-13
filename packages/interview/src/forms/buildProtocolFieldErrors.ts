export type ProtocolFieldErrorEntry = {
  field_index: number;
  component: string;
  message: string;
};

export function buildProtocolFieldErrors(
  formErrors:
    | { fieldErrors?: Record<string, string[] | undefined> }
    | undefined,
  fields: ReadonlyArray<{ variable: string }>,
  componentByVariable: Record<string, string>,
  variableByFieldPath: Record<string, string>,
): ProtocolFieldErrorEntry[] {
  const result: ProtocolFieldErrorEntry[] = [];
  const fieldErrors = formErrors?.fieldErrors;
  if (!fieldErrors) return result;

  for (const [name, messages] of Object.entries(fieldErrors)) {
    if (!Array.isArray(messages) || messages.length === 0) continue;
    const variable = variableByFieldPath[name] ?? name;
    const index = fields.findIndex((field) => field.variable === variable);
    if (index === -1) continue;
    const component = componentByVariable[variable] ?? 'unknown';
    for (const message of messages) {
      result.push({ field_index: index, component, message });
    }
  }

  return result;
}
