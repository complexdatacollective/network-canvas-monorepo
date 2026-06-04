export type BioTriadOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

/**
 * Disable the existing option that matches `excludedValue` (the person already
 * chosen for the other role), so a single person can't be selected as both the
 * egg and sperm parent. The "new person" option is never disabled — two new
 * people are distinct individuals.
 */
export function excludeSelectedOption(
  options: BioTriadOption[],
  excludedValue: unknown,
): BioTriadOption[] {
  return options.map((option) =>
    option.value !== 'new' && option.value === excludedValue
      ? { ...option, disabled: true }
      : option,
  );
}
