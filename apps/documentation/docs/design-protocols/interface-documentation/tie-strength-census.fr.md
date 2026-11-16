---
title: Recensement de la force des liens
navOrder: 19
translatedFrom: f357aca089c34831166e2c330d48ebd708f0eb21
---

<InterfaceSummary type="TieStrengthCensus">

<InterfaceMeta type="Interpréteur de noms" creates="Des liens dont le poids est stocké dans un attribut ordinal" usesprompts="true">

</InterfaceMeta>

</InterfaceSummary>

L’interface « Recensement de la force des liens » est semblable à l’interface [« Recensement des dyades »](../interface-documentation/dyad-census) du point de vue de l’expérience utilisateur, mais elle a l’avantage supplémentaire d’attribuer une valeur d’attribut ordinal à chaque lien créé.

Pour chaque paire d’alters (chaque personne que la personne participante cite pendant l’entretien), la personne participante peut indiquer qu’un lien existe en indiquant la force de ce lien. Elle peut aussi indiquer qu’il n’existe aucun lien entre les deux alters de la paire. Sélectionner une option fait passer automatiquement à la paire suivante, ce qui rend la tâche fluide et peu contraignante.

Si votre entretien utilise la méthode du recensement des dyades (plutôt que de créer les liens avec l’interface [« Sociogramme »](../interface-documentation/sociogram)) et que la force des liens vous intéresse également, envisagez d’utiliser cette interface pour alléger la charge de réponse des personnes participantes.

Pour configurer cette interface dans Architect, vous déterminez d’abord le type de nœud pour lequel les liens seront créés. Vous configurez ensuite une ou plusieurs consignes, chacune précisant :

- un type de lien qui sera créé ;
- un attribut ordinal qui recevra une valeur lorsqu’un lien est confirmé. Cet attribut ordinal sera créé sur le type de lien que vous avez indiqué ;
- un libellé pour l’option qui indique qu’il n’existe aucun lien.

### Bonnes pratiques {#best-practices}

<GoodPractice>

Utilisez cette interface lorsque vous recourez déjà à la méthode du recensement des dyades
et que vous souhaitez aussi recueillir des données sur la force d’un lien.

</GoodPractice>

### À éviter {#try-to-avoid}

<BadPractice>

Évitez d’utiliser cette interface dans un entretien qui utilise aussi une étape « Sociogramme » pour
créer des liens.

</BadPractice>

<BadPractice>

N’utilisez pas d’attributs ordinaux comportant plus de 5 options de réponse, car l’interface
deviendrait très encombrée.

</BadPractice>
