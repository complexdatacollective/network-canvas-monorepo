# Storyboard

The storyboard is a markdown document the user reviews and approves before
anything is built. It is written for a person reading it top to bottom, and it
is also the exact source the build translates into player data — so every
on-screen word appears here first.

## Document structure

```markdown
# <Walkthrough title> — storyboard

Source: <article path> and <prerequisite article paths> (as of <commit>)
Variant: <for tabbed articles, which tab this covers>

## Brief
- **Reader:** <who, what they know, what they don't>
- **Outcome:** <what they have done by the end>
- **Context of use:** <what else is on screen; how they move between it and the walkthrough>
- **Unfamiliar terms:** <term — how each is handled: defined in a beat, avoided, or linked out>

## Judgment calls
<numbered: each decision the user might disagree with, and open questions>

## Guide changes
<numbered: each change the article needs so it agrees with the walkthrough —
wrong labels, missing steps, a safer order. Say whether the storyboard already
uses the corrected wording (it should).>

## Unverified labels
<labels quoted from the article that could not be checked against the product>

## Coverage map
| Source section | Treatment | Reason |
| --- | --- | --- |

## Choices
| Id | Beat | Question | Options → what each shows |
| --- | --- | --- | --- |

## Chapters
### <n>. <Chapter title>  ·  id: <chapter-id>  ·  guide: #<heading-anchor>
<one sentence: what the reader has done by the end of this chapter>

| # | Type | On-screen text | Visual | Advances when | Guide link |
| --- | --- | --- | --- | --- | --- |
```

Keep table rows short. Put longer notes (motion, a tricky capture) in footnotes
under the table.

## Beat types

Every beat is exactly one of these. The type decides how the reader advances,
so choosing it is choosing the pace.

| Type           | Use for                                                                                              | Advances when                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **explain**    | Something the reader needs to know before acting: what a fork is, why storage is chosen now.         | The reader presses Continue.                                                                   |
| **do**         | One action in the app or another tab. Shows where to click and what to type.                         | The reader presses a confirmation that names the action — "I've created the fork", not "Next". |
| **choose**     | A real fork in the reader's path: storage provider, already-has-an-account.                          | The reader picks an option. The choice is remembered and decides which later beats appear.     |
| **checkpoint** | The end of a chapter: what they should now see, and where to go if they don't.                       | The reader confirms, or follows the help link.                                                 |
| **finish**     | The end of the walkthrough, or of a branch that leaves it: what they have now, and where to go next. | The reader closes the walkthrough or follows a link.                                           |

### Patterns

- **A procedure is mostly do beats.** If a procedure's chapter has more explain
  beats than do beats, it is probably explaining something the reader does not
  need. The exception is a short opening chapter (see below).
- **Open with a "before you start" chapter** when the procedure has
  prerequisites: accounts to have, time to set aside, a second tab or a
  plain-text file to keep open, a browser mode to avoid. One or two beats; it
  is where the article's prerequisites become choices ("I already have a
  GitHub account") and warnings.
- **Use choose only when the options lead to different steps.** A choice that
  changes nothing is a quiz. Good candidates are the article's own alternatives
  ("UploadThing, or your own S3 bucket") and prerequisites a reader may already
  have. An option may end the walkthrough — for example, readers of the other
  tab of a tabbed article — by leading to a finish beat that links to the right
  section.
- **A branch may be written for a different reader.** If one option serves
  readers who already know more (an S3 bucket they set up themselves), that
  branch can be condensed to the form they fill in plus a link out for setup.
- **Conditional actions.** When a do beat applies only to some readers because
  of something they did rather than chose ("if you added more than one
  language…"), give it a second confirmation that says so: "I only have one
  language". Don't turn it into a choose.
- **Variant text.** When a beat differs only slightly by an earlier choice
  (what the checkpoint should show after an empty protocol versus a template),
  write one row with the text per option: `[empty] … / [template] …`.
- **Warnings the reader must act on** (a time limit, a character to delete, a
  password to store) get their own beat, placed at the moment they matter, not
  in an introduction. If the warning is about something the reader does, make
  it a do beat ("I've deleted the #"). If it only needs acknowledging, make it
  an explain beat with a named confirmation instead of Continue ("I'll finish
  within 2 hours").
- **End every chapter of a procedure with a checkpoint.** It catches the reader
  who went wrong two steps ago, before the next chapter builds on it. Its help
  link goes to the product's troubleshooting page if there is one, otherwise to
  the community forum (community.networkcanvas.com).

## Writing on-screen text

- **Under 25 words per beat**, not counting quoted UI labels, in one or two
  sentences. The reader is reading while switching tabs.
- **Lead do beats with the verb.** "Click **Fork**." "Paste the token into
  **UPLOADTHING_TOKEN**."
- **One action per do beat.** A tightly linked pair in the same place — copy a
  value then paste it, type a name then press the button beside it — can share
  a beat. Two different places cannot.
- **Name UI labels exactly** as the product shows them, in bold, with the same
  capitalization. The reader is matching words, not meaning. Quote labels in
  the docs page's language; a walkthrough that has the reader change the app's
  language should do so as late as possible, and say that later labels will
  appear in the language they chose.
- **Say why only when it changes what the reader does.** "Keep this text safe —
  you'll paste it into Netlify in a few minutes" earns its place; a sentence
  about how Prisma pools connections does not.
- **Plain words over jargon.** Use the term the reader will see on screen; for
  any other technical term, either define it in a few words the first time or
  avoid it. List every one under _Unfamiliar terms_.
- **No internals.** How a system works belongs in the article. Include it only
  when the reader must act on it, and then only the part they act on.
- Write in the docs' own voice: second person, present tense, US spelling.

## Visuals

Each beat names one visual, and every beat has one: the real screen (a
capture or a still) or an illustrated scene. There are no text-only beats.
When a step has no screenshot, draw a scene of it — a sign-in page with the
cursor clicking the GitHub button, a text file with the `#` being deleted —
and flag the missing screenshot under _Guide changes_ if the article should
have one. `references/screen-capture.md` explains how to choose and produce
them.

| Visual                 | Meaning                                                                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture: <name>`      | A recording of the product running in local dev, produced by the capture script. Describe what it shows.                                                                                                                   |
| `scene: <description>` | An illustrated scene in the style of networkcanvas.com/updates. Describe its little story: what arrives, what travels where, what gets stamped. Use one for every explain beat, and for any other beat with no screenshot. |
| `still: <path>`        | An existing screenshot, usually from the article. Name what to highlight, in the order the text mentions it; the player zooms there and moves a cursor to each.                                                            |

## Guide links

Every chapter names the guide section it covers (`guide: #anchor`), and the
player offers that link throughout the chapter. Give a beat its own link only
when a specific subsection or tip in the source covers it in more depth.

Anchors are generated by `rehype-slug` from the heading text (lowercase,
punctuation dropped, spaces to hyphens: "Set up a custom domain (optional)" →
`#set-up-a-custom-domain-optional`). In tabbed articles, a heading repeated in
a later tab gets a `-1` suffix, so confirm anchors on the rendered page rather
than deriving them.

## Plain-language pass

Before presenting the storyboard, reread every beat as the reader in the brief
and check:

1. Could they do every **do** beat without opening the guide?
2. Is every term on screen either one they know, one shown on their screen, or
   one defined in an earlier beat?
3. Does every **explain** beat change what they will do next? Cut any that
   don't.
4. Is every source section in the coverage map, and does every _omit_ or _link
   out_ have a reason the user could disagree with?
5. Is everything on screen backed by the source, or listed under _Guide
   changes_?

Record what you changed or are unsure about under _Judgment calls_.

## Worked examples

### Fresco: the database chapter

The article explains Neon, Prisma, and pooled and unpooled connections. The
reader needs none of that to succeed, but must not miss the `#` they have to
delete.

```markdown
### 2. Create a database  ·  id: database  ·  guide: #create-a-database
They have a Neon database and its connection text saved in a plain-text file.

| # | Type | On-screen text | Visual | Advances when | Guide link |
| --- | --- | --- | --- | --- | --- |
| 2.1 | explain | Fresco keeps your study's data in a database. Next, you'll create a free one on Neon. | scene: data travels from your Fresco into a Neon database that stacks up | Continue | |
| 2.2 | do | Go to **neon.com**, click **Login**, and sign in with **GitHub**. | scene: Neon's sign-in page; the cursor clicks Continue with GitHub and the account appears | "I'm signed in" | |
| 2.3 | do | Click **Create Project**. | still: neon-db-1.png, highlight Create Project | "It's open" | |
| 2.4 | do | Name your database, set **Region** to **AWS US East 2 (Ohio)**, and click **Create**. | still: neon-db-2.png, highlight Region | "I've created it" | |
| 2.5 | do | Under **Connect to your database**, click **Connect**. | still: neon-db-3.png, highlight Connect | "It's open" | |
| 2.6 | do | Choose **Prisma**, open the **.env** tab, and click **Copy snippet**. | still: neon-db-4.png, highlight each in turn | "I've copied it" | |
| 2.7 | do | Paste it into a plain-text file, then delete the **#** before **DATABASE_URL_UNPOOLED**. | scene: the text file; the cursor clicks the # and it is deleted | "I've deleted the #" | #create-a-database |
| 2.8 | checkpoint | Two lines start with **DATABASE_URL**, with no **#** in front of either. | scene: the text file, both DATABASE_URL lines picked out | "Looks right" / troubleshooting | |
```

Guide changes this chapter raised: the article says "Copy Snippet" (the button
is **Copy snippet**); its region screenshot shows N. Virginia while its tip
recommends Ohio; and it says "a text file or notes app", but rich-text notes
apps can turn the straight quotes into curly ones, so the walkthrough says
"plain-text file". Left out: the Prisma version comment, pooled versus unpooled
connections, and the region's latency rationale.

### Architect: choosing how to start

A choice whose options lead to different steps, one of which leaves the
walkthrough, and a checkpoint with variant text.

```markdown
| # | Type | On-screen text | Visual | Advances when | Guide link |
| --- | --- | --- | --- | --- | --- |
| 1.2 | choose | Which Architect are you using? | scene: Architect in a browser window beside the Classic download | **In my browser** / **Architect Classic, the download** → 1.F | |
| 1.F | finish | This walkthrough covers Architect in your browser. The guide's **Architect Classic** tab has the steps for your version. | scene: the Classic download, with the guide's tab picked out | Close / "Open the Classic steps" | (Classic tab's heading; confirm on the rendered page) |
| 3.1 | choose | How do you want to start? | still: home-screen.png, highlight the three ways to start | **A new, empty protocol** / **From a template** / **From a .netcanvas file** | |
| 4.3 | checkpoint | [empty] Your timeline is empty except for **Add new stage**. / [template, file] Your timeline lists the protocol's stages. | still: overview-screen.png | "Looks right" / FAQ | |
```
