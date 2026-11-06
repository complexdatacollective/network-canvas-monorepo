<!--
  Walkthrough for the "Name Generator (using quick add)" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (NameGeneratorQuickAdd.md).
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

# Name Generator (using quick add)

## What a name generator is

<!-- scene: name-generator-intro -->

Name generators are one of the fundamental parts of a network interview. They let participants create **alters**: the members of their network, such as people, places or organizations, one of the two main things your network data describes. Each alter they add becomes a node, and later stages such as sociograms, bins and follow-up questions work with the alters named here.

The form and quick-add name generators share the same parts: a **prompt** that explains the task, a **list** of the alters named so far, a **button** that adds one, and optionally one or two **side panels**.

Read the full [Name Generator using Quick Add documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-using-quick-add).

## This one uses quick add

In the Name Generator (using quick add), the add button opens a single box. The participant types one thing, usually a name, presses Enter, and the alter is added. It is the quickest way to name many alters.

If you also want to ask a few questions about each alter as it is named, use the [Name Generator (using forms)](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-using-forms). If you already have a list of the alters they might name, use the [Name Generator for Roster Data](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/name-generator-roster).

## What data it collects

Every alter named becomes one row in your exported data. What the participant typed goes in one column, the quick add attribute, and later stages add more columns to the same rows.

## When to use it

Use this stage when you want participants to name alters quickly, without collecting anything else about them at the same time.

> Do: Use this stage when you want to name alters quickly without the burden of collecting other attributes at the same time.

> Avoid: Adding additional attributes on this stage that could more accurately be collected elsewhere.

## Choose what this stage creates

<!-- section: Node setup -->

Pick the **node type** the alters named here will be, for example _Person_. Every node added on this stage is created as that type, and the type decides which attributes quick add can fill in.

If the type you need does not exist yet, create it here.

<!-- include: node-type -->

## Choose what quick add records

<!-- section: Quick add configuration -->
<!-- field: quickAdd -->

Whatever the participant types into the box is saved to this one **attribute**. It must be a text attribute, so the attribute picker offers only text attributes; select one this node type already has, or create a new one.

> Do: Use an attribute called `name` unless you have a good reason to use another. Network Canvas labels nodes with it throughout the interview.

Read more about [node labelling](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/node-labelling).

## Decide whether an answer is required

<!-- section: Quick add configuration -->

The **Validation** section under the picker holds the rules for what the participant types. A new attribute created here starts out required, since what they type is all they give for each alter. Switch off **Required answer** to allow an empty one.

These rules belong to the attribute in the codebook, so a change applies wherever its value is typed in, not only on this stage.

Read more about [field validation](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/field-validation).

<!-- include: attribute-search -->

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

## Customize built-in wording

<!-- section: Customize built-in wording -->

Network Canvas supplies the words this stage shows, and this section lets you rewrite them for your study:

- **Quick-add placeholder**: shown in the box until the participant starts typing. Say what to type for this node type, such as _a first name or nickname_.
- **Minimum not reached** and **Maximum reached**: shown only when the stage has those limits.

Each of these can include the node type's name, so choose a name that reads naturally to participants.

The hint beside the box that says how to finish adding an alter is under **Shared by every stage of this kind**, so changing it changes every quick-add stage.

Read more about [translating your protocol](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol).

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
