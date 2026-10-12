---
'@codaco/architect': patch
---

Text typed in angle brackets now appears in the interview. A placeholder such
as `<IRB OR ETHICS BOARD HERE>` in an introduction, prompt or label was saved
as an HTML tag, so Preview and Interviewer left it out and participants read
"received ethics clearance through, today." It is now saved escaped, in the
same form the sample protocol uses. A label that starts with `>`, such as
`> 5 years`, keeps its bracket too, and text such as `&copy;` appears as you
typed it rather than as the symbol it names.

Text already saved by an earlier version still loses its brackets in the
interview, although Architect shows them. Edit that field once and it is saved
in the escaped form.
