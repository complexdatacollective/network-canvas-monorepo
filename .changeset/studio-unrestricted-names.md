---
'@codaco/studio-client': major
'@codaco/studio-server': major
---

Names in a protocol can now be written in any language. In the protocol
editor, node types, edge types, attributes and option values can use any
script, spaces and punctuation. A name still can't be empty, start or end with
a space, or contain tabs, line breaks or other invisible control characters.
Protocols are saved as schema 9, the protocol version that allows these names,
and the interview preview runs them.

- The hint under a node or edge type's name suggests names you can type in as
  they are, such as "Friends" or "Colleagues", and each language suggests
  names its researchers would naturally use.
- A name that would clash with another column in exported data is refused, and
  the message names the other column. A categorical attribute is exported as
  one column for each option, and a layout attribute as one column for each
  coordinate, and no attribute can take the name of a column every export
  includes. Names that an export would write the same way are refused too,
  such as "close friend" and "close_friend", which GraphML files both write as
  "close_friend".
- A participant data file (roster) that contains a character exported data
  can't carry, usually an invisible control character pasted in from another
  program, is refused when you add it. The message names the row and column,
  or the line, to fix. The server refuses such a file too, and its refusal
  carries the problem as structured detail (`code: 'roster-characters'`), so
  the editor can explain it in your language.
- A roster's column headers can be any name an attribute can have, and the
  messages about headers that can't be used say what is not allowed. A roster
  with a header that can't be used, or with two headers that are the same name
  written two ways, such as an accented letter stored as one character in one
  and as two in the other, is now refused when you add it, rather than being
  published and then turned away by the interview when a participant reaches
  it. So is a roster the interview couldn't otherwise load: one that can't be
  read, has a row with more or fewer cells than its header, has no rows, or
  holds a value no attribute can take. The server refuses these files too.
