---
'@codaco/fresco-ui': minor
'@codaco/architect': patch
---

The node type editor offers the icons themselves again, and the dialogs it opens
close instead of vanishing.

Choosing a node type's icon is a search through the icons again. The field had
become a plain text box asking for an icon's name typed exactly — so the only
way to find one was to know it already, or to guess and be refused. It is a
searchable list again, each icon shown as itself: type a few letters and pick
what you see. Both sets are offered, Network Canvas' own icons first and then
Lucide's, and the search matches either way of writing a name, so "user plus",
"user-plus" and "userplus" all reach the same icon. Where the list is longer
than it shows at once, it says so rather than stopping silently.

Every Network Canvas icon can now be chosen, not just the two that name the
buttons an interview offers. A type whose icon was any of the others — set in an
older version of Architect, or by hand — opened onto an empty field asking the
researcher to choose an icon, with no way to choose the one it already had.

The dialogs in the stage editor close instead of disappearing. Creating or
editing a node type, inventing an attribute, editing the values or rules an
attribute collects, and setting a map's starting view all vanished the instant
they were dismissed, which read as the screen flickering rather than as the
dialog going away. They now animate out the way every other dialog does. One
exception remains and is deliberate: finishing an attribute you were inventing
takes the row out of inventing anything in the same moment, so that dialog still
goes at once.
