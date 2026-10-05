/**
 * How tall the stage editor's title block is, as a CSS custom property on the
 * document root.
 *
 * The title — the interface thumbnail, where the stage sits in the interview,
 * its name and its badges — is drawn at the top of the editor's own column,
 * and the list of the stage's sections sits in the column beside it. The list
 * starts below the title rather than level with the top of the column, which
 * means knowing how much room the title took; nothing about that is a constant
 * a stylesheet could carry, because the name is an input whose text wraps, the
 * badge row wraps, and the whole block turns from one column into two at
 * `48rem`. So it is measured where it is drawn (`StageTitle`) and read from
 * here by the route that lays the two columns out.
 *
 * What the offset clears is the TITLE. In the two states where the editor
 * draws something of its own between the title and its first section card — a
 * read-only alert, and the errors a refused save reports — that card sits
 * lower than the list's first row by the height of what it drew. Deliberate:
 * both live inside the package's form, so the only way to measure them from
 * here is to query into another package's DOM, and the list would then jump
 * down the page every time a save was refused.
 *
 * `architect-theme.css` declares a starting value, so the column laid out
 * before `StageTitle`'s first measurement still resolves to a real height
 * instead of dropping the declaration that reads it.
 */
export const STAGE_HERO_HEIGHT_VARIABLE = '--architect-stage-hero-height';
