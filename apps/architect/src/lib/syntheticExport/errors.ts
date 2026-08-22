/**
 * A generation failure whose message was written FOR the researcher, so a
 * surface may show it as it is. Everything else that can be thrown on that path
 * — an exporter fault, a storage fault — carries internal wording, and belongs
 * in the error reporter behind a sentence the reader can act on.
 *
 * Its own module, and a dependency-free one, because the dialog's state machine
 * imports it eagerly while the generation pipeline it comes from — the
 * synthetic engine, the export pipeline, their ZIP and XML machinery — is
 * loaded only once a researcher actually asks for a batch.
 */
export class SyntheticGenerationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SyntheticGenerationError';
  }
}
