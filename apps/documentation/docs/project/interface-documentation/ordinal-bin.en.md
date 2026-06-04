---
title: Ordinal Bin
---

<InterfaceSummary>

![Ordinal Bin Interface](/assets/img/interface-documentation/ordinal-bin/example.png)

<InterfaceMeta type="Name Interpreter" creates="Ordinal attribute data on a single node type" usesprompts="true">

</InterfaceMeta>

</InterfaceSummary>

The Ordinal Bin is a name interpreter Interface that captures ordinal data on the alters in a participant's network. When using the Ordinal Bin, participants drag and drop alters one-by-one into parallel bins denoting values on an ordinal scale. Once placed, participants can move alters from one bin to another.

## Configuring Ordinal Bin

A single node type is selectable per screen. This screen supports [filtering](../key-concepts/network-filtering) those nodes by their attributes.

![](/assets/img/interface-documentation/ordinal-bin/architect_1.png)

An Ordinal Bin screen can include multiple [prompts](/en/project/key-concepts/prompts), each of which relates to a single ordinal variable.

![](/assets/img/interface-documentation/ordinal-bin/architect_2.png)

### Best Practices

<GoodPractice>

Use this Interface to collect ordinal or interval scale data on alters. Although a Likert Scale can be added as an [input control](../key-concepts/input-controls/) on other interfaces, the drag and drop functionality on the Ordinal Bin provides a tactile method to capturing these data that is engaging for participants.

</GoodPractice>

### Try to Avoid

<BadPractice>

Due to size affordances, avoid using scales of more than six bins on this Interface. Larger scales cause bin labels to be difficult to read and the other visual components on the Interface become compromised.

</BadPractice>

<BadPractice>

Resist using this Interface to collect nominal data that would be more suitable for capture on the [Categorical Bin](../interface-documentation/categorical-bin/).

</BadPractice>
