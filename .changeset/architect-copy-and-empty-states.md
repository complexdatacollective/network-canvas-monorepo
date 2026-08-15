---
'@codaco/architect': patch
'@codaco/interview': patch
---

Delete confirmations stop claiming a deletion cannot be undone when Undo puts it back, the rule builder reads as a sentence, the Issues panel names each field the way the page does, and a roster with nothing left to add says so instead of blaming your search.

**Delete confirmations describe what Undo actually does.** Deleting a stage, a codebook variable or a codebook type warned that the action "cannot be undone" — and then the toolbar's Undo restored it. All three are ordinary steps in the protocol's history, so all three now say "You can restore it with Undo while this protocol remains open.", matching the wording the resource delete already used. The two dialogs on the start screen are unchanged and still say the deletion cannot be undone, because they are the ones that really cannot: clearing your library removes protocols and their files from the device, outside any protocol's history.

**The rule builder is written in English.** Adding a rule to a filter or to skip logic opened on a section headed "node Type", asking you to "Choose an node type to base your rule on". The internal word for the entity class was being dropped straight into the heading and the sentence. Node and edge rules now have their own heading and their own sentence, each written out in full.

**The Issues panel calls a field what the page calls it.** After a failed save, the panel listed each problem under a tidied-up version of the field's internal path — "Search Options Match Properties", "Behaviours Min Nodes", "Prompts 0 Text" — none of which appears anywhere on screen. Each row now carries the field's own label, so the row you click and the control it takes you to have the same name. The guidance above a roster's searchable attributes also no longer opens "The selecting lots of attributes here…".

**A roster that has nothing left to offer says that, not "nothing matched".** In a Name Generator (roster), once every entry had been added, the Available panel reported "Nothing matched your search term." — with no search term typed, and even on stages with no search at all. The panel now distinguishes its three states: an empty list, a list everything has already been taken from, and a search that found nothing.
