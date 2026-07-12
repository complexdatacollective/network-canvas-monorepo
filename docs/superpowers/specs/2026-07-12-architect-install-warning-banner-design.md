# Architect Install Warning Banner Design

## Goal

Make Architect's install-app nudge visually read as a warning while retaining
its current content, behavior, layout, accessibility semantics, and motion.

## Design

The existing `@codaco/fresco-ui/Alert` remains the banner foundation. Remove
the banner-level surface and text overrides so its existing `warning` variant
provides the warning background and warning-contrast foreground.

Keep the shared illustrated warning triangle and customize it only for this
banner. Its triangle uses the existing `platinum` and `platinum-dark` fills;
its exclamation point uses `neon-coral` and `neon-coral-dark`. The shared
warning-alert palette remains unchanged for other consumers.

The dismiss control uses warning-contrast colors so it remains legible on the
warning surface. Installation, dismissal, browser-specific copy, screen-reader
context, keyboard behavior, and reduced-motion behavior do not change.

## Verification

Add a component regression test that verifies the warning surface is not
masked by local surface overrides and that the rendered illustration uses the
requested token pairs. Run the focused component test, formatting, linting,
Architect type checking, and repository dead-code checks. Finally, render the
Architect app and inspect the banner at a desktop viewport before capturing a
screenshot.
