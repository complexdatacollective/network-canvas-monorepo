/**
 * The settings a Narrative Pedigree stage holds for its wording. Network Canvas
 * supplies these defaults. At-risk notation is held only when the stage shows
 * at-risk statuses, so it is added on request.
 */
export const narrativePedigreeWords = ({ atRisk = false } = {}) => ({
  keyHeading: { en: 'Key', es: 'Leyenda' },
  saveSnapshot: { en: 'Save snapshot', es: 'Guardar imagen' },
  tooltips: {
    clearFocus: { en: 'Clear focus', es: 'Quitar el foco' },
  },
  conditionText: {
    selectCondition: {
      en: 'Select a condition',
      es: 'Selecciona una afección',
    },
    notation: {
      affected: { en: 'Has this condition', es: 'Tiene esta afección' },
      obligateAffected: {
        en: 'Will develop this condition',
        es: 'Desarrollará esta afección',
      },
      obligateCarrier: {
        en: 'Carries this condition',
        es: 'Es portador/a de esta afección',
      },
      ...(atRisk
        ? {
            atRiskAffected: {
              en: 'May develop this condition',
              es: 'Puede desarrollar esta afección',
            },
            atRiskCarrier: {
              en: 'May carry this condition',
              es: 'Puede ser portador/a de esta afección',
            },
          }
        : {}),
      unknown: { en: 'Not known', es: 'No se sabe' },
    },
    snapshotCondition: {
      en: '{title}: {condition}',
      es: '{title}: {condition}',
    },
    snapshotInheritance: {
      en: '{title}: {condition} — inheritance for {name}',
      es: '{title}: {condition} — herencia de {name}',
    },
  },
});
