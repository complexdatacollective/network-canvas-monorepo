export function computeAutoNameUpdate(args: {
  isNewStage: boolean;
  isCustom: boolean;
  liveLabel: string;
  lastGenerated: string | undefined;
  generatedLabel: string;
}): { nextIsCustom: boolean; label?: string } {
  const { isNewStage, isCustom, liveLabel, lastGenerated, generatedLabel } =
    args;

  if (!isNewStage) {
    return { nextIsCustom: true };
  }

  // Empty field (initial or cleared) re-engages auto-naming.
  if (liveLabel.trim() === '') {
    if (generatedLabel && generatedLabel !== liveLabel) {
      return { nextIsCustom: false, label: generatedLabel };
    }
    return { nextIsCustom: false };
  }

  if (isCustom) {
    return { nextIsCustom: true };
  }

  // A non-empty value we did not generate means the researcher took ownership.
  if (liveLabel !== lastGenerated) {
    return { nextIsCustom: true };
  }

  if (generatedLabel !== liveLabel) {
    return { nextIsCustom: false, label: generatedLabel };
  }
  return { nextIsCustom: false };
}
