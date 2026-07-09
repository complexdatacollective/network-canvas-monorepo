---
'@codaco/interview': patch
---

Fixed the quick add name generator closing its input after each name in Safari when the protocol uses encrypted variables and a passphrase has been set. The input now stays open so multiple people can be added in a row, matching the behaviour without encryption.
