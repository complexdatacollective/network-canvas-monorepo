import { z } from 'zod';

/** The function a node label worker's source must declare. */
export const NODE_LABEL_WORKER_FUNCTION_NAME = 'nodeLabelWorker';

// Far beyond any labelling function, and small enough that a protocol cannot
// carry megabytes of script into every interview through this field.
export const NODE_LABEL_WORKER_MAX_LENGTH = 50_000;

/**
 * The source of a protocol's node label worker: JavaScript declaring a
 * function named `nodeLabelWorker`, which the interview calls with a node and
 * the network to get the label that node shows.
 *
 * Only its size is checked here. Whether it compiles is the authoring tool's
 * to report: a source that does not compile, or a function that fails, leaves
 * every node with the label it would have had without a worker.
 */
export const NodeLabelWorkerSchema = z
  .string()
  .max(NODE_LABEL_WORKER_MAX_LENGTH, {
    message: `A node label worker can be at most ${NODE_LABEL_WORKER_MAX_LENGTH} characters long.`,
  })
  .refine((source) => source.trim().length > 0, {
    message:
      'A node label worker must not be blank; remove it to use the standard labels.',
  });
