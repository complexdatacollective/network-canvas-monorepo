# Classic Download Button Links Design

## Goal

Use the existing Fresco-derived button link primitive for the Architect Classic
and Interviewer Classic platform downloads while preserving correct link
semantics, icons, accessible names, destinations, and layout.

## Design

Replace the hand-styled external anchors in `PlatformActions` with `ButtonLink`.
`ButtonLink` renders an anchor for external destinations and obtains its visual
and interaction states from `@codaco/fresco-ui/Button` through
`buttonVariants`.

Each platform link will retain:

- its Apple, Windows, or Linux Lucide icon;
- its visible platform label and external-link icon;
- its existing accessible label;
- its external URL, new-tab behavior, and `noreferrer` protection;
- the compact, rounded layout used by the Classic application cards.

The links will use Fresco UI's outline button treatment. Local classes may
control card-specific translucency and pill-shaped rounding, but will not
reimplement button sizing, typography, focus, or interaction styles.

## Scope

Only `apps/networkcanvas.com/components/get-started/AppChoiceCard.tsx` changes.
No copy, destinations, card layout, Fresco UI package API, or unrelated CTA
components will change.

## Verification

- Format and lint the modified file.
- Type-check `networkcanvas.com`.
- Build the statically rendered website.
- Inspect `/get-started` at desktop and narrow widths to confirm wrapping,
  icons, contrast, and focusable external links.

No new test coverage is required for this component substitution.
