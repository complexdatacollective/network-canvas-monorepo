# Architect Home CTA Styling Design

## Goal

Restore the Architect landing page's original CTA hierarchy after its Fresco
UI migration: Create remains sea green, Open returns to slate blue, and both
buttons become one Fresco size smaller.

## Design

Continue using `@codaco/fresco-ui/Button` for both actions. Set each button to
`size="md"`, replacing the current `lg` size. Keep Create on Architect's
`primary` semantic color, which maps to sea green.

Style only Open with Architect's `accent` and `accent-contrast` runtime tokens,
which map to slate blue and its readable foreground. Add the matching accent
focus outline. Do not redefine the app's global `secondary` token or expand the
shared Button API because either choice would broaden this landing-page fix.

Preserve the button labels, icons, actions, order, wrapping behavior, focus
behavior, and all surrounding landing-page layout.

## Verification

Render `Home` in a focused component test and verify both CTA buttons use the
Fresco medium height and type scale. Verify Open uses the accent component
tokens and focus outline. Run formatting, lint autofix, Architect type checking,
`knip`, and the focused tests. Finally, inspect the running app at a 1440 × 900
desktop viewport and capture a screenshot with no browser console errors.
