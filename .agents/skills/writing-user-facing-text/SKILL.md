---
name: writing-user-facing-text
description: 'Use before writing, editing or reviewing English text that a person will read in the network-canvas monorepo: documentation pages, website content, interface copy and messages, error messages, release notes, changelogs and READMEs, in every app, package and website. Guards against the grammar habits of agent-written prose: omitted words, unusual tenses, confusing word order, coined phrases, abstract wording, "a text" for a translatable string, and "holds" for "contains". Keywords: translatable string, localized string, write documentation, docs page, article, wording, copy, copy edit, proofread, rewrite, rephrase, heading, label, message, tooltip, release notes, plain English, style, grammar, Claudism, reads oddly, confusing sentence, coined phrase, jargon.'
---

# Writing user-facing text

Write each sentence as a careful human copy editor would write it. The reader is
a researcher or a participant who has never seen the code and who may read
English as a second language.

Text written by an agent fails this reader in two recurring ways. It compresses
sentences until they are no longer standard English, and it invents phrases
where a standard term already exists. The maintainer described both on
23 November 2026, with the examples used below. These rules apply to all
English text that ships to a reader, in every app, package and website.

## The rules

### 1. Keep the words that standard written English uses

Do not drop "that", "which", "who", articles or prepositions to shorten a
sentence. Where a relative clause reads heavily, use a participle phrase.

| Do not write                                | Write                                            |
| ------------------------------------------- | ------------------------------------------------ |
| Problems Architect reports                  | Problems reported by Architect                   |
| the names the participant sees on the nodes | the names that the participant sees on the nodes |
| the node or edge a form asks about          | the node or edge that a form asks about          |
| each number form the language distinguishes | each number form that the language distinguishes |
| the wording Network Canvas supplies         | the wording supplied by Network Canvas           |

"Problems that Architect reports" is acceptable. "Problems reported by
Architect" is better.

### 2. Use ordinary tenses and complete clauses

Describe what software does in the simple present. Do not end a sentence with a
clause that leaves its verb out, and do not mix tenses in a comparison.

| Do not write                                                                  | Write                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| The label changes as the family tree will once the changes are saved          | The label shows what the family tree will show after the changes are saved           |
| The label follows the answers as the participant types them, as the node does | The label updates as the participant types, in the same way as the label on the node |

### 3. Put the parts of a sentence in the usual order

Subject, then verb, then object. Put a condition before the result that it
governs, and keep a qualifier next to the word that it qualifies. Do not attach
an afterthought to the end of a sentence with a comma.

| Do not write                                                                                               | Write                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| It only chooses between the two versions and is never shown itself                                         | It chooses which of the two versions is shown. It is never shown.                                              |
| Architect adds both versions when the value is inserted, and each version is then written to suit its case | When you insert the value, Architect adds both versions. Write each version for the case in which it is shown. |

### 4. Use the standard term, and never coin a phrase

If linguistics, survey methodology, network science or everyday software usage
already has a name for the thing, use that name. If you find yourself building a
description out of ordinary words to avoid a term, look for the term.

| Do not write                         | Write                                  | Why                                            |
| ------------------------------------ | -------------------------------------- | ---------------------------------------------- |
| Wording that agrees with a number    | Wording for singular or plural numbers | "Singular" and "plural" are the standard terms |
| the node that the text is shown with | the node that the text refers to       | "Shown with" is an invented relation           |

Network Canvas terms are defined in the documentation glossary
(`apps/documentation/docs/get-started/glossary.en.mdx`). Use them as defined and
do not create near-synonyms for them.

#### Call a string that can be translated a "translatable string" or a "localized string"

Never call one "a text", and do not use "text" as the name for one. "Text" is
an uncountable noun in English, so "a text" and "every text" read as errors, and
"text" alone does not tell the reader which thing is meant. Use "translatable
string" for a string that a researcher or developer writes and that can be
translated. Use "localized string" for that string in one particular language.

| Do not write                                | Write                                                   |
| ------------------------------------------- | ------------------------------------------------------- |
| every text that accepts piped values        | every translatable string that accepts piped values     |
| a text whose translation is missing         | a translatable string whose translation is missing      |
| the French text is shown to the participant | the French localized string is shown to the participant |

"Text" keeps its ordinary uses: a text field, the text of a page, bold text.

#### Do not use "holds" for "contains"

A file, a protocol, a stage or a string does not "hold" things. Write
"contains", "includes", "stores" or "has", whichever is literally true. Keep
"hold" for its physical and idiomatic senses, such as holding down a key.

| Do not write                    | Write                              |
| ------------------------------- | ---------------------------------- |
| the protocol holds the wording  | the protocol contains the wording  |
| text can also hold logic        | a string can also contain logic    |
| the row holds the wording shown | the row contains the wording shown |

The same applies to any other verb used outside its ordinary sense. If a
dictionary would not list the sense that you intend, choose another verb.

### 5. Say the concrete thing

A phrase is too abstract if the reader cannot point to what it refers to. Name
the moment, the place or the action.

| Do not write                                                                    | Write                                                                   |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A node with none of these is shown as "Unnamed", in the interview's own wording | A node with none of these is shown as "Unnamed" during the interview    |
| The interview presents each value in the participant's language                 | During the interview, each value is shown in the participant's language |

## Checking a sentence

Ask these questions of every sentence that you write or keep:

1. Would a copy editor add a word to it? Add the word.
2. Does every clause have its own verb, in a tense that a reader expects?
3. Can the reader tell which word each qualifier belongs to?
4. Is every phrase one that a reader could find in a dictionary, a textbook or
   the glossary? If you invented it, replace it.
5. Can the reader point to the thing that each phrase refers to?
6. Does it call a translatable string "text" or "a text"? Name it properly.
7. Does it use "holds", or another verb, in a sense that a dictionary would
   not list? Replace the verb.

A sentence that passes is usually a little longer than the one it replaces.
That is the intended result. Do not shorten it again.

## Text that keeps its exact wording

- **Interface labels quoted in documentation** must match the app exactly, so
  that a reader can find them on the screen. If a label breaks these rules, the
  fix is to change the label in the app and its locale catalogs, then update
  the documentation. Do not paraphrase a label in the documentation, and report
  any label that needs this change.
- **Code, identifiers, file names and addresses.**
- **Quotations** from participants, publications or other sources.

## Editing text that already exists

- Change only the sentences that break a rule, and keep their meaning. Do not
  restyle prose that is already standard English, including prose written by a
  person in a different voice from yours.
- A heading's text produces its id. When you change a heading in the
  documentation, update every link to its old id, and the `{#id}` marker on the
  same heading in each translated page.
- English text that has translations makes them stale when it changes. Follow
  the `verifying-translations` skill (Claude Code: invoke `verifying-translations`)
  before committing. Check whether each translation repeats the same fault, for
  example a word-for-word rendering of a coined phrase, and correct it there
  too.

## Related guidance

- Tone, vocabulary and internationalisation rules for interface copy are in the
  `developing-network-canvas-ui` skill.
- Release notes have their own structure in the `simplifying-release-notes`
  skill. These grammar rules apply to them as well.
