---
title: Shared Interface Options

layout: page
---

Some configuration options are available to all or most interface screens (dependent on the sub-category of interface, e.g. name generators).

## Shared Configuration

![Image](/assets/img/interface-documentation/shared/shared-configuration.png)

### Name

All stages have a configurable name. This is shown in the navigation when conducting interviews, and in the timeline when constructing interviews. It can be used to set a memorable title or describe the purpose of a particular stage.

### Entity Type

All stage types must select a single entity type, which defines the primary entity type for data collection. The one exception is the information screen, which does not collect any data.

Depending on the specific interface this will refer to either a _node_ type, or an _edge_ type.

### Filtering

This feature is available to _Sociogram_ and _Name Interpreter_ stage type categories. It allows further refinement of the selected entity type.

For example, a Sociogram may have a "Person" node type selected as the entity type. You may then use this option to narrow down to only those "Person" nodes which also have a specific attribute.

[Find out more about filtering](/en/desktop/key-concepts/network-filtering)

### Skip Logic

This feature is available to all stage types. The state of the participant network may be assessed in order to determine whether a stage should be shown or instead skipped.

[Find out more about skip logic](/en/desktop/key-concepts/skip-logic)
