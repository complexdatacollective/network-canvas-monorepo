---
'@codaco/interviewer': patch
---

Fixed an issue where double-clicking multiple .netcanvas files at once (with the installed app set as the file handler) could silently drop every file if even one of them had been moved or deleted since being opened. Readable files are now imported as normal, and a notification now appears if any of the files couldn't be read.
