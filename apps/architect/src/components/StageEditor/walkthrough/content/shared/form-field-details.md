<!--
  Shared steps for the form field window that hold for any form, whatever it
  is about: hint, input control, options, validation and preview. A form's
  own walkthrough writes the two steps before these (what the field records,
  and its question), then includes these with the line
  "include: form-field-details" in an HTML comment.
-->

## Add a hint

<!-- dialog: form field -->
<!-- field: hint -->

A hint appears in smaller text under the question. Use it to give an example or a short instruction instead of making the question longer.

## Choose the input control

<!-- dialog: form field -->
<!-- field: _component -->
<!-- scene: form-field-input-controls -->

The **input control** is what the participant uses to answer, such as a text box, a set of options, a toggle or a slider. For a new attribute, the control you pick also sets the kind of data the attribute holds. For an existing attribute, only the controls that suit its type are offered.

The choice of control appears once the field has an attribute, so in a new field, choose or create an attribute first.

Read more about [input controls](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/input-controls).

## Set the options

<!-- dialog: form field -->

Controls that offer a choice, such as radio buttons, checkboxes or a Likert scale, need a list of options. Each option has a label, which the participant sees, and a value, which is saved in your data.

## Set validation rules

<!-- dialog: form field -->
<!-- field: showValidationHints -->
<!-- scene: form-field-validation -->

Validation rules set conditions an answer must meet, such as being required or having a minimum length. The form cannot be saved until the answer meets them. Switch on **Show validation hints** to show participants the rules before they answer, rather than only after an answer breaks one.

Read more about [validation](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/field-validation).

## Try the field

<!-- dialog: form field -->

The **Interactive preview**, in the other half of this window, shows the field as participants will see it. Try answering the field there, and use **Check response** to test your validation rules.
