/**
 * The settings a Narrative Pedigree stage holds for its wording, as Network
 * Canvas supplies them. The key and the focus button are the protocol's
 * interface text, the same for every Narrative Pedigree.
 */
export const narrativePedigreeWords = () => ({
  saveSnapshot: { en: 'Save snapshot', es: 'Guardar imagen' },
  conditionText: {
    selectCondition: {
      en: 'Select a condition',
      es: 'Selecciona una afección',
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
