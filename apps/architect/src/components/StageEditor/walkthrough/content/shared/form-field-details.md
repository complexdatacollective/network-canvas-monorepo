<!--
  Shared steps for the form field window that hold for any form, whatever it
  is about: question, hint, input control, options, validation and preview.
  A form's own walkthrough writes the step before these (what the field
  records), then includes these with the line "include: form-field-details"
  in an HTML comment.
-->

## Write the question

<!-- dialog: form field -->
<!-- field: prompt -->

This is the question the participant reads above the input. Keep the question short, especially on a form the participant answers for every alter or edge.

> Do: Use [piped text](https://documentation.networkcanvas.com/design-protocols/piped-text) as part of the question to improve it

> Avoid: Long questions with many clauses can be confusing or hard to read. State the question simply, and use hint text for details or examples.

## Add a hint

<!-- dialog: form field -->
<!-- field: hint -->

A hint appears in smaller text under the question. Use it to give an example or a short instruction instead of making the question longer.

## Choose the input control

<!-- dialog: form field -->
<!-- field: _component -->
<!-- scene: form-field-input-controls -->

The **input control** is what the participant uses to answer. For a new attribute, the control you pick also sets the kind of data the attribute holds. For an existing attribute, only the controls that suit its type are offered.

Read more about [input controls](https://documentation.networkcanvas.com/design-protocols/key-concepts/input-controls).

## Set the options

<!-- dialog: form field -->

Controls that offer a choice, such as radio buttons, checkboxes or a Likert scale, need a list of options. Each option has a label, which the participant sees, and a value, which is what appears in your exported data.

## Set validation rules

<!-- dialog: form field -->
<!-- field: showValidationHints -->
<!-- scene: form-field-validation -->

Validation rules set conditions an answer must meet, such as being required or having a minimum length. Switch on **Show validation hints** to show participants the rules as part of the hint text.

Read more about [validation](https://documentation.networkcanvas.com/design-protocols/key-concepts/field-validation).

## Try the field

<!-- dialog: form field -->

The **Interactive preview**, in the other half of this window, shows the field as participants will see it. Try answering the field there, and use **Check response** to test your validation rules.
