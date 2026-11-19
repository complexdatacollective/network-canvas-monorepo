<!--
  Walkthrough for the "Anonymisation" stage.

  How this file becomes a walkthrough:

  - The file name is the stage type it belongs to (Anonymisation.md).
  - The "# " heading is the walkthrough's title, shown at the top of the panel.
  - Each "## " heading starts a step. Everything under it, up to the next
    "## ", is that step's body (ordinary markdown: paragraphs, lists, links,
    **bold**, images).
  - Directives are HTML comments on their own line inside a step, e.g.
    "section: prompts" wrapped in an HTML comment:
      section: <key>     highlight and scroll to the editor section with this
                         key (its data-section-key; the keys are listed in
                         protocol-builder's sections/sectionKeys.ts)
      field: <name>      within that section, highlight the field with this
                         form name instead of the whole section
      control: <name>    highlight a control outside the sections instead
                         (only "preview": the toolbar's Preview button)
      scene: <name>      play an animated scene (see scenes/sceneRegistry.ts
                         for the names)
  - Lines starting "> Do:" and "> Avoid:" render as do / don't callouts.
    Consecutive ones are grouped together.
  - A line "include: <name>" in an HTML comment, between steps, is replaced
    by the steps in shared/<name>.md. Use it for steps every stage type that
    has that section shares (skip logic, interviewer guidance and so on);
    edit those steps there, once.
  - Anything above the "# " heading (like this note) is ignored.

  Save the file and the panel updates live.
-->

# Anonymisation

## What an Anonymisation stage is

<!-- scene: anonymisation-intro -->

The Anonymisation stage allows the participant to choose a passphrase that protects specific node attributes using encryption. These attributes are encrypted before the data is stored, so only someone who knows the passphrase can read them.

Read the full [Anonymisation documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/anonymisation).

## Unlocking encrypted data

<!-- scene: anonymisation-return -->

Because the key is held only while the interview is open, if the interview is reloaded, for example by refreshing the page, encrypted answers are initially locked.

In this scenario, a key button appears in the navigation bar so the participant can enter their passphrase again. They enter it only once, with no confirmation, and if the passphrase doesn't match the one that encrypted their earlier answers, it is rejected.

## When to use it

Use this stage to increase trust in the interview setting, and to allow participants to disclose information needed for the interview, but not required for your analysis (such as identifiable information of alters).

> Do: Use this feature to encourage disclosure of sensitive information, such as names, in a way that makes participants feel secure about their privacy. This can lead to more honest and complete responses in interviews.

> Avoid: Enabling encryption for large numbers of attributes. The encryption process is computationally expensive.

## Explain the passphrase

<!-- section: task-explanation -->
<!-- field: explanationText -->

The **Explanation** is what the participant reads above the passphrase fields, and it is required. Use it to explain why they are being asked for a passphrase, and how this relates specifically to your study.

> Do: Clearly communicate to participants how their data will be used and the importance of the passphrase for accessing their encrypted data, including that a forgotten passphrase cannot be recovered. This transparency builds trust and encourages participation.

## Set the passphrase length

<!-- section: passphrase-rules -->
<!-- field: validation -->
<!-- scene: anonymisation-rules -->

When this section is switched off, a passphrase must be at least 8 characters long, and there is no maximum length. Switch this section on to set a **Minimum text length**, a **Maximum text length**, or both. A minimum you set replaces the default of 8, even when it is shorter.

> Do: Balance a strong passphrase that prevents unauthorized access to the encrypted data against the need for participants to remember it easily.

## Choose which attributes should be encrypted

<!-- section: encrypted-attributes -->

Click a node type to expand the list of attributes, and then tick the attributes that should be encrypted. Only text attributes are offered. Edge and ego attributes can't be encrypted.

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
