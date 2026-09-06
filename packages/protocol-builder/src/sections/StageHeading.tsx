import { useStageEditorForm } from '../form/stageEditorContext.ts';
import StageNameSection, {
  type StageNameSectionProps,
} from './StageNameSection.tsx';

export type StageHeadingProps = Readonly<{
  /** Where this interface is documented. */
  documentationUrl: string;
  /**
   * What a proposed name is derived from, for an interface whose stages are
   * named after something more than their type. Interfaces that have nothing
   * to add leave it out.
   */
  autoName?: StageNameSectionProps['autoName'];
}>;

/**
 * The stage's name, with where it sits in the interview.
 *
 * Every editor's first section, and the same one, because orientation is not
 * an interface's own decision: a researcher who has just clicked a stage in
 * the timeline is asking "which one is this?" whatever kind of stage it turns
 * out to be, and an interface that answered only sometimes would tell them
 * where they are on some stages and not on others.
 *
 * The position is read from the protocol the editor is already holding rather
 * than passed in by a host: the interview's stage order is protocol content,
 * and an editor that took it as a prop could be told something the protocol
 * disagrees with. A stage the order does not contain yet — one being created —
 * simply has no position to state.
 */
export default function StageHeading({
  documentationUrl,
  autoName,
}: StageHeadingProps) {
  const { identity, protocolContext } = useStageEditorForm();
  const index = protocolContext.orderedStages.findIndex(
    (stage) => stage.id === identity.id,
  );

  return (
    <StageNameSection
      documentationUrl={documentationUrl}
      {...(autoName === undefined ? {} : { autoName })}
      {...(index === -1
        ? {}
        : {
            position: {
              index: index + 1,
              total: protocolContext.orderedStages.length,
            },
          })}
    />
  );
}
