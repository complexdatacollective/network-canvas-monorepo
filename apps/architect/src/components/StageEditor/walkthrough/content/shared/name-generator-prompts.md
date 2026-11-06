<!--
  Shared steps for a name generator's prompt window.
  Include with the line "include: name-generator-prompts" in an HTML comment.
-->

## Write the prompt text

<!-- dialog: create prompt | edit prompt -->
<!-- field: text -->

This is the question the participant reads while adding alters. Ask about one relationship at a time, and say what counts, for example a time period.

## Record which prompt named them

<!-- dialog: create prompt | edit prompt -->
<!-- field: additionalAttributes -->
<!-- scene: name-generator-additional-attributes -->

You can set an attribute on every node added in response to this prompt, such as `discuss_matters` set to true. Later you will know which question each alter was added for, even when several prompts share one stage. Attributes the participant fills in on this stage cannot be set here.

Read more about [additional attributes](https://documentation.networkcanvas.com/en/design-protocols/key-concepts/additional-variables).
