---
'@codaco/shared-consts': minor
---

Adds the export column names `ncInterviewLocaleProperty`
(`networkCanvasInterviewLocale`, the CSV ego column holding the interview's
language) and `interviewLocaleProperty` (`interviewLocale`, the session field
it comes from). `networkCanvasInterviewLocale` is a reserved CSV ego column, so
`findExportColumnConflicts` refuses a variable that would be exported under it.
