---
title: Narration
navOrder: 10
translatedFrom: a21c6fb487cacde6abc161d81dd344278b8ee53a
---

<InterfaceSummary type="Narrative">

<InterfaceMeta type="Visualisation de données" creates="Ne crée pas de données" usesprompts="false">

</InterfaceMeta>

</InterfaceSummary>

Les interfaces « Narration » et [« Sociogramme »](/fr/design-protocols/interface-documentation/sociogram) sont les deux interfaces de visualisation sur canevas de Network Canvas. Dans une étape « Sociogramme », les personnes participantes construisent l’image spatiale de leur réseau en positionnant les alters (chaque personne que la personne participante cite pendant l’entretien) et en traçant les liens qui les relient. L’interface « Narration » en est le complément, en affichage seul : elle reprend un réseau que la personne participante a déjà disposé (le plus souvent dans une étape « Sociogramme ») et le lui présente de nouveau pour une discussion ouverte, menée par l’équipe de recherche. Elle n’enregistre elle-même aucune nouvelle donnée.

Comme elle ne recueille rien, l’interface « Narration » est conçue pour le travail qualitatif. Elle projette sur le réseau visuel des données recueillies ailleurs dans l’entretien (appartenances à des groupes, attributs et types de liens), afin que la personne participante et l’équipe de recherche puissent commenter l’image ensemble et interroger ce qu’elle montre.

## Préréglages {#presets}

Tout ce que vous configurez dans une étape « Narration » se trouve dans un ou plusieurs **préréglages** (des configurations d’affichage du réseau). Un préréglage est une vue enregistrée du réseau qui combine jusqu’à quatre éléments :

| Élément                       | Ce qu’il fait                                                                                                                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Disposition** (obligatoire) | Un attribut de disposition qui positionne les nœuds. Seuls les alters qui ont déjà une valeur pour cet attribut apparaissent : choisissez-en donc un qu’une étape précédente a rempli, par exemple l’attribut de disposition rempli par une consigne d’une étape « Sociogramme ». |
| **Groupes** (facultatif)      | Un attribut catégoriel dessiné sous forme d’enveloppes convexes colorées et semi-transparentes, derrière les nœuds qui partagent chaque valeur. Un nœud qui a plusieurs valeurs apparaît à l’intérieur de plusieurs enveloppes qui se chevauchent.                                |
| **Liens** (facultatif)        | Un ou plusieurs types de liens à tracer entre les nœuds.                                                                                                                                                                                                                          |
| **Attributs** (facultatif)    | Un ou plusieurs attributs booléens. Les nœuds dont la valeur est vraie sont mis en évidence tant que le préréglage est actif.                                                                                                                                                     |

Chaque préréglage a un libellé qui l’identifie dans l’interface. Pendant l’entretien, un sélecteur flottant de préréglages permet à l’équipe de recherche ou à la personne participante de passer d’un préréglage à l’autre et d’afficher ou de masquer les groupes, les liens et les attributs mis en évidence. Lorsqu’un préréglage comporte plusieurs attributs de mise en évidence, on choisit celui à afficher à un moment donné dans une liste qui montre le libellé que vous avez donné à chaque attribut. Les types de liens qu’un préréglage trace sont eux aussi listés sous les libellés que vous leur avez donnés. Rien de ce qui est fait ici n’est enregistré dans les données d’entretien : l’interface « Narration » ne fait que lire.

![Exemple de préréglage d’une étape « Narration », avec des nœuds mis en évidence, des liens entre eux et des enveloppes de groupe colorées](/assets/img/interface-documentation/narrative/narrative-example.png)

## Configurer les préréglages dans Architect {#configuring-presets-in-architect}

Une étape « Narration » doit comporter au moins un préréglage. Pour chaque préréglage, vous définissez :

- **Libellé du préréglage** : un nom court, visible par les personnes participantes, affiché dans le sélecteur de préréglages.
- **Attribut de disposition** : l’attribut utilisé pour positionner les nœuds dans ce préréglage.
- **Attribut de regroupement** (facultatif) : un attribut catégoriel utilisé pour dessiner des enveloppes convexes autour des nœuds qui partagent chaque valeur.
- **Liens affichés** (facultatif) : un ou plusieurs types de liens à tracer. Chaque type de lien choisi doit aussi avoir un libellé, que les personnes participantes voient dans le sélecteur de préréglages. Ce libellé est au départ le nom du type de lien, et vous pouvez le traduire comme n’importe quel autre texte.
- **Mise en évidence des nœuds** (facultatif) : un ou plusieurs attributs booléens ; les nœuds dont la valeur est vraie sont mis en évidence tant que le préréglage est actif. Chaque attribut choisi doit aussi avoir un libellé, que les personnes participantes voient dans le sélecteur de préréglages. Ce libellé est au départ le nom de l’attribut, et vous pouvez le traduire comme n’importe quel autre texte (voir [Traduire votre protocole](/fr/design-protocols/translating-your-protocol#labels-in-a-narrative-stages-legend)).

Les options de groupes, de liens et de mise en évidence se choisissent parmi les attributs déjà présents dans votre livre de codes (la définition des types de nœuds, de liens et de leurs attributs, comme le dictionnaire des codes d’une enquête) : définissez donc les attributs dont un préréglage a besoin avant de le construire.

### Arrière-plan {#background}

Comme une étape « Sociogramme », une étape « Narration » peut s’afficher sur une série de cercles concentriques ou sur une image d’arrière-plan personnalisée. Un SVG adaptatif est le meilleur choix pour une image d’arrière-plan, car il garde les zones et les libellés lisibles lorsque le canevas change de forme. Consultez [Arrière-plans SVG adaptatifs](/fr/design-protocols/responsive-svg-backgrounds) pour savoir comment en préparer un.

### Comportements {#behaviors}

Trois comportements, définis pour l’étape, modifient la façon dont les personnes participantes peuvent interagir avec le canevas :

- **Disposition automatique** applique une disposition par forces qui affine légèrement les positions enregistrées des nœuds et rapproche les nœuds groupés dans leurs enveloppes. Lorsqu’elle est désactivée, les positions issues de l’attribut de disposition sont affichées telles qu’elles ont été disposées.
- **Autoriser le repositionnement** permet à la personne participante de faire glisser les nœuds sur le canevas.
- **Dessin libre** active les outils d’annotation, pour que la personne participante ou l’équipe de recherche puisse dessiner à main levée sur le réseau avec une souris, un doigt ou un stylet.

<AppOnly app="current">

### Personnaliser la formulation intégrée {#customize-built-in-wording}

La section **Personnaliser la formulation intégrée** de l’éditeur d’étape contient les titres des panneaux, sous **Propre à cette étape**. Chacun commence par la formulation de Network Canvas, dans chaque langue pour laquelle il dispose de formulations, et vous pouvez le modifier et le traduire comme n’importe quel autre texte. Votre protocole ne conserve que les formulations que vous modifiez (voir [Formulations fournies par Network Canvas](/fr/design-protocols/translating-your-protocol#words-network-canvas-supplies)). Un titre ne figure dans la section que tant qu’un préréglage met en évidence des attributs, affiche des liens ou regroupe des nœuds, et il est supprimé lorsque plus aucun préréglage ne le fait.

Les info-bulles des outils de dessin sont les mêmes dans toutes les étapes « Narration » : elles se trouvent donc sous **Commun à toutes les étapes de ce type**, dans la même section, tant que **Dessin libre** est activé. Une modification de ces info-bulles s’applique à toutes ces étapes, et elle est enregistrée dès que vous quittez le champ. Il y en a trois : **Info-bulle pour activer ou désactiver le dessin** nomme le bouton qui active et désactive le dessin, **Info-bulle pour figer ou laisser s’estomper les annotations** le bouton qui fige les annotations ou les laisse de nouveau s’estomper, et **Info-bulle de réinitialisation des annotations** le bouton qui les efface.

Les info-bulles des boutons qui suspendent et reprennent la disposition automatique font partie des [textes de l’entretien](/fr/design-protocols/translating-your-protocol#interview-text), communs avec l’interface « Sociogramme », et se reformulent et se traduisent dans le tableau des traductions, sous **Boutons**.

</AppOnly>

## Concevoir les préréglages en fonction de vos questions de recherche {#designing-presets-around-your-research-questions}

Un préréglage est une grille de lecture du réseau : concevez donc chacun pour ouvrir une piste de questions précise que vous souhaitez aborder pendant l’entretien. Gardez chaque préréglage centré sur un seul sujet : une idée claire par vue est plus facile à lire pour la personne participante et plus facile à commenter pour vous.

<GoodPractice>

Donnez à chaque préréglage un seul sujet, qui correspond à une question, et nommez-le en conséquence : par exemple un préréglage « Soutien » qui met en évidence les personnes qui apportent du soutien, ou un préréglage « Groupes » qui montre comment le réseau se divise en communautés. Le libellé est visible par la personne participante : un nom court et parlant l’aide à suivre la conversation lorsque vous changez de vue.

</GoodPractice>

<GoodPractice>

Comme l’interface « Narration » ne montre que les alters qui ont une valeur pour l’attribut de disposition du préréglage, réutilisez l’attribut de disposition que vos personnes participantes ont rempli dans une étape [« Sociogramme »](/fr/design-protocols/interface-documentation/sociogram) précédente. Cela reproduit la disposition qu’elles ont elles-mêmes donnée à leur réseau, au lieu de partir d’un canevas vide.

</GoodPractice>

## Garder une trace de la conversation {#capturing-the-conversation}

Les annotations en dessin libre sont une aide à la discussion en direct, et non des données enregistrées. Une annotation s’estompe au bout de quelques secondes, sauf si vous la figez, et rien de ce qui est dessiné sur le canevas n’est enregistré avec l’entretien. Comme l’interface « Narration » ne recueille rien elle-même, prévoyez séparément la façon dont vous garderez une trace de la discussion qu’elle suscite, par exemple en utilisant un logiciel d’enregistrement d’écran et d’enregistrement audio pour conserver ce qui est dit et dessiné.

### À éviter {#try-to-avoid}

<BadPractice>

Ne comptez pas sur l’interface « Narration » pour recueillir des données. Elle sert uniquement à l’affichage ; si vous devez enregistrer un attribut ou un lien que la personne participante mentionne en parlant, recueillez-le dans une étape qui recueille des données, comme une étape [« Sociogramme »](/fr/design-protocols/interface-documentation/sociogram) ou une interface de type interpréteur de noms (une question posée sur chaque alter déjà cité).

</BadPractice>

<BadPractice>

Évitez de surcharger un seul préréglage avec tous les groupes, types de liens et attributs à la fois. Une vue trop dense est difficile à lire et difficile à commenter. Répartissez les sujets dans des préréglages distincts et passez de l’un à l’autre.

</BadPractice>
