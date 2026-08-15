---
'@codaco/fresco-ui': patch
'@codaco/architect': patch
---

The last six stage editors that ran off the side of a phone screen now fit it.

Removing one shared minimum width settled fourteen of Architect's nineteen stage
editors. Six were left, each held open by a fixed width of its own, and each put
a horizontal scrollbar under the whole editor at phone width: Name Generator
Roster and Geospatial (484px of editor inside a 390px window), Family Pedigree
(550px), Alter Form and Alter Edge Form (400px), and Narrative Pedigree (410px).
All six now fit, at phone and tablet width alike, and the eight editors that
were never affected are unchanged.

Four separate causes were behind them:

**A chosen resource card was 400px wide whatever room it had.** The card showing
a selected roster, GeoJSON file or API key now fills the space it is given and
stops at its intended width, rather than starting there.

**A list of repeatable settings could not shrink below its widest row.** A row of
dropdowns and buttons is around 428px, and the list took that as a floor, so sort
rules, card display options and per-alter form fields pushed the editor sideways
instead of reflowing. They now reflow.

**Family Pedigree's variable settings sat in two fixed columns.** Each
label-and-picker pair now stacks into a single column when its row is narrow and
returns to two columns as soon as there is room. That is measured against the
space the row itself has rather than the size of the window, so the row behaves
the same wherever it is placed.

**A variable name pill had a fixed maximum width.** A variable name is a single
unbroken word that never wraps, so a long one such as `fm_relationship_to_ego`
widened the picker holding it, and the editor around that. The pill now stops at
the edge of the box holding it and clips the name with an ellipsis, which it
already did once it reached its old limit.

For consumers of `@codaco/fresco-ui`: `ArrayField` no longer imposes a minimum
width of its own. It fills the container it is given and shrinks with it, so a
host that previously relied on the field to hold a column open needs to set that
width itself.
