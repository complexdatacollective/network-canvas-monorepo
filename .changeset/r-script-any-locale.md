---
'@codaco/background-creator': patch
---

The R script now reads and writes your data correctly whatever language
settings R is running with.

Where R is not set to UTF-8, which includes many servers and containers, the
script stopped reading at the first character outside basic Latin, so values
such as "Renée" or "你好" were cut off or the script failed. It now keeps every
name and value as written, and a file saved from Excel with a byte-order mark
is read cleanly.
