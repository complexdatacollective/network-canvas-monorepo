---
'@codaco/architect': patch
---

Canvas, pedigree and anonymisation fixes in the stage editors:

- Narrative presets again offer attributes another interface records, such as
  the participant marker a Family Pedigree keeps. A preset positions, groups
  and highlights by an attribute without writing it, so these are exactly the
  attributes it exists to look at.
- The Family Pedigree's family-building prompt takes full markdown again, so a
  link or a second paragraph in a stored prompt survives being opened and
  edited instead of being flattened to one line.
- Choosing "let the participant choose" for a pedigree's framing and then going
  back to a fixed framing puts the terminology the stage was saved with back,
  rather than leaving the control empty and refusing the save.
- A geospatial prompt is refused at save when its location attribute is one a
  form elsewhere collects, instead of saving a stage only protocol validation
  would object to. A prompt re-saved on the attribute it arrived with still
  saves.
- The geospatial starting-view map is drawn on the basemap the stage is set to,
  so the view is framed on what the participant will see.
- Each node type in the Anonymisation stage now has its own switch, and
  switching one off stops encrypting every attribute of that type at once,
  after confirming.
