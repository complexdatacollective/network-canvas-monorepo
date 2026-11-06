<!--
  Shared steps for the form field window, opened from a form's Form
  configuration section. Include with the line "include: form-field" in an
  HTML comment.
-->

## Choose what this field records

<!-- dialog: form field -->
<!-- field: variable -->

Each field saves its answer to an **attribute** of the node. Select an existing attribute, or create a new one.

## Write the question

<!-- dialog: form field -->
<!-- field: prompt -->

This is the question the participant reads above the input, such as _"What is this person's first name?"_. Keep it short; it is asked once for every alter.

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
