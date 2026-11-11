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

A hint appears under the question in smaller text. Use it for an example or a short instruction, rather than making the question longer.

## Choose the input control

<!-- dialog: form field -->
<!-- field: _component -->
<!-- scene: form-field-input-controls -->

The **input control** decides what the participant uses to answer: a text box, a set of options, a toggle, a slider and so on. For a new attribute, the control you pick also sets what kind of data the attribute holds. For an existing attribute, only the controls that suit its type are offered. The choice of control appears once the field has an attribute, so in a new field, choose or create an attribute first.

Read more about [input controls](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/input-controls).

## Set the options

<!-- dialog: form field -->

Controls that offer a choice, such as radio buttons, checkboxes or a Likert scale, need a list of options. Each option has a label the participant sees and a value that is saved in your data.

## Set validation rules

<!-- dialog: form field -->
<!-- field: showValidationHints -->
<!-- scene: form-field-validation -->

Validation rules, such as making a field required or setting a minimum length, stop the form from being saved until the answer meets them. Switch on **Show validation hints** to tell participants the rules before they answer, not only after an answer breaks one.

Read more about [validation](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/field-validation).

## Try the field

<!-- dialog: form field -->

The **Interactive preview**, the other half of this window, shows the field as participants will see it. Answer the field there, and use **Check response** to test the validation rules.
