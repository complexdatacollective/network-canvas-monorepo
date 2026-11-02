# Working with rosters — storyboard

Source: `apps/documentation/docs/design-protocols/tutorials/working-with-rosters.en.md` (as of `ca961f1846`).
Prerequisites read: `key-concepts/resources.en.mdx`, `interface-documentation/name-generator-roster.en.mdx`. Linked but not prerequisite (read for scope only): `key-concepts/additional-variables`, `key-concepts/network-filtering`, `key-concepts/node-labelling`.
Variant: the **Architect** tab (the browser app). Architect Classic readers are sent to the article.
UI labels confirmed against `packages/protocol-builder/src` (the stage editor Architect renders: `editors/name-generator-roster/sections/*`, `sections/PromptsSection.tsx`, `sections/name-generator-prompts/NameGeneratorPromptsSection.tsx`, `sections/alter-limits/AlterLimitsSection.tsx`, `sections/panels/NodePanelsSection.tsx`, `fields/EntityTypePickerField.tsx`, `fields/AssetPickerField.tsx`, `resources/components/resourceKinds.ts`, `interfaces/interfaceNames.ts`) and `apps/architect/src` (`Timeline/Timeline.tsx`, `Timeline/InsertButton.tsx`, `Screens/NewStageScreen`, `ProjectNav/StageEditorNav.tsx`, `StageEditor/StageEditorChrome.tsx`). Guide anchors confirmed on the rendered page.

## Brief

- **Reader:** A researcher who has used Architect before (the article's prerequisite: "familiar with Network Canvas") and has a protocol open. They have a list of people — a class, an office, a team — in a spreadsheet, or want to try the example first. They know spreadsheets; they may not know what a CSV file is or how strict it is. They know _stage_ and _prompt_ from Architect; they do not know _roster_, _alter pool_ or _sociocentric_.
- **Outcome:** Their protocol has a **Name Generator for Roster Data** stage built on their roster file, with card details, sorting and search set up and at least one prompt, and they have dragged a roster card into the node panel in **Preview**. Whole-network readers also have an "identify yourself" stage before it.
- **Context of use:** Two or three windows: the walkthrough in a docs dialog, Architect in another tab, and (in chapter 2) a spreadsheet program. Every do beat happens in Architect or the spreadsheet. Preview opens a third tab.
- **Embedding:** The start card sits under the article's **Adding the roster to a Network Canvas Interview** heading, inside the **Architect** tab. Per-section buttons go under **How to create a roster**, **Selecting the Name Generator Interface**, **Formatting the display of the roster**, **Prompting for a roster item**, and **Tips for rosters in sociocentric studies**.
- **Unfamiliar terms:**
  - _roster_ — defined in 1.1 ("a list of people everyone in your study sees").
  - _CSV file_ — defined in 2.4 ("a plain file of comma-separated values; your spreadsheet can save one").
  - _card_ — shown on screen; 1.1 shows cards turning into people.
  - _node_ — avoided in text; said as "person". It appears on screen as **Node type**, which the reader knows from Architect.
  - _attribute_ — shown on screen (**Attribute**); 4.1 says "column".
  - _alter pool_ — avoided. 5.4 says "everyone already named".
  - _sociocentric / whole network_ — the 7.1 question says "Are the people answering on the roster themselves?" and uses "whole-network study" only as a label.
  - _ego_ — avoided on screen except in the variable name `is_ego`, which the reader types; 7.4 says what it marks.
  - _UUID, adjacency matrix_ — omitted.

## Judgment calls

1. **Architect only, Classic linked out** (1.2). The article's Classic tab differs only in where things are, but every label is different and its screenshots are Classic-only. A full Classic branch doubles the build for an app in maintenance mode.
2. **The example roster is a first-class path** (1.3). The article offers `simpsons-roster.csv` "to follow along". Readers who pick it skip chapter 2 entirely; it is the fastest way to see the result before preparing their own file.
3. **Duplicate names are handled while preparing the file** (2.3), not as a separate "pitfall" chapter. The article places name collisions after everything else, but the fix — make every name unique — only works before the file is imported. Collision type 2 (a participant adds someone outside the roster with the same name) is interviewer practice, not something the reader builds, so it is linked out.
4. **No preview-the-resource beat.** The article says to check the file with the eye icon before choosing it. In Architect the stage editor's file picker has no eye icon; the stage instead lists the file's columns under **What this data file holds**. The checkpoint (3.7) uses that list. The eye icon still exists on the **Resources** page; see guide change 2.
5. **Search is set to Low accuracy** (4.4), as the article says. The interface documentation says accuracy should rise as the roster grows. 4.4's text adds "for a short list"; a reader with hundreds of names may need higher. Disagree if the walkthrough should not recommend a level at all.
6. **The alter pool is a choice** (5.2), shown only to readers asking several prompts about the same people. It is the article's longest conceptual section, but readers with one prompt never act on it.
7. **The side-panel stage is linked out, not built** (5.5). Building a **Name Generator (quick add)** stage with two side panels is a second walkthrough's worth of steps on a different interface. 5.5 says what to build and links to the section; a reader who needs it follows the guide.
8. **Preview, not Interviewer, is the check** (chapter 6). The article's prerequisites list Interviewer, but Preview shows the same stage without exporting and installing the protocol.
9. **The whole-network chapter comes last but builds a stage that goes first** (7.2 uses **Add stage here** above the roster stage). Putting it first would make every reader answer a question most do not need before they have built anything.
10. **The whole-network filter is a pointer** (7.5). Stage filters are not offered on roster or quick add stages, only on later stages such as sociograms and forms, which this reader may not have built yet. 7.5 says to filter those stages by `is_ego` and links to Network Filtering.
11. **Size guidance is one clause** (4.4) rather than a beat. The reader acts on it only by choosing search accuracy.
12. **Chapter 4 has no checkpoint before chapter 5.** Chapters 4 and 5 are both in the same stage editor and chapter 6 checks them together in Preview. Every other procedure chapter ends with one.

## Guide changes

The storyboard already uses the corrected wording for each.

1. **Data source label.** The article says the program asks for "Data Source for Roster" and that the file "will be available to select… Otherwise, you can upload it now". In Architect the section is **Roster source**, and one button, **Select a data file**, opens **Choose a data file**, which offers both **Import a data file** and **Resources in this protocol**.
2. **The eye icon.** "Each roster resource has a preview button (an eye icon)" is true only on the **Resources** page in Architect, not in the stage editor. Say so under the Architect tab, and mention **What this data file holds**, which lists the file's columns once it is chosen.
3. **Card display.** "Turning on 'card display options'" → turn on **Card display**, then **Add new display property**. "The left hand drop down… the right hand item" → **Attribute** and **Label**.
4. **Sorting.** The article's "enable the cards to be sorted" is **Roster sorting** → **Add new sortable property** (what participants can sort by). It does not mention **Sort rule** (the starting order), which the walkthrough also leaves out.
5. **Search.** Name the section **Roster search**, and the fields **Searchable attributes** and **Search accuracy** (**Low accuracy**).
6. **Stage name and node type.** "Give the stage a name" → the name at the top of the stage editor. "Create or select a node type" → pick it under **Node type**, or **Create new node type**.
7. **Additional variables.** The alter-pool section says to "use the 'assign additional variables' feature when creating a prompt". In the prompt it is **Additional attributes** → **Add new attribute to assign**.
8. **Quick add's name.** Architect calls it **Name Generator (quick add)**, not "Name Generator (using quick add)". Its side panel's source for people already named is **Use the network from the in-progress interview**.
9. **Minimum and maximum.** Sociocentric step 1's "set the stage's minimum and maximum number of alters to 1" is the **Nomination limits** section: **Minimum number of alters** and **Maximum number of alters**.
10. **Screenshots.** Every screenshot in the article is Architect Classic. The Architect tab has none; the walkthrough's captures could also be used as stills in the article.

## Unverified labels

- How a new attribute is created inside **Add new attribute to assign** (the variable's name, type and value fields). 5.3 and 7.4 say "a true/false variable" without quoting its fields. Confirm during capture.
- Whether **What this data file holds** lists every heading, including the `name` column, exactly as written in the file.
- The spreadsheet programs' **Save As** / **Download** wording for CSV (2.4). Excel, Calc and Google Sheets differ; 2.4 names the format, not the menu.
- Preview's node panel and card layout for a roster stage. The capture will show it; 6.2's text describes behavior from the interface documentation.

## Coverage map

| Source section                                                  | Treatment                    | Reason                                                                                                        |
| --------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Summary, prerequisites                                          | condense → 1.2, 1.3          | The reader's Architect and roster file decide the path; the spreadsheet prerequisite is assumed in chapter 2. |
| What is a roster?                                               | condense → 1.1               | One sentence: a list everyone sees, that participants pick from. Examples of non-person rosters are omitted.  |
| Rosters are per protocol, not per participant                   | include → 1.1                | Changes what the reader prepares: one file, not one per participant.                                          |
| Rosters in Network Canvas (side panel, list of topics)          | omit                         | An overview of the article; the walkthrough's chapters replace it.                                            |
| Roster is a resource inside the `.netcanvas` file               | omit                         | Nothing to do; Architect handles it.                                                                          |
| How to create a roster: header row, `name` first                | include → 2.1, 2.2           | The two rules a file most often breaks.                                                                       |
| Other columns become variables and pass through to export       | condense → 2.1               | Half a sentence; tells the reader extra columns are worth keeping.                                            |
| Commas and quotes, use a spreadsheet not a text editor          | condense → 2.4               | Reduced to "save from your spreadsheet".                                                                      |
| Blank lines ignored                                             | omit                         | Nothing to fix.                                                                                               |
| Rosters need not be people                                      | omit                         | Doesn't change the steps.                                                                                     |
| Column headings rules (spaces, accents, empty, capitals)        | link out → 2.5 help          | Architect explains a refused heading when it happens.                                                         |
| Architect Classic heading rules                                 | omit                         | Classic readers leave at 1.2.                                                                                 |
| Values: any language; control characters                        | link out → 2.5, 3.7 help     | Same: Architect names the cell.                                                                               |
| If Architect refuses your roster                                | link out → 2.5, 3.7 help     | The checkpoints' help link.                                                                                   |
| Adding the roster: Resource Library route                       | omit                         | The stage route is what the article walks through; one route is enough.                                       |
| Autosave and download (Architect tab)                           | omit                         | Covered by Getting Started; nothing to act on here.                                                           |
| Example CSV download                                            | include → 1.4                | The example path.                                                                                             |
| Selecting the Name Generator Interface                          | include → 3.1–3.6            | The core procedure.                                                                                           |
| Preview the resource with the eye icon                          | replace → 3.7                | See judgment call 4.                                                                                          |
| Maggie's empty occupation shows alignment                       | include → 3.7 (example path) | A concrete check for the example; own-file readers check their own columns.                                   |
| Formatting the display: cards, dragging                         | condense → 1.1, 6.2          | Shown in the opening scene and checked in Preview.                                                            |
| Card display options                                            | include → 4.1–4.2            |                                                                                                               |
| Sorting                                                         | include → 4.3                |                                                                                                               |
| Search                                                          | include → 4.4                | See judgment call 5.                                                                                          |
| Translated labels vs untranslated values                        | omit                         | Only multi-language protocols; the article and Translating Your Protocol cover it.                            |
| Prompting for a roster item                                     | include → 5.1                |                                                                                                               |
| Several prompts: can't tell which prompt added a person         | include → 5.2–5.3            | Behind a choice.                                                                                              |
| What is an alter pool? Additional variables per prompt          | include → 5.3                | The action the reader takes on this stage.                                                                    |
| Side panels on Quick Add / forms                                | link out → 5.5               | See judgment call 7.                                                                                          |
| Add everyone before adding details; roster fixed in Interviewer | omit                         | Advice for protocol order beyond this stage.                                                                  |
| How large is too large?                                         | condense → 4.4               | See judgment call 11.                                                                                         |
| Collision type 1                                                | include → 2.3                | See judgment call 3.                                                                                          |
| Collision type 2                                                | omit                         | Interviewer practice, not protocol building.                                                                  |
| Don't rename nodes in Network Canvas                            | omit                         | Follows from 2.3.                                                                                             |
| Sociocentric: adjacency matrix                                  | omit                         | Analysis, after collection.                                                                                   |
| Sociocentric: identify-yourself stage, `is_ego`, filtering      | include → 7.1–7.6            | Behind a choice.                                                                                              |
| Example protocol download                                       | include → 7.F, 6.F           | The article's own next step for whole-network readers; offered to all at the end.                             |

## Choices

| Id      | Beat | Question                                                   | Options → what each shows                                                  |
| ------- | ---- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| app     | 1.2  | Which Architect are you using?                             | **In my browser** → 1.3 / **Architect Classic** → 1.F                      |
| file    | 1.3  | Which roster will you use?                                 | **My own list** → chapter 2 / **The example roster** → 1.4, then chapter 3 |
| prompts | 5.2  | Will you ask more than one question about the same people? | **One question** → 5.6 / **Several questions** → 5.3–5.5                   |
| whole   | 7.1  | Are the people answering on the roster themselves?         | **Yes, it's a whole-network study** → 7.2–7.6 / **No** → 6.F               |

## Chapters

### 1. Before you start · id: start · guide: #what-is-a-roster

They know what a roster does, which Architect they are in, and which file they will use.

| #   | Type    | On-screen text                                                                                                                    | Visual                                                                                                      | Advances when                                   | Guide link                                       |
| --- | ------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| 1.1 | explain | A roster is a list of people that everyone in your study sees. Participants drag names from it into their interview.              | scene: a stack of name cards; the cursor drags one across, and it pops into a circle labelled with the name | Continue                                        |                                                  |
| 1.2 | choose  | Which Architect are you using?                                                                                                    | scene: Architect in a browser window beside the Classic desktop app                                         | **In my browser** / **Architect Classic** → 1.F |                                                  |
| 1.F | finish  | This walkthrough covers Architect in your browser. The guide's **Architect Classic** tab has the steps for your version.          | scene: the guide's two tabs, Classic picked out                                                             | Close / "Open the Classic steps"                | #adding-the-roster-to-a-network-canvas-interview |
| 1.3 | choose  | Which roster will you use? You can try the example first and swap in your own later.                                              | scene: a spreadsheet of names beside a small five-row file stamped "Example"                                | **My own list** / **The example roster**        |                                                  |
| 1.4 | do      | [file=example] Download the [example roster](/assets/simpsons-roster.csv). It lists five people with their occupation and gender. | scene: the file drops into a Downloads folder                                                               | "I've downloaded it"                            |                                                  |

### 2. Prepare your roster file · id: prepare · guide: #how-to-create-a-roster · when: file=own

Their list is saved as a CSV file with a `name` column and no repeated names.

| #   | Type       | On-screen text                                                                                                                                   | Visual                                                              | Advances when                                    | Guide link                                                 |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| 2.1 | do         | Open your list in a spreadsheet program. Put one person per row, with column headings in the first row. Extra columns are kept with each person. | scene: a spreadsheet; a header row slides in above the names        | "It's laid out"                                  |                                                            |
| 2.2 | do         | Make the first column's heading **name**. It's what participants see on each person.                                                             | scene: the cursor types "name" into A1                              | "The first column is name"                       | #considerations-for-formatting-the-csv-file                |
| 2.3 | do         | Make every name different. Two people called "Kwame" look identical once added — use "Kwame K." and "Kwame N."                                   | scene: two "Kwame" rows glow, then become "Kwame K." and "Kwame N." | "Every name is different"                        | #collision-type-1-collisions-within-the-roster-list-itself |
| 2.4 | do         | Save it as **CSV**, a plain file of comma-separated values, from your spreadsheet program — not a text editor.                                   | scene: the sheet folds into a file tagged ".csv"                    | "I've saved the CSV"                             |                                                            |
| 2.5 | checkpoint | Your file ends in **.csv**, its first heading is **name**, and no two names match.                                                               | scene: the file with three check marks stamped beside it            | "Looks right" / "If Architect refuses your file" | #if-architect-refuses-your-roster                          |

### 3. Add a roster stage · id: stage · guide: #selecting-the-name-generator-interface

Their protocol has a roster stage for a node type, reading their file.

| #   | Type       | On-screen text                                                                                                                                                     | Visual                                                                                                       | Advances when                                    | Guide link                        |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------- |
| 3.1 | do         | In Architect, open your protocol and click **Add new stage**.                                                                                                      | capture: roster-add-stage — the timeline; the cursor clicks Add new stage and Select an Interface Type opens | "It's open"                                      |                                   |
| 3.2 | do         | Click **Name Generator for Roster Data**.                                                                                                                          | capture: roster-pick-interface — typing "roster" in the search box, then clicking the card                   | "The stage editor is open"                       |                                   |
| 3.3 | do         | Click the stage name at the top and give it a name you'll recognize, such as "Classmates".                                                                         | capture: roster-stage-name                                                                                   | "I've named it"                                  |                                   |
| 3.4 | do         | Under **Node type**, pick the type these people are, or click **Create new node type** and name it "Person".                                                       | capture: roster-node-type — creating "Person" and saving                                                     | "I've picked a type"                             |                                   |
| 3.5 | do         | Under **Roster source**, click **Select a data file**.                                                                                                             | capture: roster-select-file — the dialog Choose a data file opens                                            | "It's open"                                      |                                   |
| 3.6 | do         | Under **Import a data file**, choose your CSV file.                                                                                                                | capture: roster-import-file — the file is chosen and the dialog closes                                       | "I've chosen it"                                 |                                   |
| 3.7 | checkpoint | [file=own] **What this data file holds** lists your column headings. / [file=example] **What this data file holds** lists **name**, **occupation** and **gender**. | capture: roster-file-holds — the attribute list, zoomed                                                      | "Looks right" / "If Architect refuses your file" | #if-architect-refuses-your-roster |

Note on 3.7: the article checks alignment with the eye-icon preview (Maggie's empty occupation). See judgment call 4.

### 4. Make the roster easy to scan · id: display · guide: #formatting-the-display-of-the-roster

The cards show an extra detail, can be sorted, and can be searched.

| #   | Type    | On-screen text                                                                                                                                     | Visual                                                                         | Advances when         | Guide link                           |
| --- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------- | ------------------------------------ |
| 4.1 | explain | Each person appears as a card showing their name. Add the details participants need to tell people apart.                                          | scene: a card with a name grows a second line, "Gender: female"                | Continue              |                                      |
| 4.2 | do      | Turn on **Card display** and click **Add new display property**. Choose a column under **Attribute**, and type how it should read under **Label**. | capture: roster-card-display — turning it on, choosing gender, typing "Gender" | "I've added a detail" |                                      |
| 4.3 | do      | Turn on **Roster sorting** and click **Add new sortable property**. Choose a column participants can sort by, such as occupation.                  | capture: roster-sorting                                                        | "I've added it"       |                                      |
| 4.4 | do      | Turn on **Roster search**. Add **name** to **Searchable attributes** and set **Search accuracy** to **Low accuracy** for a short list.             | capture: roster-search                                                         | "Search is on"        | #how-large-is-too-large-for-a-roster |

### 5. Ask about the roster · id: prompt · guide: #prompting-for-a-roster-item

The stage has a prompt; readers with several prompts can tell which one added each person.

| #   | Type    | On-screen text                                                                                                                                                           | Visual                                                                                      | Advances when                            | Guide link                                                     |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| 5.1 | do      | Under **Prompt collection**, click **Create new prompt**, type your question in **Prompt text**, and click **Add**.                                                      | capture: roster-prompt — typing "Who do you study with?"                                    | "I've added a prompt"                    |                                                                |
| 5.2 | choose  | Will you ask more than one question about the same people?                                                                                                               | scene: two speech bubbles, the same card pointing to both                                   | **One question** / **Several questions** |                                                                |
| 5.3 | do      | [prompts=several] In each prompt, under **Additional attributes**, click **Add new attribute to assign**. Add a true/false variable named for the question, set to true. | capture: roster-assign — "study_together" set to true                                       | "Each prompt marks its people"           | #considering-additional-prompt-variables-what-is-an-alter-pool |
| 5.4 | explain | [prompts=several] Each person can be added only once. Someone added for the first question won't be on the list for the second.                                          | scene: a card leaves the list for the first bubble; the second bubble's list is one shorter | Continue                                 |                                                                |
| 5.5 | explain | [prompts=several] To ask the second question about everyone already named, use a **Name Generator (quick add)** stage with a side panel of the people already named.     | scene: a stage with two side panels, one labelled "Already named"                           | "I'll set that up"                       | #considering-additional-prompt-variables-what-is-an-alter-pool |
| 5.6 | do      | Click **Finished Editing**.                                                                                                                                              | capture: roster-finish-editing — back on the timeline with the new stage                    | "I'm back on the timeline"               |                                                                |

### 6. Try it in Preview · id: check · guide: #formatting-the-display-of-the-roster

They have seen a roster card become a person.

| #   | Type       | On-screen text                                                                                                                                       | Visual                                                                                             | Advances when                                | Guide link                                |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------- |
| 6.1 | do         | Open the roster stage again and click **Preview**. The stage opens in a new tab.                                                                     | capture: roster-preview-open                                                                       | "It's open"                                  |                                           |
| 6.2 | checkpoint | Drag a card into the panel beside it. It becomes a person, and leaves the list.                                                                      | capture: roster-preview-drag — Preview's roster stage; a card is dragged across and becomes a node | "It works" / "Something's wrong"             | #if-architect-refuses-your-roster         |
| 7.1 | choose     | Are the people answering on the roster themselves?                                                                                                   | scene: a classroom of desks, each with a name card, arrows between them                            | **Yes, it's a whole-network study** / **No** | #tips-for-rosters-in-sociocentric-studies |
| 6.F | finish     | [whole=no] Your roster stage is ready. The [example protocol](/protocols/Roster%20Example%20Protocol%20v1.netcanvas) shows rosters with more stages. | scene: the timeline with the roster stage stamped with a check                                     | Close / "Read about the roster interface"    |                                           |

7.1 belongs to chapter 7 but is listed here because it follows 6.2 for every reader.

### 7. Whole-network studies · id: whole · guide: #tips-for-rosters-in-sociocentric-studies · when: whole=yes

Participants pick themselves first, so they can't name themselves later.

| #   | Type    | On-screen text                                                                                                                                        | Visual                                                              | Advances when                        | Guide link                                                  |
| --- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| 7.2 | do      | On the timeline, click **Add stage here** above your roster stage, and add another **Name Generator for Roster Data** with the same type and file.    | capture: roster-ego-stage — the insert button above the stage       | "I've added it"                      |                                                             |
| 7.3 | do      | Give it one prompt: "Find yourself in this list."                                                                                                     | capture: roster-ego-prompt                                          | "I've added it"                      |                                                             |
| 7.4 | do      | In that prompt, assign a true/false variable named `is_ego`, set to true. It marks the participant.                                                   | capture: roster-ego-assign                                          | "I've assigned it"                   |                                                             |
| 7.5 | do      | Turn on **Nomination limits** and set **Minimum number of alters** and **Maximum number of alters** to 1.                                             | capture: roster-ego-limits                                          | "Both are 1"                         |                                                             |
| 7.6 | explain | Later stages that ask about the people named should leave out the participant. Filter them by `is_ego` in their **Stage filter**.                     | scene: a sociogram where the participant's circle fades out of view | "I'll filter them"                   | (link: /en/design-protocols/key-concepts/network-filtering) |
| 7.F | finish  | Participants now find themselves first, then name others. The [example protocol](/protocols/Roster%20Example%20Protocol%20v1.netcanvas) sets this up. | scene: two roster stages on the timeline, the first stamped "You"   | Close / "Read the sociocentric tips" | #tips-for-rosters-in-sociocentric-studies                   |

## Plain-language pass

1. **Do beats without the guide:** yes, except 5.3 and 7.4, whose variable-creation fields are unverified (see _Unverified labels_). 5.5 sends the reader to the guide on purpose (judgment call 7).
2. **Terms:** _CSV_ is defined in 2.4 but the example path skips chapter 2 and meets "CSV" first in 3.6 as "your CSV file". The example reader downloaded a `.csv` in 1.4, so the word is on their screen. _Attribute_ and _Node type_ are on-screen labels.
3. **Explain beats change what the reader does:** 1.1 (one file, not one per person), 4.1 (choose details that tell people apart), 5.4–5.5 (why the second stage is needed), 7.6 (filter later stages). Cut: a beat on how rosters travel inside the `.netcanvas` file.
4. **Coverage:** every source section is in the map with a reason.
5. **Backed by the source:** everything on screen is in the article or the interface documentation, except the corrected labels listed under _Guide changes_ and 6.1's "in a new tab", which comes from Architect's preview code (`PreviewHost`).

## Build notes

Where `en.ts` departs from the tables above, and why:

- **1.3 opens chapter 2, and 1.4 is built as 2.0.** A chapter whose every beat waits on an unmade choice shows as done in the chapter list, and opening it jumps to the start. With the roster choice as its first beat, chapter 2 always has a beat.
- **7.1 and 6.F are in chapter 7.** 7.1 opens the chapter and 6.F follows it for readers who answer **No**.
- **Help links to guide anchors are the beat's guide link instead** (2.5, 3.7, 6.2, 1.F, 7.F). An in-page anchor in a link would navigate without closing the dialog; "Read this step in the guide" closes it and moves focus to the heading.
- **Guide changes 1–9 are applied to the article**, each under the article's **Architect** tab where the Classic wording differs. Guide change 10 (current screenshots) is not done.
- **Text changed after capture**, to match what Architect does:
  - 3.3: a new stage is already named **Roster Name Generator**.
  - 3.4: creating a type ends with **Save entity**.
  - 4.4: **Search accuracy** is a slider.
  - 5.3 and 7.4: an attribute created in **Select attribute** is always true/false, so the step is: create it, then choose **True**.
  - 6.1: Preview starts with example data by default, which adds every roster member before the reader can drag one, so 6.1 turns it off in **Preview settings**. Preview opens in a popup window.
- **The unverified labels are now verified** by the capture run, except the spreadsheet programs' CSV menus (2.4), which are not captured.
