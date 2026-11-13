---
title: Recensement des dyades
navOrder: 17
translatedFrom: ebfab1b11b3ddb6077c6a43cc7f22461742e0502
---

<InterfaceSummary type="DyadCensus">

<InterfaceMeta type="Interpréteur de noms" creates="Liens d’un ou de plusieurs types" usesprompts="true">

</InterfaceMeta>

</InterfaceSummary>

L’interface « Recensement des dyades » est une interface de type _interpréteur de noms_ (une question posée sur chaque alter déjà cité) qui recueille les liens entre les alters déjà cités (les alters sont les personnes que la personne participante cite pendant l’entretien). Dans une étape « Recensement des dyades », pour chaque paire d’alters possible, on demande aux personnes participantes si un lien existe entre ces deux alters. Pour expliquer à la personne participante le but de la tâche, placez une étape [« Information »](../interface-documentation/information) avant l’étape « Recensement des dyades ».

## Configurer une étape « Recensement des dyades » {#configuring-dyad-census}

Une étape « Recensement des dyades » peut comporter plusieurs [consignes](/fr/design-protocols/key-concepts/prompts), chacune portant sur un seul type de lien. Chaque paire d’alters est examinée séparément pour chaque consigne.

### Bonnes pratiques {#best-practices}

<GoodPractice>

Utilisez cette interface pour inciter les personnes participantes à ajouter des liens auxquels elles n’auraient peut-être pas pensé.

</GoodPractice>

### À éviter {#try-to-avoid}

<BadPractice>

Utiliser cette interface avec un grand nombre d’alters produit un grand nombre d’écrans. Le nombre de paires augmente rapidement avec le nombre d’alters : n alters donnent n(n-1)/2 paires par consigne.

</BadPractice>
