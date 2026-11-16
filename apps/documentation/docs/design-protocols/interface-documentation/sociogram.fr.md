---
title: Sociogramme
navOrder: 9
translatedFrom: 7d27d8de5bb6cbb8e8e7d3af7ce752394bb09036
---

<InterfaceSummary type="Sociogram">

<InterfaceMeta type="Interpréteur de noms et générateur de liens" creates="Des liens de plusieurs types, et des données d’attributs sur un seul type de nœud" usesprompts="true">

</InterfaceMeta>

</InterfaceSummary>

Les interfaces « Sociogramme » et [« Narration »](/fr/design-protocols/interface-documentation/narrative) sont les deux interfaces de visualisation sur canevas de Network Canvas. Dans une étape « Sociogramme », les personnes participantes construisent l’image spatiale de leur réseau, en positionnant les alters (chaque personne que la personne participante cite pendant l’entretien) sur un canevas et en traçant les liens qui les relient. L’interface « Narration » en est le complément, en affichage seul : elle présente de nouveau un réseau que la personne participante a déjà disposé, pour une discussion ouverte menée par l’équipe de recherche, sans recueillir de nouvelles données.

Dans une étape « Sociogramme », les personnes participantes positionnent leurs alters et tracent les liens qui les relient. L’interface peut créer un ou plusieurs types de liens entre les alters, et peut recueillir des données d’attributs booléens en mettant en évidence les alters pour lesquels la valeur d’un attribut est vraie.

## Configuration {#configuring}

Une étape « Sociogramme » se construit à partir d’une ou de plusieurs [consignes](/fr/design-protocols/key-concepts/prompts). Chaque consigne fixe une tâche sur le canevas (placer des nœuds, tracer un type de lien particulier ou marquer un attribut), et la personne participante passe d’une consigne à l’autre. Quelques réglages valent pour toute l’étape (l’arrière-plan et le mode de disposition) ; les autres se configurent pour chaque consigne.

### L’attribut de disposition {#the-layout-variable}

Chaque consigne a un **attribut de disposition**, qui stocke la position de chaque nœud sur le canevas sous forme d’une paire de coordonnées. C’est là que sont enregistrées les données spatiales que vous recueillez dans l’étape « Sociogramme ».

Si vous utilisez le même attribut de disposition pour toutes les consignes d’une étape, la position d’un nœud est conservée lorsque la personne participante passe d’une tâche à l’autre : elle affine ainsi une seule disposition commune. Si vous voulez des mesures spatiales distinctes, donnez à chaque consigne un attribut de disposition différent ; réutiliser un attribut remplace les coordonnées précédentes. Les positions sont stockées sous forme de coordonnées normalisées qu’un [arrière-plan SVG adaptatif](/fr/design-protocols/responsive-svg-backgrounds#classify-nodes-from-their-coordinates) permet de transformer en zones porteuses de sens lors de l’analyse.

### Positionnement automatique ou manuel {#automatic-or-manual-positioning}

Un réglage de l’étape, **Mode de disposition**, détermine la façon dont les nœuds arrivent d’abord sur le canevas :

- **Mode manuel** place tous les nœuds dans une réserve au bord de l’écran. La personne participante fait glisser chaque nœud sur le canevas pour le positionner, et peut faire glisser un nœud de nouveau vers la réserve pour le retirer. Vous pouvez trier la réserve pour que les nœuds soient proposés dans un ordre défini.
- **Mode automatique** positionne lui-même les nœuds, sans que la personne participante ait à le faire, avec une disposition par forces qui simule l’attraction et la répulsion à l’ouverture de l’étape. La personne participante peut suspendre et reprendre la simulation pendant l’entretien, et ajuster certaines positions pendant qu’elle est suspendue.

### Arrière-plan {#background}

Une étape « Sociogramme » peut s’afficher sur une série de cercles concentriques ou sur une image d’arrière-plan personnalisée. Pour l’arrière-plan à cercles concentriques, vous choisissez le nombre de cercles à dessiner, et pouvez, si vous le souhaitez, activer l’option « Agrandir les cercles intérieurs » pour que les anneaux centraux soient proportionnellement plus grands. Pour une image d’arrière-plan, un SVG adaptatif est le meilleur choix, car il garde les zones et les libellés lisibles lorsque le canevas change de forme entre les orientations portrait et paysage ; voir [Arrière-plans SVG adaptatifs](/fr/design-protocols/responsive-svg-backgrounds).

<GoodPractice>

Pensez à personnaliser l’arrière-plan pour orienter les personnes participantes dans l’activité ou pour donner du sens à la disposition, par exemple en divisant le canevas en quadrants ou en contextes sociaux au regard desquels les positions des nœuds pourront ensuite être lues.

</GoodPractice>

### Créer et afficher des liens {#creating-and-displaying-edges}

Toucher un nœud peut permettre à la personne participante de tracer des liens. Dans une consigne configurée avec l’option **Création du lien**, toucher un nœud puis un autre crée entre eux un lien du type choisi ; toucher de nouveau la même paire le supprime. Chaque consigne de création de liens crée un seul type de lien : utilisez donc une consigne distincte pour chaque type de relation que vous souhaitez recueillir.

Indépendamment, une consigne peut **afficher** un ou plusieurs types de liens, ce qui est utile pour montrer les liens que la personne participante a tracés dans une consigne précédente pendant qu’elle travaille sur une nouvelle tâche. Le type de lien qu’une consigne crée est toujours affiché dans cette consigne. Lorsque deux nœuds sont reliés par plus d’un des types de liens affichés, un seul de ces liens est dessiné.

![Deux alters reliés par un lien dans une étape « Sociogramme »](/assets/img/interface-documentation/sociogram/sociogram-edges.png)

### Mettre en évidence des attributs {#highlighting-attributes}

Au lieu de tracer des liens, une consigne peut utiliser l’option **Basculement d’attribut** pour faire basculer un attribut. Toucher un nœud fait passer un attribut booléen de vrai à faux et inversement, et les nœuds dont la valeur est vraie sont mis en évidence. Vous pouvez ainsi recueillir un attribut de type oui/non (par exemple, si chaque alter appartient à un groupe ou présente une caractéristique particulière) directement sur le canevas.

![Alters mis en évidence dans une étape « Sociogramme » lorsqu’un attribut est vrai](/assets/img/interface-documentation/sociogram/sociogram-highlight.png)

La création de liens et le basculement d’attribut sont les deux comportements possibles au toucher, et une consigne utilise l’un ou l’autre, pas les deux. Répartissez les deux tâches dans des consignes distinctes lorsque vous avez besoin de chacune.

<AppOnly app="current">

### Info-bulles de suspension et de reprise {#pause-and-resume-tooltips}

Les info-bulles des boutons qui suspendent et reprennent la simulation de la disposition automatique font partie des [textes de l’entretien](/fr/design-protocols/translating-your-protocol#interview-text), communs avec l’étape « Narration » : l’éditeur d’étape n’a donc pas de section pour elles. Elles se reformulent et se traduisent dans le tableau des traductions, sous **Boutons**, et un protocole ne les contient que tant qu’une étape utilise la disposition automatique.

</AppOnly>

### Bonnes pratiques {#best-practices}

<GoodPractice>

Gardez le même attribut de disposition pour toutes les consignes d’une étape lorsque vous voulez que les personnes participantes construisent progressivement une seule disposition de leur réseau : les positions qu’elles ont définies dans une première consigne sont ainsi toujours là dans les suivantes.

</GoodPractice>

<GoodPractice>

Adaptez la formulation de chaque consigne à son comportement au toucher : interrogez sur les relations dans les consignes de création de liens, et sur une caractéristique de chaque alter dans les consignes de basculement d’attribut.

</GoodPractice>

### À éviter {#try-to-avoid}

<BadPractice>

Des nœuds placés trop près les uns des autres peuvent se masquer mutuellement, ou masquer le lien qui les relie. Recommandez aux personnes participantes de ne pas placer des nœuds directement les uns sur les autres.

</BadPractice>
