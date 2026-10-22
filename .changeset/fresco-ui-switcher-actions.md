---
'@codaco/fresco-ui': minor
---

`TeamAndStudySwitcher`'s `action` now also accepts a list of rows, shown under
the list in the order given. A single row works as before. The row type is
exported as `SwitcherAction`, and a row can bring its own `icon` in place of the
dashed "+" tile. Choosing a command row now returns focus to the switcher before
the command runs, so a dialog it opens hands focus back to the switcher when it
closes instead of losing it.
