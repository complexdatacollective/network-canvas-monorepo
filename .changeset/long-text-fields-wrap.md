---
'@codaco/protocol-validation': patch
'@codaco/architect': patch
---

Architect's fields for wording that runs to a sentence or more, such as the
message a Finish Screen shows when finishing fails, now wrap onto more lines
as the text grows, instead of hiding the end of it past the edge of a
one-line box. This covers the Finish Screen's confirmation question and
failure message, the Family Pedigree's hints and descriptions, the notices and
error messages on name generator, bin, geospatial and network composer
stages, and an image or video's description.

The guidance under a Family Pedigree's name question can now be formatted in
bold or italics, like a form field's hint, which it is shown as.
