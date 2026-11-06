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
  - A line "include: <name>" in an HTML comment, between steps, is replaced
    by the steps in shared/<name>.md. Use it for steps every stage type that
    has that section shares (node type, skip logic, interviewer guidance and
    so on); edit those steps there, once.
  - Anything above the "# " heading (like this note) is ignored.

  Save the file and the panel updates live.
-->

# Name Generator (using forms)

## What a name generator is

<!-- scene: name-generator-intro -->

Name generators are one of the fundamental parts of a network interview. They let participants create **alters**: the members of their network, such as people, places or organizations, one of the two main things your network data describes. Each alter they add becomes a node, and later stages such as sociograms, bins and follow-up questions work with the alters named here.

The form and quick-add name generators share the same parts: a **prompt** that explains the task, a **list** of the alters named so far, a **button** that adds one, and optionally one or two **side panels**.

Read the full [Name Generator using Forms documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-using-forms).

## This one uses a form

<!-- scene: name-generator-form -->

In the Name Generator (using forms), the add button opens a **form** the participant fills in to create each node. The form can ask one or more questions, so this stage combines naming alters with collecting some basic information about each of them.

If you only need names, the [Name Generator (using quick add)](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-using-quick-add) is quicker for participants. If you already have a list of the alters they might name, use the [Name Generator for Roster Data](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-roster).

## What you get

<!-- scene: name-generator-data -->

Every alter named becomes one row in your exported data, and every question on the form becomes a column. Later stages add more columns to the same rows.

## When to use it

Use this stage when you want to collect a small amount of information about each alter at the moment they are named.

> Do: Use it for a few attributes per alter. Asking them here can be more efficient than adding a [Per Alter Form](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/per-alter-form) stage, or other follow-up stages, later.

> Avoid: Long forms with many questions. They make naming each alter more work, which can discourage participants from naming more.

> Avoid: Attributes that are better judged against the other alters in the network. Perceptual scales, for example, may work better on an [Ordinal Bin](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/ordinal-bin) stage.

## Choose what this stage creates

<!-- section: Node setup -->

Pick the **node type** the alters named here will be, for example _Person_. Every node added on this stage is created as that type, and the type decides which attributes the form can record.

If the type you need does not exist yet, create it here.

<!-- include: node-type -->

## Build the form

<!-- section: Form configuration -->
<!-- field: form.title -->
<!-- scene: name-generator-form -->

These are the questions the participant answers each time they add a node. The **form title** is the heading shown at the top of the form, such as _Add a person_. Each field below it records one attribute of the node.

> Do: Include a field for an attribute called `name`, so [node labelling](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/node-labelling) works correctly everywhere else in the interview.

Read more about [forms](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/forms), and open a field, or create a new one, for a tour of the field editor.

## Choose what this field records

<!-- dialog: form field -->
<!-- field: variable -->

Each field saves its answer to an **attribute** of the node. Select an existing attribute, or create a new one.

## Write the question

<!-- dialog: form field -->
<!-- field: prompt -->

This is the question the participant reads above the input, such as _"What is this person's first name?"_. Keep it short; it is asked once for every alter named.

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

<!-- include: attribute-picker -->

## Write the prompts

<!-- section: Prompt collection -->
<!-- scene: name-generator-prompts -->

A prompt is the question shown beside the list, such as _"Who have you discussed important matters with in the last six months?"_. Add more than one prompt to ask several questions on the same stage; the participant moves through them in order.

Read more about [prompts](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/prompts).

<!-- include: name-generator-prompts -->

<!-- include: side-panels -->

<!-- include: data-file -->

<!-- include: rule -->

## Limit how many alters can be named

<!-- section: Nomination limits -->
<!-- scene: name-generator-limits -->

Switch on this section to set a minimum, a maximum, or both. The limits count every alter named on the stage, across all of its prompts.

At the maximum, the add button is switched off and the participant is told to move on. Under the minimum, they cannot leave the last prompt until they have named enough.

When a stage has several prompts, the editor suggests saying in the prompts themselves how many alters you are asking for.

## Customize built-in wording

<!-- section: Customize built-in wording -->

This section appears only once the stage has a nomination limit. It holds the **Minimum not reached** and **Maximum reached** messages Network Canvas supplies; switch it on to rewrite them for your study. Both can include the node type's name, so choose a name that reads naturally to participants.

Read more about [translating your protocol](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
