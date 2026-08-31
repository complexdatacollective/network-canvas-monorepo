export function studioEmailPattern(hint: string) {
  return {
    regex: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
    hint,
    errorMessage: 'Enter a valid email address.',
  } as const;
}
