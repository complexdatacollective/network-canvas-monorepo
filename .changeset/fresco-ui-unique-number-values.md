---
'@codaco/fresco-ui': patch
---

Fix "Must be unique" accepting a duplicate value for a number variable. A number typed into an interview form was compared as text against the numbers already stored on the other alters, so an Alter ID that another alter already held passed the check and the duplicate was added. The same mismatch let a "same as" or "different from" rule misjudge a number answered on an earlier stage. Number values are now compared as numbers wherever a rule reads what the network already holds.
