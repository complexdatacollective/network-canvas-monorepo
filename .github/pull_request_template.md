## Summary

<!-- What changes, and why. Link the issue. -->

## Testing

<!-- What you ran, and what it showed. -->

## Accessibility

<!--
For changes to anything a user sees, hears or operates. The standard is WCAG 2.2 AA,
as set out in docs/accessibility.md; the developing-network-canvas-ui skill covers
how to meet it. Tick each item, or delete the list and say the change is not user-facing.
-->

- [ ] Reuses `@codaco/fresco-ui` components and Base UI primitives where they fit.
- [ ] Every action works from the keyboard alone, with visible focus that is never lost or hidden.
- [ ] Controls, images and regions have accessible names; decorative icons are hidden.
- [ ] Changes of state (results, progress, errors, moves) are announced to screen readers.
- [ ] Anything done by dragging can also be done with single clicks or taps; targets are at least 24 by 24 CSS pixels.
- [ ] Respects reduced motion, and works at 400% zoom and in right-to-left languages.
- [ ] Adds no lint or axe violations; any exception carries a written reason.
