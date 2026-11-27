<!--
  Shared steps for the Form section, on every stage type whose form is
  written in the form editor there (Ego Form, Per Alter Form, Per Alter Edge
  Form and Name Generator using forms). Include with the line
  "include: form-document" in an HTML comment. The Family Pedigree's
  additional person fields use the same editor in a section with another key,
  so FamilyPedigree.md describes them in its own steps.
-->

## Add a field for each question

<!-- section: form-fields -->
<!-- field: form.content -->

The form is one rich text document. Participants read it from top to bottom, and each question in it is a **field**: a block that shows the question, its hint and its input control as participants will see them.

To add a field, place the cursor where it should go and choose **Field** in the toolbar, or press Ctrl+Shift+F (⌘+Shift+F on a Mac). Choose the attribute to which the answers are saved. To create a new attribute, type its name in the search box, choose **Create**, and then choose the type of answer that it records. Then type the question in the field, and add a hint below it if participants need more guidance.

Every form must contain at least one field.

Read more about [forms](https://documentation.networkcanvas.com/design-protocols/key-concepts/forms).

## Change the settings of a field

<!-- section: form-fields -->
<!-- field: form.content -->

Select a field to open its settings. There you can choose its **Attribute** and the **Input control** that the participant answers with, change its options and validation, and switch on **Show validation hints**. **Delete field** removes the field from the form.

The input control, options and validation are part of the attribute, so a change to them applies to every form that uses the attribute.

When the protocol has more than one language, each language has its own form, and the forms in different languages can contain different fields. A field has the same settings in every language that contains it.

## Show questions only in some cases

<!-- section: form-fields -->
<!-- field: form.content -->

Choose **Logic block** in the toolbar to add content that participants see only in some cases, such as questions only for participants who are students. Choose the logic, and then add text and fields to each of its versions.

When the participant submits the form, the answers to any fields that the logic hides are cleared.

## Show attributes in the text

<!-- section: form-fields -->
<!-- field: form.content -->

Choose **Attribute** in the toolbar to show the value of an attribute in the text or in a question, such as a name that the participant gave earlier.

To show different wording in different cases, such as "their", "her" or "his", choose **Create dynamic attribute** in the **Dynamic attributes** group of the list.

Read more about [piped text](https://documentation.networkcanvas.com/design-protocols/key-concepts/piped-text).
