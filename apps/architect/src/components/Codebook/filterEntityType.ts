type FilterableVariable = { name: string; inUse: boolean };

export type EntityTypeFilter = {
  /** Free-text search term from the codebook search box. */
  search: string;
  /** Whether the "Show unused only" checkbox is active. */
  unusedOnly: boolean;
};

export type FilteredEntityType<T extends FilterableVariable> = {
  /** Whether the entity type should be displayed at all. */
  visible: boolean;
  /** The variables to display within the entity type. */
  variables: T[];
};

/**
 * Applies the codebook's search / "Show unused only" filters to a single node
 * or edge type.
 *
 * The filters operate at the *variable* level (mirroring the ego section) so a
 * type is not hidden just because the type itself is used / its name doesn't
 * match — it stays visible when it contains matching variables, and its
 * variable list is narrowed to those matches.
 *
 * A type also stays visible on its own merits when it is itself a relevant
 * result: an unused type under "Show unused only", or a name match under
 * search. When the type's name matches the search, all of its variables are
 * kept (subject to "unused only"), so searching a type name reveals the type
 * with its variables rather than an empty shell.
 */
export const filterEntityType = <T extends FilterableVariable>(
  variables: T[],
  {
    name,
    inUse,
    search,
    unusedOnly,
  }: { name: string; inUse: boolean } & EntityTypeFilter,
): FilteredEntityType<T> => {
  const term = search.trim().toLowerCase();
  const typeNameMatches = term === '' || name.toLowerCase().includes(term);

  const filteredVariables = variables.filter((variable) => {
    if (unusedOnly && variable.inUse) {
      return false;
    }
    if (
      term !== '' &&
      !typeNameMatches &&
      !variable.name.toLowerCase().includes(term)
    ) {
      return false;
    }
    return true;
  });

  const typeMatchesFilters = (!unusedOnly || !inUse) && typeNameMatches;

  return {
    visible: typeMatchesFilters || filteredVariables.length > 0,
    variables: filteredVariables,
  };
};
