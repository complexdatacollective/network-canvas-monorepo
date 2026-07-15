---
'@codaco/architect': patch
---

New Ordinal Bin prompts are assigned the next colour in the palette
automatically, so multi-prompt stages get distinct scale colours instead of
every prompt starting with the first colour. Bundled template protocols now
set an explicit dialog title on their name generators ("Add Person") and an
explicit scale colour and canvas background where these were previously
implicit defaults.
