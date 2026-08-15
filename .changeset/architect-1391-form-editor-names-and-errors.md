---
'@codaco/fresco-ui': minor
'@codaco/architect': patch
'@codaco/interview': patch
'@codaco/interviewer': patch
---

Architect's editors now say what each control is for, and stop showing errors that have already been fixed.

**Repeated controls have names of their own.** A stage editor stacks a dozen switches and, in several interfaces, two or more "Create new" buttons. Every switch announced itself as "Turn this feature on or off" and every add button as "Create new", so a researcher navigating by a list of controls met the same two controls over and over. Each switch is now named by the section it belongs to ("Skip Logic", "Validation", "Side Panels"), and each add button says what it adds — "Create new prompt", "Create new form field", "Create new disease", and, in a Network Composer, "Create new attribute for" each edge type by name. The Experimental Features switch had no name at all, as did the two preview settings; they are named now too.

**Choosing a variable clears the error about not having chosen one.** Creating a variable from the field editor left the field showing its new variable AND a red "This field is required." until the editor was reopened or saved again. Any value written on a field's behalf now clears the messages that were about the value it replaced.

**An empty type name says one thing, not two.** Saving a node or edge type with no name reported both "This field is required." and "Not a valid variable name…" — the second wrong twice over, since nothing had been typed and the field is not a variable. A pattern rule now leaves emptiness to the required rule, as HTML's own `pattern` does, and a genuinely malformed name is named correctly: "Not a valid node type name."

**Colours are called what they look like.** Colour swatches in the codebook, the ordinal bins, the map options and the pedigree diseases announced themselves as `node-color-seq-3`. They now use the palette's own names — Neon Coral, Sea Green, Purple Pizazz — and the Narrative Pedigree disease picker no longer offers two swatches its palette has no colours for. A protocol that already stores one of those colours keeps it, shown and named, so nothing is silently rewritten.

**Clicking an issue takes you to the issue.** The Issues panel scrolled to the offending field but handed focus back to the Issues button, so a researcher working by keyboard or screen reader was returned exactly where they started. Activating an issue now focuses the control that resolves it; dismissing the panel without choosing anything still returns to the button.

Also fixed: the input-control dropdown is now a set of real option groups rather than a flat list punctuated by unselectable "-- Text Types --" rows, which a screen reader read out as options and React reported as hundreds of duplicate-key errors; and choosing a variable type in the codebook no longer logs a Base UI controlled-state warning.
