---
'@codaco/fresco-ui': patch
---

Every form field control now survives being handed a value of the wrong shape. Because the form store owns the value and the resets that follow a change of question type run only after a render commits, any control can hold the previous field's value for one render — and a control that threw during that render blocked the very reset that would have cleared it. The array field, combobox, radio matrix, segmented code field and styled select each did so; they now render their empty state for that one pass instead. What a control emits when someone actually uses it is unchanged.
