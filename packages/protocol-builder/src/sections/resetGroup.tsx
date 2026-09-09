import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';

/**
 * What one section contributes to the clear its reset path causes: the paths
 * its capability owns, read when the reset happens rather than when the
 * section registered. A capability's `fields` is a constant in every section
 * that has one, but reading it late costs nothing and keeps a section that
 * computes them from being registered with the wrong ones.
 */
type ResetMember = Readonly<{
  path: string;
  fields: () => readonly string[];
}>;

type ResetGroupRegistry = Readonly<{
  /** Joins the group resetting on `path`. Answers with its own removal. */
  register(id: string, member: ResetMember): () => void;
  /**
   * Everything one change at `path` throws away: the asking section's own
   * paths first, then every other section's, each named once.
   */
  fieldsResetBy(path: string, own: readonly string[]): readonly string[];
}>;

const ResetGroupContext = createContext<ResetGroupRegistry | null>(null);

/**
 * The sections of one stage editor that clear themselves when something they
 * all describe is replaced.
 *
 * A roster's card details, its ordering and its search are three separate
 * sections whose every value names a column of one data file, so all three
 * reset on `dataSource`. Each of them observing the change on its own is three
 * observations of one event, and a clear dispatched per observation is three
 * batches: three entries in the session's history, so replacing a file takes
 * three undos, and the intermediate ones leave the stage in a state nobody
 * authored — the new file with the old file's search settings back underneath
 * it.
 *
 * So the observations stay where they are — each section knows when its own
 * dependency moved, and `useOnResearcherChange` is the one place a researcher's
 * change is told from the draft moving — and the CLEAR is pooled: whichever
 * section observes first discards every path the group owns, in one batch, and
 * the others find nothing left to throw away and add no batch of their own.
 * One edit, one undo, and the file and everything that described it travel
 * together.
 *
 * Registered rather than declared by the editor, because the group is whatever
 * is on screen: a section that is not mounted owns nothing the researcher can
 * see, and an editor listing its own sections here would be a second account of
 * its composition to keep in step with the first.
 */
export function ResetGroupProvider({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const registry = useMemo<ResetGroupRegistry>(() => {
    // Insertion-ordered, which is mount order: the batch the first observer
    // dispatches then reads in the order the sections are on screen.
    const members = new Map<string, ResetMember>();
    return {
      register(id, member) {
        members.set(id, member);
        return () => {
          members.delete(id);
        };
      },
      fieldsResetBy(path, own) {
        const fields = [...own];
        for (const member of members.values()) {
          if (member.path !== path) continue;
          for (const field of member.fields()) {
            if (!fields.includes(field)) fields.push(field);
          }
        }
        return fields;
      },
    };
  }, []);

  return <ResetGroupContext value={registry}>{children}</ResetGroupContext>;
}

/**
 * Joins this section to the group resetting on `path`, and answers with what
 * a reset there has to throw away.
 *
 * Outside a provider a section answers for itself alone, which is what it did
 * before there was a group: a section mounted on its own has nobody to pool a
 * clear with.
 */
export function useResetGroup(
  path: string | undefined,
  fields: readonly string[],
): (resetPath: string) => readonly string[] {
  const registry = useContext(ResetGroupContext);
  const id = useId();
  const latestFields = useRef(fields);
  latestFields.current = fields;

  useEffect(() => {
    if (registry === null || path === undefined) return;
    return registry.register(id, {
      path,
      fields: () => latestFields.current,
    });
  }, [id, path, registry]);

  return useCallback(
    (resetPath: string) =>
      registry === null
        ? latestFields.current
        : registry.fieldsResetBy(resetPath, latestFields.current),
    [registry],
  );
}
