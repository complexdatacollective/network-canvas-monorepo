---
title: Classement ordinal
navOrder: 12
translatedFrom: 4d63fb56c2937ccb0144b4f208adaba2681c5333
---

<InterfaceSummary type="OrdinalBin">

<InterfaceMeta type="Interpréteur de noms" creates="Données d’attributs ordinaux sur un seul type de nœud" usesprompts="true">

</InterfaceMeta>

</InterfaceSummary>

L’interface « Classement ordinal » est une interface de type interpréteur de noms (une question posée sur chaque alter déjà cité) qui recueille des données ordinales sur les alters (chaque personne que la personne participante cite pendant l’entretien) du réseau d’une personne participante. Dans une étape « Classement ordinal », les personnes participantes font glisser les alters un par un dans des cases parallèles (chacune des zones où l’on dépose les nœuds pour les classer) qui représentent les valeurs d’une échelle ordinale. Une fois les alters placés, les personnes participantes peuvent les déplacer d’une case à une autre.

## Configurer une étape « Classement ordinal » {#configuring-ordinal-bin}

Un seul type de nœud peut être sélectionné par écran. Cet écran permet le [filtrage](../key-concepts/network-filtering) de ces nœuds selon leurs attributs.

![](/assets/img/interface-documentation/ordinal-bin/architect_1.png)

Une étape « Classement ordinal » peut comporter plusieurs [consignes](/fr/design-protocols/key-concepts/prompts), chacune portant sur un seul attribut ordinal.

![](/assets/img/interface-documentation/ordinal-bin/architect_2.png)

<AppOnly app="current">

### Personnaliser la formulation intégrée {#customize-built-in-wording}

Lorsque **Exiger le placement de chaque nœud** est activé dans la section **Placement des nœuds** de l’étape, les personnes participantes ne peuvent pas continuer tant que chaque nœud n’est pas dans une case. L’avis qu’elles voient lorsqu’elles essaient se trouve sous **Nœuds non placés**, dans la section **Personnaliser la formulation intégrée** de l’éditeur d’étape. Network Canvas fournit une formulation de départ, dans chaque langue pour laquelle il dispose de formulations, et vous pouvez la modifier et la traduire comme n’importe quel autre texte (voir [Formulations fournies par Network Canvas](/fr/design-protocols/translating-your-protocol#words-network-canvas-supplies)). L’avis peut afficher le nom du type de nœud de l’étape, inséré sous forme de pastille à l’aide du bouton de texte dynamique (piped text : des réponses ou des informations de l’entretien insérées automatiquement dans un texte) du champ.

</AppOnly>

### Bonnes pratiques {#best-practices}

<GoodPractice>

Utilisez cette interface pour recueillir des données ordinales ou d’échelle d’intervalle sur les alters. Même si une « Échelle de Likert » peut être ajoutée comme [commande de saisie](../key-concepts/input-controls/) (le type de champ avec lequel un attribut est recueilli : zone de texte, curseur, cases à cocher…) dans d’autres interfaces, le glisser-déposer de l’interface « Classement ordinal » offre une manière tactile de recueillir ces données, qui est engageante pour les personnes participantes.

</GoodPractice>

### À éviter {#try-to-avoid}

<BadPractice>

En raison de la place disponible, évitez d’utiliser dans cette interface des échelles de plus de six cases. Avec des échelles plus grandes, les libellés des cases deviennent difficiles à lire et les autres éléments visuels de l’interface en pâtissent.

Les libellés des cases peuvent être bien plus longs qu’un ou deux mots : une phrase courte convient. Chaque libellé rétrécit, par paliers, pour tenir dans l’espace dont dispose sa case, plutôt que d’être coupé au milieu d’un mot, et un lecteur d’écran lit toujours le libellé en entier. Ce rétrécissement a toutefois une taille minimale : un libellé assez long pour déborder de sa case même à cette taille est tronqué, ce qui est plus probable avec une échelle plus grande ou sur un petit écran. Vérifiez votre libellé le plus long dans l’[aperçu](/fr/design-protocols/preview-mode) à la taille qu’utiliseront les personnes participantes. Les libellés peuvent utiliser du texte en **gras** et en _italique_ pour la mise en valeur. Les libellés courts restent plus grands et se lisent plus facilement d’un coup d’œil.

</BadPractice>

<BadPractice>

Résistez à la tentation d’utiliser cette interface pour recueillir des données nominales, qu’il vaudrait mieux recueillir dans une étape [« Classement par catégories »](../interface-documentation/categorical-bin/).

</BadPractice>
