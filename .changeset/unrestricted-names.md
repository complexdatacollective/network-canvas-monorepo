---
'@codaco/interview': major
'@codaco/architect': major
'@codaco/interviewer': major
'fresco': major
---

Names in a protocol can now be written in any language. Node types, edge types,
attributes and option values can use any script, spaces and punctuation, so a
study can name an attribute "Âge", "年龄" or "Close friend" rather than keeping
to unaccented letters, numbers and `. _ - :`. A name still can't be empty,
start or end with a space, or contain tabs, line breaks or other invisible
control characters. Names are saved without spaces at either end, and an
accented letter is stored the same way however it was typed.

Protocols now use schema 9, the protocol version that allows these names. When
you open a protocol made with an earlier version, Architect creates an upgraded
copy and leaves the original as it was. The upgrade changes nothing else, and
existing names are kept exactly as they are. Interviewer and Fresco upgrade
older protocols to schema 9 when they are imported, and Fresco upgrades the
protocols it already holds when it is updated. Update Interviewer and Fresco to
this release before you use a schema 9 protocol with them, because earlier
versions can't open it. A protocol made with a newer version of Network Canvas
than the app can run is now reported as needing an update to the app, rather
than as an unreadable protocol.

In Architect:

- The hint under a node or edge type's name now suggests names you can type in
  as they are. The last release suggested "Works With" in English, and
  "Organización" and "Trabaja con" in Spanish, and the field then refused them.
  Every suggestion is now accepted, and each language suggests names its
  researchers would naturally use.
- A name that would clash with another column in exported data is refused as
  you type it, and the message names the other column. A categorical attribute
  is exported as one column for each option, named after the attribute and the
  option, and a layout attribute as one column for each coordinate. So an
  attribute called "age_1" can't sit beside a categorical "age" attribute that
  has the option "1", and no attribute can take the name of a column every
  export includes, such as "nodeID" or "label".
- Two options of one attribute that would be exported to the same column, such
  as the number 1 and the text "1", are refused.
- A participant data file (roster) is checked for characters that exported data
  can't carry, which are usually invisible control characters pasted in from
  another program. A file that contains one is refused when you import it, and
  the message names the row and column, or the line, to fix.
- A roster's column headers can be any name an attribute can have.
- The roster preview shows the values of a column called "constructor" or
  "toString" correctly.

In interviews:

- Rosters match their columns to attributes by name in any language, including
  a spreadsheet saved on a Mac that stores accented letters differently. An
  option whose value looks like a number or `true` keeps the value the codebook
  gives it.
- Columns and attributes called "constructor" or "toString", and names that
  contain a dot, are read, shown, searched and sorted like any other name.
  Before, some of them were dropped or read wrongly.

**Breaking for hosts of `@codaco/interview`.** The engine now runs schema 9
protocols. `COMPATIBLE_PROTOCOL_SCHEMA_VERSION` (from
`@codaco/interview/protocol-schema-version`) is `9`, and `ProtocolPayload`
(from `@codaco/interview/contract`) is typed from the schema 9 protocol. A host
must migrate stored protocols to schema 9, for example with `migrateProtocol`
from `@codaco/protocol-validation`, before it hands them to the Shell. Hosts
that already migrate to `COMPATIBLE_PROTOCOL_SCHEMA_VERSION` only need the
`@codaco/protocol-validation` and `@codaco/shared-consts` majors released
alongside this one. Roster CSV files are now read with `readRosterCsv` from
`@codaco/protocol-validation`, and the package no longer depends on
`csvtojson`.
