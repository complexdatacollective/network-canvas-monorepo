---
title: Input Controls
toc: true

definition: A flexible way to assign values to variables in [forms](/en/desktop/key-concepts/forms). By separating the visible control from the variable type, you can choose the best possible interview experience for your participant.
---

Below you will find a summary of each available input control, and advice about when to use them.

## Checkbox Group

![image](/assets/img/key-concepts/input-controls/CheckboxGroup.png)

### Purpose

The checkbox group is designed to provide a familiar interface for selecting one or more items from a (non-hierarchical) range of options.

Options are displayed vertically, to allow for longer labels and to create a more scannable list. Horizontal checkbox groups are not supported.

### Good practices

<GoodPractice />

- Use this input control for allowing the participant to select multiple items.
- Check that the option labels are not too long, or text wrapping might be an issue.
- Use validation options to set the maximum and minimum number of options that the participant can select.
- Keep option labels concise, and make them easily differentiated from one another.
- Consider the order of your options, and the impact order bias might have on your data.

### Things to avoid

<BadPractice />

- Do not use more than 8 options, unless absolutely necessary. Long checkbox groups can be hard to see on a screen without scrolling.
- Avoid using this control when the data is hierarchical, or when the participant should only select a single option. Use the RadioGroup or the Likert scale instead.

## Date Picker

![image](/assets/img/key-concepts/input-controls/DatePicker.png)

### Purpose

The date picker input control is used to select a date with various levels of specificity. By default the resolution of the data picker is set to "year/month/day", but you can also set it to be less granular, thereby allowing participants to select a year and month or simply a year.

If your interview context is better suited to keyboard text entry rather than the use of a touch screen, consider using a standard text input as this may be faster.

### Good practices

<GoodPractice />

- Carefully consider the range of values that you allow your participant to select between. You should aim to constrain these values as much as possible, to eliminate potential errors.
- For questions asking about the past, make use of the ability to specify an empty "end range" parameter, which will ensure that the most recent date the participant can select is aligned with the date of the interview.
- Use the resolution parameter to only collect data to an appropriate level of specificity. It is often better to collect data at a lower resolution with more certainty, than a higher resolution with more error.

### Things to avoid

<BadPractice />

- Since dates can be burdensome to enter, avoid the use of this control in name generator forms.
- Since this control is optimized for touch/mouse, avoid using it if you are creating a largely keyboard driven interview.

## Likert Scale

![image](/assets/img/key-concepts/input-controls/LikertScale.png)

### Purpose

The Likert scale control allows participants to select from an ordered series of options. Likert scales are widely used in psychometric research. Typically they have five ordered categories, such as "Strongly disagree", "Disagree", "Neither agree nor disagree", "Agree", and "Strongly Agree". When used in Network Canvas, you can select the number and value of the response categories to suit your needs.

When first loaded, this control is in an "untouched" state, with a semi-transparent draggable handle positioned on the left. Please note that in this state **no value will be assigned to the variable**. The participant must interact with the handle, even if it is to simply move it back into its initial position, in order for a value to be stored. To ensure that no values are missed, consider setting the `required` [validation option](./field-validation).

### Good practices

<GoodPractice />

- Consider whether you want to provide a middle choice or not and mark it as neutral/ambivalent (e.g., "neither agree nor disagree", rather than unsure).
- Consider whether you need more than five categories. Much research suggests there's limited power in using seven or more categories rather than just 5 (or even 3).
- Note the special way this control handles the 'required' validation - no value will be recorded in the variable until the participant has interacted with the control. Once interacted with, the value of the control cannot be unset.

### Things to avoid

<BadPractice />

- Never place the response categories out of order - they must be in sequence.
- Do not use this control for large numbers of options. Consider the use of the RadioGroup control instead.

## Number Input

![image](/assets/img/key-concepts/input-controls/NumberInput.png)

### Purpose

A number input is a control that provides a simple box for integer data collection. Integers can be entered with a keyboard or, if available, a number pad will appear.

Please note that because of the way numbers are represented scientifically, the character 'e' is considered valid within this input.

### Good practices

<GoodPractice />

- Set validation options that constrain the range of possible entries when the variable value should only be positive (e.g. age).
- Use this control for capturing numeric data rather than the text input for cleaner data.

### Things to avoid

<BadPractice />

- Do not use the number input to capture date data. Date data should be captured using the DatePicker or a text input.
- Do not use this control for non-integer number variables, such as phone numbers. Use a text input.

## Radio Group

![image](/assets/img/key-concepts/input-controls/RadioGroup.png)

### Purpose

A radio group is a control that allows participants to select a single choice from a group of (potentially hierarchical) options. The options are displayed to the participant vertically, to allow for longer labels and to create a more scannable list.

### Good practices

<GoodPractice />

- Create succinct labels for options to avoid issues with text wrapping.
- Ensure that option labels can be quickly differentiated from one another.
- Carefully consider the ordering of your options. Even if your options are not hierarchical, ordering may bias your data in other ways.
- Use this control when only one item should be selected.

### Things to avoid

<BadPractice />

- Avoid using long radio groups with many options, as they can be difficult for a participant to see without scrolling.
- Items that are not selected provide an 'implied no', meaning that all items not selected by a participant do not apply to them. If you need explicit confirmation, consider using a different input control with a true/false value per option.
- If a participant should be able to toggle multiple items for the variable in question, consider using the checkbox group or toggle box group instead.

## Relative Date Picker

![image](/assets/img/key-concepts/input-controls/RelativeDatePicker.png)

### Purpose

The relative date picker is a control that provides a calendar date picker which automatically limits available dates relative to an "anchor date." An anchor date can be manually specified, or the control can be configured to automatically use the date of the interview session.

This control is particularly useful for scenarios where you are concerned with events that have happened (or will happen) within a known amount of time relative to another date. For example, "within the past 6 months, when was the last time you saw this person?", or "Do you have an appointment for a test at this clinic within the next 30 days? If so, please indicate the date".

Unlike the date picker control, the relative date picker does not allow you to set the resolution of the data collected.

### Good practices

<GoodPractice />

- Ensure you specify the range of dates prior to or after the anchor date to broaden or shorten available dates a participant can select from. By default, the relative date picker uses 180 days prior to and 0 days after the anchor date.

### Things to avoid

<BadPractice />

- If you want to allow participants to be less granular in their date selection, such as just using a month or a year rather than a date, consider using the date picker control instead.

## Text Area

![image](/assets/img/key-concepts/input-controls/TextArea.png)

### Purpose

The text area control provides participants with a simple field for data entry of more than 30 characters.

### Good practices

<GoodPractice />

- Use the text area control for question prompts that require longer form responses from participants. This may be especially useful for qualitative studies.

### Things to avoid

<BadPractice />

- Avoid using a text area control when the data you want could be more effectively captured as a categorical or numeric variable.
- Avoid using the text area control on devices with software keyboards, since text entry can be error-prone and laborious.

## Text Input

![image](/assets/img/key-concepts/input-controls/TextInput.png)

### Purpose

The text input control provides participants with a field for simple data entry of up to approximately 30 characters.

### Good practices

<GoodPractice />

- Set correct validation options to ensure that appropriate data is provided.
- Consider using the text input control for numerical data that should be stored as a string, such as phone numbers.
- Ensure the prompt for the question is clear so that the data entered into the text input requires less cleaning.

### Things to avoid

<BadPractice />

- Do not use the text input control for longer responses, or free form data. Use the text area control instead.
- It is not possible to paste text into the text input control. Do not rely on pasting data into this control.

## Toggle

![image](/assets/img/key-concepts/input-controls/Toggle.png)

### Purpose

The toggle control provides participants a switch that can be toggled on or off, and is designed to model boolean data. By default, the switch begins in the "off" position.

### Good practices

<GoodPractice />

- Use a toggle to easily collect simple true/false variable values, and specifically to indicate the presence of an attribute.
- Consider using multiple toggles to indicate attributes that can then be used as part of [network filtering](/en/desktop/key-concepts/network-filtering) or [skip logic](/en/desktop/key-concepts/skip-logic).

### Things to avoid

<BadPractice />

- Only use the toggle for dichotomous variables. Where a third option is required, consider using a radio group instead.
- Carefully consider the 'implied no' inherent in this input control. If you require the user to specifically indicate a negative value, consider using a RadioGroup with two items, and using the `required` validation.

## Toggle Button Group

![image](/assets/img/key-concepts/input-controls/ToggleButtonGroup.png)

### Purpose

The toggle button group is a control for non-hierarchical categorical variables that displays colorful circles that can be toggled on or off, and allows for multiple selection.

It is provided as an alternative to the checkbox group for scenarios where it may be more intuitive or visually engaging for your participants.

### Good practices

<GoodPractice />

- Use this component to collect categorical data, particularly when you have smaller numbers of items.
- The visual emphasis of this control implies 'membership', so consider using it for variables that represent groups or activities.

### Things to avoid

<BadPractice />

- Avoid using long labels, or labels of more than two words, as it may be difficult for participants to clearly see the categories.
- Avoid using more than 8 categories for a toggle button group, as only 8 distinct colors are provided.

## Visual Analog Scale

![image](/assets/img/key-concepts/input-controls/VisualAnalogScale.png)

### Purpose

A visual analog scale is a control that sets a normalized value between 0 and 1 represented by the position of a slider between each end of a scale.

### Good practices

<GoodPractice />

- Consider using a visual analog scale to collect variable data that is best represented on a continuum with a linear progression. Participants are able to give more precise responses on a continuum rather choose a specific option, like on a Likert scale.

### Things to avoid

<BadPractice />

- Use another control for variables necessitating multiple predefined items.
