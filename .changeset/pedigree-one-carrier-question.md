---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

The Family Pedigree's person panel asks "Who carried the pregnancy?" once, as the add forms do, instead of asking whether each parent carried it. The participant chooses one of the parents who could have, or "Someone else, or I don’t know". Choosing another parent moves the answer to them. Choosing "Someone else, or I don’t know" no longer records the parent as having carried it. The question is not asked while one of the parents is a surrogate.

Choosing "Someone else, or I don’t know" for a twin takes back the carrier their twins were recorded with, and keeps any recorded "No".

The twin question now reads "Are any of these siblings your twins?", or "Are any of these siblings twins with “Sophie”?" about someone else.
