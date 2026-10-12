---
'@codaco/fresco-ui': minor
---

`useDragAndDrop` takes an optional `getItemAnnouncedName(key)`: the name
announced while a single item of the collection is dragged with the keyboard,
such as the label the item shows. Without it, or when it returns `undefined`,
the item is announced as `Item <key>`, as before.
