---
title: Options communes des interfaces
navOrder: 1

layout: page
translatedFrom: 46902ff86ef2c61eb91878599b8c35f2a8337703
---

Certaines options de configuration sont disponibles pour tous les écrans d’interface ou pour la plupart d’entre eux (selon la sous-catégorie d’interface, par exemple les générateurs de noms).

<AppOnly app="current">

## L’éditeur d’étape {#the-stage-editor}

À côté de l’éditeur d’étape, Architect liste les sections de l’étape. Choisissez une section dans la liste pour y accéder directement. Chaque entrée est marquée d’une couleur et d’une icône qui indiquent son état (terminée, non terminée, comporte un problème, désactivée, ou pas encore disponible, c’est-à-dire une section qui ne peut pas être remplie tant qu’un autre élément de l’étape n’a pas été choisi) : vous voyez ainsi d’un coup d’œil quelles parties de l’étape demandent encore votre attention. Les lecteurs d’écran annoncent le même état après le nom de la section. Sur un écran étroit, la liste apparaît au-dessus de l’éditeur plutôt qu’à côté.

Si vous essayez d’enregistrer une étape qui n’est pas terminée, Architect ne l’enregistre pas et liste chaque problème au-dessus du formulaire, en nommant la section où il se trouve, tout en signalant le problème à côté de la commande concernée.

</AppOnly>

## Configuration commune {#shared-configuration}

![](/assets/img/interface-documentation/shared/shared-configuration.png)

### Nom {#name}

Toutes les étapes ont un nom configurable. Il s’affiche dans la navigation pendant les entretiens, et dans la chronologie pendant la construction des entretiens. Il peut servir à donner un titre facile à retenir ou à décrire l’objectif d’une étape particulière.

### Type d’entité {#entity-type}

Tous les types d’étapes doivent sélectionner un seul type d’entité, qui définit le type d’entité principal du recueil de données. La seule exception est l’étape « Information », qui ne recueille aucune donnée.

Selon l’interface, il s’agit soit d’un type de _nœud_, soit d’un type de _lien_.

<AppOnly app="current">

Dans Architect, les types de nœuds et de liens se créent et se modifient depuis le sélecteur de type lui-même. **Créer un type de nœud** ou **Créer un type de lien**, sous le sélecteur, ouvre l’éditeur de type sans quitter l’étape, et le nouveau type est sélectionné dans l’étape dès qu’il est enregistré. **Modifier ce type de nœud** (ou **Modifier ce type de lien**) ouvre le type que l’étape utilise déjà, pour que vous puissiez modifier sur place son nom et sa couleur (et, pour un type de nœud, sa forme et son icône).

</AppOnly>

### Filtrage {#filtering}

Cette fonction est disponible pour les catégories d’étapes _Sociogramme_ et _Interpréteur de noms_ (une question posée sur chaque alter déjà cité). Elle permet d’affiner davantage le type d’entité sélectionné.

Par exemple, une étape « Sociogramme » peut avoir pour type d’entité le type de nœud « Personne ». Vous pouvez alors utiliser cette option pour ne retenir que les nœuds « Personne » qui ont aussi un attribut précis.

[En savoir plus sur le filtrage](../key-concepts/network-filtering)

### Logique de saut {#skip-logic}

Cette fonction est disponible pour tous les types d’étapes. L’état du réseau de la personne participante peut être évalué pour déterminer si une étape doit être affichée ou au contraire ignorée.

[En savoir plus sur la logique de saut](../key-concepts/skip-logic)
