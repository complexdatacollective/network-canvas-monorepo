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

  // An empty field that we have never auto-filled is the initial mount: fill it.
  // Once we have generated at least once, an empty field means the researcher
  // cleared it — leave it empty so clearing-to-rename isn't fought mid-keystroke;
  // the hook's blur handler re-fills it if they leave it empty.
  if (liveLabel.trim() === '') {
    if (lastGenerated === undefined && generatedLabel) {
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
