import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Node from '@codaco/fresco-ui/Node';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  isNodeColorSequence,
  isNodeShape,
} from '~/components/TypeEditor/nodeAppearance';
import { useAppSelector } from '~/ducks/hooks';
import { getCodebook } from '~/selectors/protocol';

import { nodeLabelWorkerMessages as messages } from './messages';
import {
  type NodeLabelPreview,
  type NodeLabelPreviewRow,
  useNodeLabelPreview,
} from './useNodeLabelPreview';

const PreviewRow = ({ node, outcome }: NodeLabelPreviewRow) => {
  const intl = useAppIntl();
  const definition = useAppSelector(
    (state) => getCodebook(state)?.node?.[node.type],
  );
  const color = definition?.color;
  const shape = definition?.shape?.default;

  return (
    <li className="flex items-center gap-4">
      <Node
        presentational
        size="sm"
        className="shrink-0"
        color={isNodeColorSequence(color) ? color : undefined}
        shape={isNodeShape(shape) ? shape : undefined}
        label={outcome.kind === 'label' ? outcome.label : undefined}
      />
      {outcome.kind === 'label' ? (
        <span dir="auto" className="text-match-parent min-w-0 wrap-anywhere">
          {outcome.label}
        </span>
      ) : (
        <span className="text-destructive min-w-0 text-sm wrap-anywhere">
          {outcome.kind === 'error'
            ? intl.formatMessage(messages.nodeError, {
                error: outcome.message,
              })
            : intl.formatMessage(messages.noLabel)}
        </span>
      )}
    </li>
  );
};

const PreviewOutcome = ({ preview }: { preview: NodeLabelPreview }) => {
  const intl = useAppIntl();

  if (preview.status === 'checking') {
    return (
      <div className="text-text/70 flex items-center gap-3">
        <Spinner size="sm" />
        <span>{intl.formatMessage(messages.previewChecking)}</span>
      </div>
    );
  }

  if (preview.status === 'failed') {
    const failure =
      preview.kind === 'compile'
        ? intl.formatMessage(messages.cannotBeUsed, { error: preview.message })
        : preview.kind === 'timeout'
          ? intl.formatMessage(messages.tookTooLong)
          : preview.kind === 'unsettled'
            ? intl.formatMessage(messages.neverFinished)
            : intl.formatMessage(messages.failed, { error: preview.message });
    return (
      <Alert variant="destructive">
        <AlertDescription className="wrap-anywhere">{failure}</AlertDescription>
      </Alert>
    );
  }

  if (preview.rows.length === 0) {
    return (
      <Paragraph emphasis="muted">
        {intl.formatMessage(messages.previewNoNodes)}
      </Paragraph>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {preview.rows.map((row) => (
        <PreviewRow key={row.node._uid} {...row} />
      ))}
    </ul>
  );
};

/**
 * The labels the script being written gives to sample nodes. Reads the
 * `source` field of the form it is rendered beside.
 */
const NodeLabelWorkerPreview = () => {
  const intl = useAppIntl();
  const { source } = useFormValue(['source'] as const);
  const preview = useNodeLabelPreview(typeof source === 'string' ? source : '');

  return (
    <section>
      <Heading level="h3">{intl.formatMessage(messages.preview)}</Heading>
      <Paragraph>{intl.formatMessage(messages.previewDescription)}</Paragraph>
      <div role="status" aria-live="polite">
        <PreviewOutcome preview={preview} />
      </div>
    </section>
  );
};

export default NodeLabelWorkerPreview;
