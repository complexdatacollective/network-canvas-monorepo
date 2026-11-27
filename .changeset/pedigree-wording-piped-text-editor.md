---
'@codaco/architect': minor
---

The Family Pedigree editor's wording fields now use the piped-text editor that
other stages' prompts use. The **Attribute** button in the toolbar, or typing
`{`, lists what each piece of wording can show, such as a family member's name,
under **Interview attributes**, and what it can depend on, such as whether it is
about the participant or the number of parents still to add, under **Dynamic
attributes**. Choosing something that the wording can depend on inserts a
version for each of its cases, or for each plural form of the language. Wording
that depends on something is shown as one folded piece, and opening it shows
one version for each case. In the **Attribute** menu, something that the
wording must show but does not yet contain, such as the person's name, is
marked **Required in this wording**, and the **Attribute** button shows a dot.
Wording that leaves it out is refused with a message that names it, for example
"This wording must include the attribute “Name”." The translation table and the
protocol summary show these pieces folded in the same way.
