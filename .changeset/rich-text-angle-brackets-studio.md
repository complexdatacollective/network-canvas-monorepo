---
'@codaco/studio-web': patch
---

Text typed in angle brackets in the protocol editor now appears in the
interview. A placeholder such as `<IRB OR ETHICS BOARD HERE>` in an
introduction, prompt or label is saved escaped instead of as an HTML tag, which
the interview left out. A label that starts with `>`, such as `> 5 years`,
keeps its bracket too, and text such as `&copy;` appears as you typed it rather
than as the symbol it names.
