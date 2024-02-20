---
layout: interface-documentation

image: /assets/uploads/stage-tiestrengthcensus.png
title: Tie-Strength Census
type: Edge Generator/Edge Interpreter
creates: Edges with weight stored on an ordinal variable
uses_prompts: true
good:
  - Use this interface in scenarios where you are already using a Dyad Census
    and wish to also collect data about the strength of a tie.
bad:
  - Avoid using this interface in an interview that also uses the Sociogram to
    create edges.
  - Do not use ordinal variables with more than 5 options, since this will
    create a very crowded interface.
---

The Tie-Strength Census interface is similar to the [Dyad Census](/en/desktop/interface-documentation/dyad-census) in terms of user experience, but has the additional benefit of assigning an ordinal variable value to each edge that is created.

For each pair of alters, the participant will be able to indicate if a tie is present by indicating the strength of that tie. The participant can also indicate that a tie is not present between the pair. Selecting an option will automatically advance to the next pair, creating a stremlined and low-burden experience.

If your interview uses the dyad census method (as opposed to creating edges using the [Sociogram](/en/desktop/interface-documentation/sociogram) interface) and you are also interested in tie strength, consider using this interface to reduce the response burden on your participants.

To configure this interface in Architect, you will first determine the node type for which edges will be created. Next you will configure one or more prompts, with each prompt specifying:

- An edge type that will be created
- An ordinal variable that will receive a value when an edge is confirmed. This ordinal variable will be created on the edge type you specified.
- A label to be used for the option that indicates that no tie is present
