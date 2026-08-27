---
'@codaco/architect': patch
---

Interface cards in the "Select an Interface Type" dialog are now announced by
their interface name alone. Each card previously announced its title twice,
followed by its whole description and every capability tag, as one unbroken
button name — so moving through the dialog with a screen reader meant hearing a
paragraph per card before reaching the next name. The description and tags are
still announced, as the card's description, after its name.
