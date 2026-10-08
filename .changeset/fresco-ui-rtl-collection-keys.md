---
'@codaco/fresco-ui': patch
---

In a right-to-left layout, the left and right arrow keys in a horizontal list
or a grid collection now move to the item on that side of the screen. Before,
they moved to the previous and next item, which a right-to-left layout places
on the opposite sides. Collections whose keyboard handling measures where items
sit are unchanged. A dialog's leading footer button now keeps its gap from the
others in a right-to-left dialog too.
