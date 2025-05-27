## Outstanding issues

- removed sortable HOC, meaning that any components that could previously be dragged to be sorted won't work. Need to reimplement with motion.
- ideally need to refactor away from redux in general (towards zustand), but this is a huge task. perhaps migrating the protocols store would work, keeping form migration until later.
