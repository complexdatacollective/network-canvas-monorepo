---
'@codaco/architect': patch
---

Stage editors: generator and composer fixes

- The Quick Add name generator no longer offers an attribute one of the same stage's own prompts stamps on the people it names, which the protocol refuses.
- A Tie-Strength Census prompt now shows the points of the scale it records into, and lets you change them without leaving for the codebook screen; points an interface owns are shown read-only.
- Pointing a Network Composer connection at a different connection type now clears the questions it used to ask, instead of keeping questions about attributes the new type does not have.
- A Network Composer form field whose attribute has been deleted now names the missing attribute, instead of reading as an empty field.
- A Network Composer refuses to save while the box that adds a node, or the attribute nodes are grouped by, names an attribute another stage claims the opposite way — including a conflict that arrived with the protocol.
- The rules set on a Network Composer form field are now checked against the input control and settings that field will actually use, so a contradiction between them is reported while you are writing it.
