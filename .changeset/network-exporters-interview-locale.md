---
'@codaco/network-exporters': minor
---

Exports record the language each interview was shown in. CSV ego files have a
`networkCanvasInterviewLocale` column and GraphML graphs an
`nc:interviewLocale` attribute, holding the session's `locale`: the language
last shown to the participant. Pass `locale: null` for a session whose language the host has not
recorded; its CSV cell is then empty and the GraphML attribute is left out.
The CSV column name is reserved like the other session columns, so a variable
that would be exported under it is renamed `networkCanvasInterviewLocale_2`,
with a `'column-renamed'` warning. A variable called `interviewLocale` is
exported unchanged.
