---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
'@codaco/protocol-validation': minor
'@codaco/fresco-ui': major
---

The interview shows less built-in text, and some of it reads more
consistently:

- In Family Pedigree, the answers to the sex assigned at birth question and
  the kinds of parent a participant chooses from now show the labels the
  protocol's codebook gives them, so a researcher can reword and translate
  them like any other protocol text. The choice of a biological parent who
  carried the pregnancy uses the protocol's label for a biological parent.
  Since participants choose from these answers, none of their labels may be
  blank. Architect fills those labels in for each of the protocol's
  languages that Network Canvas has wording for, when the attribute is
  created and when a language is added, and gives a default language it has
  no wording for the English labels. The supplied English label for a donor
  is now "Egg or sperm donor".
- When a researcher changes the language a protocol's text is recorded as,
  or chooses another default language, text Network Canvas supplies and the
  researcher has not changed (the finish screen's text and the Family
  Pedigree answer labels) becomes the supplied text for the language chosen,
  so a protocol upgraded as English and corrected to German reads the German
  text.
- The button that confirms finishing the interview says "Finish", like the
  button that opens the confirmation.
- Several buttons and messages now use one wording instead of two: "Pause
  automatic layout" and "Resume automatic layout" on the Sociogram, "Enter
  your passphrase" in Family Pedigree, "Zoom in" and "Zoom out", "Nothing
  matched your search term." on the Geospatial search, and the same Cancel,
  Save, Back, No and loading text the rest of the interview uses.
- The debug-information button no longer repeats its own label as a tooltip.
- A stage name made only of spaces is no longer valid, so the interview never
  needs a name of its own for an unnamed stage.
- `ResizableFlexPanel` breakpoints no longer take a `label`, which nothing
  read. A caller that passes one must remove it.
