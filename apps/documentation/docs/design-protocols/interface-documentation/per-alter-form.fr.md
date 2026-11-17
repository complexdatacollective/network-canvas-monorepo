---
title: Formulaire par alter
navOrder: 14
translatedFrom: 256c212458540e1bafa75a56da05227af8971b5e
---

<InterfaceSummary type="AlterForm">

<InterfaceMeta type="Interpréteur de noms" creates="Données d’attributs sur un seul type de nœud" usesprompts="false">

</InterfaceMeta>

</InterfaceSummary>

L’interface « Formulaire par alter » (un formulaire pour chaque alter) est une interface de type _interpréteur de noms_ (une question posée sur chaque alter déjà cité) qui recueille des données d’attributs sur les alters (chaque personne que la personne participante cite pendant l’entretien) du réseau d’une personne participante. Dans une étape « Formulaire par alter », les personnes participantes remplissent un [formulaire](../key-concepts/forms) pour chaque nœud de leur réseau. Ces formulaires sont personnalisables et peuvent comporter un ou plusieurs champs pour recueillir des données d’attributs précises à l’aide de diverses [commandes de saisie](../key-concepts/input-controls) (le type de champ avec lequel un attribut est recueilli : zone de texte, curseur, cases à cocher…).

## Configurer une étape « Formulaire par alter » {#configuring-per-alter-form}

![](/assets/img/interface-documentation/per-alter-form/add-screen.png)

Un seul type de nœud peut être sélectionné par écran. Cet écran permet le [filtrage](../key-concepts/network-filtering) des nœuds qui correspondent au type indiqué.

![](/assets/img/interface-documentation/per-alter-form/architect-node-type.png)

Chaque nœud reçoit des valeurs d’attributs au moyen d’un [formulaire](../key-concepts/forms) configurable.

![](/assets/img/interface-documentation/per-alter-form/architect-form.png)

### Bonnes pratiques {#best-practices}

<GoodPractice>

Utilisez cette interface comme un moyen simple de recueillir systématiquement des données sur les alters.

</GoodPractice>

<GoodPractice>

Placez une étape [« Information »](../interface-documentation/information) avant cette interface pour présenter aux personnes participantes les tâches du formulaire qu’elles rempliront pour chaque alter.

</GoodPractice>

### À éviter {#try-to-avoid}

<BadPractice>

Évitez de surcharger cette interface avec trop de champs ou des consignes trop chargées en texte. Envisagez plutôt de tirer parti d’autres interfaces plus interactives, comme les interfaces [« Classement par catégories »](../interface-documentation/categorical-bin) et [« Classement ordinal »](../interface-documentation/ordinal-bin), pour alléger la charge des personnes participantes.

</BadPractice>
