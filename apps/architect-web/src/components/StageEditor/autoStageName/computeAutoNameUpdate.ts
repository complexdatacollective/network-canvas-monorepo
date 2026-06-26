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

  // A non-empty value that differs from what we last generated means the
  // researcher took ownership. (Accepted limitation: typing exactly the current
  // generated name reads as not-yet-owned, so a later config change will still
  // overwrite it — harmless, since the value being replaced is identical.)
  if (liveLabel !== lastGenerated) {
    return { nextIsCustom: true };
  }

  if (generatedLabel !== liveLabel) {
    return { nextIsCustom: false, label: generatedLabel };
  }
  return { nextIsCustom: false };
}
