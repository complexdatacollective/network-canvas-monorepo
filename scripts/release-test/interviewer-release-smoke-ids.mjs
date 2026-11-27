// The ids the release-smoke protocol's codebook gives the types, variables
// and layout the smoke walker reads, found by name, so that re-saving the
// fixture (which can mint new ids) does not break the walker.

const entryNamed = (entries, name, what) => {
  const found = Object.entries(entries ?? {}).find(
    ([, entry]) => entry.name === name,
  );
  if (!found) throw new Error(`the protocol has no ${what} named ${name}`);
  return found;
};

export const readSmokeIds = (document) => {
  const typeOf = (entity, name, variableNames) => {
    const [id, type] = entryNamed(
      document.codebook[entity],
      name,
      `${entity} type`,
    );
    return {
      id,
      ...Object.fromEntries(
        variableNames.map((variable) => [
          variable,
          entryNamed(type.variables, variable, `${name} variable`)[0],
        ]),
      ),
    };
  };
  return {
    person: {
      ...typeOf('node', 'Person', ['name', 'context', 'closeness']),
      // A layout belongs to the codebook; a node's position in it is stored
      // under the layout's id.
      layout: entryNamed(document.codebook.layouts, 'layout', 'layout')[0],
    },
    familyMember: typeOf('node', 'family member', [
      'fm_name',
      'is_ego',
      'genderIdentity',
      'sexAssignedAtBirth',
    ]),
    knows: typeOf('edge', 'Knows', []).id,
    friends: typeOf('edge', 'Friends', []).id,
    familyEdge: typeOf('edge', 'family_edge', [
      'relationshipKind',
      'isGestationalCarrier',
    ]),
    ego: Object.fromEntries(
      ['ego_name', 'consent'].map((variable) => [
        variable,
        entryNamed(
          document.codebook.ego?.variables,
          variable,
          'ego variable',
        )[0],
      ]),
    ),
  };
};
