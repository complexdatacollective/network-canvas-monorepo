<!--
  Walkthrough for the "Name Generator (using forms)" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (NameGenerator.md).
  - The "# " heading is the walkthrough's title, shown at the top of the panel.
  - Each "## " heading starts a step. Everything under it, up to the next
    "## ", is that step's body (ordinary markdown: paragraphs, lists, links,
    **bold**, images, > quotes).
  - Directives are HTML comments on their own line inside a step, e.g.
    "section: Participant prompts" wrapped in an HTML comment:
      section: <title>   highlight and scroll to the editor section whose
                         title this is
      field: <name>      within that section, highlight the field with this
                         form name instead of the whole section
      scene: <name>      play an animated scene (see scenes/sceneRegistry.ts
                         for the names)
      dialog: <text>     a step for a dialog, not the editor: it is shown
                         only while a dialog whose title matches is open.
                         "form field" matches any title containing it
                         ("Create form field", "Edit form field");
                         "=attribute" matches a title that is exactly that;
                         alternatives are separated by "|". Dialog steps
                         play in order while it is open, and each dialog
                         keeps its place while another is opened from
                         inside it. The last one asks the researcher to
                         save (naming the dialog's own save button, e.g.
                         "Add") and rings that button, or, for a dialog
                         with no save button, to make their choice; once
                         the dialog closes the walkthrough picks up where
                         it was. Their "field:" looks inside the dialog.
  - Lines starting "> Do:" and "> Avoid:" render as do / don't callouts.
    Consecutive ones are grouped together.
  - Anything above the "# " heading (like this note) is ignored.

  Save the file and the panel updates live.
-->

# Name Generator (using forms)

## What a name generator is

<!-- scene: name-generator-intro -->

Name generators are one of the fundamental parts of a network interview. They let participants create **alters**: the people in their network, one of the two main things your network data describes. Each person they add becomes a node, and later stages such as sociograms, bins and follow-up questions work with the people named here.

The form and quick-add name generators share the same parts: a **prompt** that explains the task, a **list** of the people named so far, a **button** that adds someone, and optionally one or two **side panels**.

## This one uses a form

<!-- scene: name-generator-form -->

In the Name Generator (using forms), the add button opens a **form** the participant fills in to create each person. The form can ask one or more questions, so this stage combines naming people with collecting some basic information about each of them.

If you only need names, the [Name Generator (using quick add)](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-using-quick-add) is quicker for participants. If you already have a list of the people they might name, use the [Name Generator for Roster Data](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-roster).

## What you get

<!-- scene: name-generator-data -->

Every person named becomes one row in your exported data, and every question on the form becomes a column. Later stages add more columns to the same rows.

## When to use it

Use this stage when you want to collect a small amount of information about each person at the moment they are named.

> Do: Use it for a few attributes per person. Asking them here can be more efficient than adding a [Per Alter Form](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/per-alter-form) stage, or other follow-up stages, later.

> Avoid: Long forms with many questions. They make naming each person more work, which can discourage participants from naming more people.

> Avoid: Attributes that are better judged against the other people in the network. Perceptual scales, for example, may work better on an [Ordinal Bin](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/ordinal-bin) stage.

Read the full [Name Generator using Forms documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-using-forms).

## Choose who this stage creates

<!-- section: Node setup -->

Pick the **node type** the people named here will be, for example _Person_. Every person added on this stage is created as that type, and the type decides which attributes the form can record.

If the type you need does not exist yet, create it here.

## Name the type

<!-- dialog: create new node type | edit this node type -->
<!-- field: name -->

The type's name is how it appears in the [codebook](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/codebook) and in your exported data, for example _Person_, _Organization_ or _Place_. Some built-in messages, such as the ones about nomination limits, can include it, so choose a name that reads naturally to participants.

> Do: Use one type for everyone who can appear in the same network, and tell them apart with attributes, rather than making a new type for each prompt.

## Choose how it looks

<!-- dialog: create new node type | edit this node type -->
<!-- field: color -->

The colour and shape decide how people of this type are drawn throughout the interview. The icon appears on the button participants use to add someone.

> Do: Give each node type a distinct colour, so participants can tell them apart on a sociogram.

## Build the form

<!-- section: Form configuration -->
<!-- field: form.title -->
<!-- scene: name-generator-form -->

These are the questions the participant answers each time they add someone. The **form title** is the heading shown at the top of the form, such as _Add a person_. Each field below it records one attribute of the person.

> Do: Include a field for an attribute called `name`, so people are labelled correctly everywhere else in the interview.

Read more about [forms](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/forms), and open a field, or create a new one, for a tour of the field editor.

## Choose what this field records

<!-- dialog: form field -->
<!-- field: variable -->

Each field saves its answer to an **attribute** of the person. Select an existing attribute, or create a new one.

## Write the question

<!-- dialog: form field -->
<!-- field: prompt -->

This is the question the participant reads above the input, such as _"What is this person's first name?"_. Keep it short; it is asked once for every person named.

## Add a hint

<!-- dialog: form field -->
<!-- field: hint -->

A hint appears under the question in smaller text. Use it for an example or a short instruction, such as _"First name or a nickname is fine"_, rather than making the question longer.

## Choose how they answer

<!-- dialog: form field -->
<!-- field: _component -->
<!-- scene: name-generator-input-controls -->

The **input control** decides what the participant uses to answer: a text box, a set of options, a toggle, a slider and so on. For a new attribute, the control you pick also sets what kind of data it holds. For an existing attribute, only the controls that suit its type are offered.

Read more about [input controls](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/input-controls).

## Set the options

<!-- dialog: form field -->

Controls that offer a choice, such as radio buttons, checkboxes or a Likert scale, need a list of options. Each has a label the participant sees and a value that is saved in your data.

## Check the answers

<!-- dialog: form field -->
<!-- field: showValidationHints -->
<!-- scene: name-generator-validation -->

Validation rules, such as making a field required or setting a minimum length, stop the form being saved until the answer fits. Switch on **Show validation hints** to tell participants the rules before they answer, not only after they get one wrong.

Read more about [validation](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/field-validation).

## Try the field

<!-- dialog: form field -->

The **Interactive preview** beside the editor shows the field as participants will see it. Type an answer there to check the question, hint, control and validation together.

## Find or create an attribute

<!-- dialog: =attribute | create or select an attribute -->

Search the attributes this node type already has, or type a new name to create one.

> Do: Reuse an existing attribute when you are asking the same thing again, so the answers end up in one column of your data.

> Do: Choose names you will recognise in your data. Short names without spaces, such as `close_friend`, are easiest to work with in analysis software.

Read more about [variables and attributes](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/variables).

## Rename the attribute

<!-- dialog: edit attribute name -->

Renaming changes the attribute everywhere it is used in this protocol, and the column it becomes in your exported data.

> Avoid: Renaming an attribute after you have started collecting data, since earlier and later exports will no longer line up.

## Write the prompts

<!-- section: Prompt collection -->
<!-- scene: name-generator-prompts -->

A prompt is the question shown beside the list, such as _"Who have you discussed important matters with in the last six months?"_. Add more than one prompt to ask several questions on the same stage; the participant moves through them in order.

Read more about [prompts](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/prompts).

## Write the prompt text

<!-- dialog: create prompt | edit prompt -->
<!-- field: text -->

This is the question the participant reads while naming people. Ask about one relationship at a time, and say what counts, for example a time period.

## Record which prompt named them

<!-- dialog: create prompt | edit prompt -->
<!-- field: additionalAttributes -->
<!-- scene: name-generator-additional-attributes -->

You can set an attribute on everyone named in response to this prompt, such as `discuss_matters` set to true. Later you will know which question each person was named for, even when several prompts share one stage.

Read more about [additional attributes](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/additional-variables).

## Offer people from elsewhere

<!-- section: Side panels -->
<!-- scene: name-generator-panel-sources -->

A side panel lists people beside the question, so the participant can drag them in instead of typing them again. Each panel draws from one of two places:

- **The interview so far**: people already named on earlier stages or prompts. Use this when several prompts may name the same people, so they can be added again without duplicates.
- **A network data file**: a roster you import, such as everyone in a class or team. The same list is shown to every participant.

A stage can have up to two panels, for example one of people already named and one of the roster.

Read more about [working with roster data](https://documentation.networkcanvas.com/en/design-protocols/tutorials/working-with-rosters).

## Name the panel

<!-- dialog: create panel | edit panel -->
<!-- field: title -->

The title is shown at the top of the panel in the interview, for example _People you've already named_ or _Your classmates_. Say what the list is, so the participant knows why it is there.

## Choose where the people come from

<!-- dialog: create panel | edit panel -->
<!-- field: dataSource -->
<!-- scene: name-generator-panel-sources -->

**The in-progress interview** shows people already in this participant's network. Dragging one in adds them to this prompt rather than creating someone new.

**A network data file** shows the rows of a roster you import as a CSV or JSON file. Dragging one in creates a person from that row, and they then leave the roster: each roster entry can be named once.

## Filter who appears

<!-- dialog: create panel | edit panel -->
<!-- scene: name-generator-filter -->

Switch on **Panel filter** to show only some people, for example only people whose `close_friend` attribute is true, or only roster rows for one class. The filter applies on every prompt of this stage. Without one, the panel shows everyone in its source.

Read more about [network filtering](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/network-filtering).

## Import or reuse a roster

<!-- dialog: choose a data file -->

Import a CSV or JSON file from your computer, or choose one already stored in this protocol. The file travels inside the protocol, so every participant sees the same list.

> Do: Include a `name` column; it becomes each person's label once they are named.

> Do: Check the first row holds your column names, and that names are unique.

> Avoid: Assuming very large rosters will be quick. They work, but loading and searching slow down, so test on the devices you will use in the field.

Read more about [preparing a roster file](https://documentation.networkcanvas.com/en/design-protocols/tutorials/working-with-rosters#how-to-create-a-roster) and [resources](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/resources).

## Build a rule

<!-- dialog: construct a rule -->

A rule picks out the people, connections or the participant's own answers that should count. Choose what the rule looks at, then either an attribute and the value it must have, or simply whether something exists.

When a filter has more than one rule, you choose whether all of them must match or any one is enough.

Read more about [network filtering](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/network-filtering) and [skip logic](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/skip-logic).

## Limit how many people can be named

<!-- section: Nomination limits -->
<!-- scene: name-generator-limits -->

Switch on this section to set a minimum, a maximum, or both. The limits count everyone named on the stage, across all of its prompts.

At the maximum, the add button is switched off and the participant is told to move on. Under the minimum, they cannot leave the last prompt until they have named enough people.

> Do: Say in the prompt how many people you are asking for, so the limit is not a surprise.

## Customize built-in wording

<!-- section: Customize built-in wording -->

Network Canvas supplies the messages this stage shows, such as the ones for reaching the minimum or maximum. Switch on this section to rewrite them for your study. Some of the wording is shared by every stage of this kind, so changing it there changes it everywhere.

Read more about [translating your protocol](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol).

## Decide when this stage appears

<!-- section: Skip logic -->
<!-- scene: name-generator-skip-logic -->

Skip logic shows or skips this whole stage based on rules, for example only asking about coworkers if the participant said earlier that they work. When the stage is skipped, choose where the interview carries on.

Read more about [skip logic](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/skip-logic).

## Leave notes for the interviewer

<!-- section: Interviewer guidance -->

Write notes for the person running the interview, such as what to say if the participant is unsure who to include. Participants never see them; they appear in the protocol summary you can print for interviewers.

## You're ready

<!-- scene: name-generator-intro -->

That covers the settings that shape this stage. Use **Preview** in the toolbar to try the stage as a participant would see it.
