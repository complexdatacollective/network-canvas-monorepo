---
'@codaco/interviewer': minor
'fresco': minor
---

Exported data keeps every answer when names use any language, and tells you
when it had to change something to do so.

- Export file names keep the node or edge type's name as you wrote it, in any
  language and with spaces. Only characters a file system can't store, such as
  `/` or `:`, are left out. A type name with a hyphen or a dot now keeps it, so
  a "Close-Friend" type exports to a file ending `_Close-Friend.csv` rather than
  `_CloseFriend.csv`. If you have analysis scripts that find export files by
  name, check them.
- Two types whose names would give the same file name, such as "Friend/Family"
  and "FriendFamily", or "Friend" and "friend", now get the type's ID added to
  the end of each file name. Before, one type's file could replace the other's,
  and its data was then missing from the export. If two files in one export
  would still have the same name, the export now stops with an error rather
  than lose one of them.
- When two columns in one file would have the same name, the later one is
  written under a numbered name, such as "age_2", and the export tells you
  which columns were renamed. Before, the columns were merged and one
  attribute's answers were lost.
- In GraphML, a column name can't contain spaces and some punctuation, so those
  characters are written as `_`, and the name as you wrote it is kept in the
  column's description.
- GraphML can't store some invisible control characters. When an answer, or a
  name in an older protocol, contains one, it is removed from the GraphML files
  only, and the export lists the interviews and attributes affected. The CSV
  files keep every answer unchanged.
- CSV column headers are written exactly as the attributes are named. Answers
  that begin with `=`, `+`, `-` or `@` are still written with a leading `'`, so
  that spreadsheet programs don't run them as formulas.

Interviewer shows these notices in the export dialog, and as messages that stay
until you dismiss them. Fresco shows them as messages that stay until you
dismiss them.
