---
'@codaco/architect': minor
'@codaco/fresco-ui': minor
---

In Architect's stage editors, you now choose an attribute from a select box on the field itself instead of from a separate window. The chosen attribute is shown in the box. When you open the box, a search box is ready for typing and filters the attributes as you type, matching letters in order, so "mrd" finds "married". To create an attribute, type its name and choose "Create" from the top of the list, which also says what type the new attribute will have.

Attributes that cannot be used in a field are now listed under "Not available here" instead of being hidden. Choosing one shows why it cannot be used, for example because it is the wrong type or because another stage already uses it. A field that holds such an attribute shows the reason below it. In the name generator's list of attributes to assign, an attribute that another row already assigns can no longer be chosen again.

Attributes are no longer renamed from a stage editor's field; rename them on the Codebook page.

`@codaco/fresco-ui` exports `fuzzyMatchScore` and `fuzzyFilter` from `@codaco/fresco-ui/utils/fuzzyMatch`, and `useComboboxTriggerEscape` from `@codaco/fresco-ui/hooks/useComboboxTriggerEscape`.
