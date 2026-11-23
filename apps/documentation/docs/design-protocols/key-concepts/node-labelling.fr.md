---
title: Libellés des nœuds
navOrder: 13
translatedFrom: 44a0a050e6dfe7dcd627e657ba22133aae96cae4
---

## Comment le libellé d’un nœud est choisi {#how-a-nodes-label-is-chosen}

Chaque nœud est affiché avec un libellé : sur un sociogramme, dans la liste d’un générateur de noms, dans une case, et partout où le texte d’une étape [insère](/fr/design-protocols/key-concepts/piped-text) le **Libellé du nœud**. L’entretien choisit le libellé de chaque nœud de la façon suivante :

1. Si le type du nœud a un [libellé dynamique](#dynamic-labels), le nœud affiche ce libellé.
2. Sinon, le nœud affiche son libellé par défaut, tiré des données propres au nœud : un attribut nommé « name » ; à défaut, un attribut dont le nom contient « name » ; à défaut, pour des données importées, une colonne dont le nom contient « name », même si le [livre de codes](/fr/design-protocols/key-concepts/codebook) ne la mentionne pas ; à défaut, le premier attribut de type texte qui a une valeur.
3. Un nœud qui n’a rien de tout cela s’affiche avec le libellé « Sans nom ».

Si un nœud affiche un libellé inattendu, vérifiez que son type a un attribut nommé « name » et que cet attribut reçoit une valeur pendant l’entretien.

## Attribuer un libellé aux nœuds issus d’une liste prédéfinie {#labeling-nodes-from-roster-data}

Pour contrôler le libellé des nœuds issus d’un fichier de réseau ajouté comme ressource et utilisé comme liste (une liste prédéfinie, importée comme fichier de données, dans laquelle la personne participante choisit), donnez à vos nœuds un attribut appelé « name » (sans tenir compte de la casse). Vous pouvez mettre en œuvre cet attribut sous la forme d’une colonne de votre fichier CSV, ou d’un attribut nommé dans un fichier GraphML.

Voir aussi : [travailler avec les ressources](/fr/design-protocols/key-concepts/resources#network).

## Libellés dynamiques {#dynamic-labels}

Un libellé dynamique est un libellé que vous rédigez vous-même pour un type de nœud. Il remplace le libellé par défaut sur tous les nœuds de ce type, et il peut changer d’un nœud à l’autre et au cours de l’entretien : il peut afficher les attributs d’un nœud, et il peut afficher un texte différent selon ces attributs ou selon la place du nœud dans le réseau, par exemple le nombre de liens qu’il a.

Les libellés dynamiques sont une fonctionnalité avancée. La plupart des protocoles n’en ont pas besoin, car le libellé par défaut affiche déjà le nom de chaque nœud.

Les libellés dynamiques fonctionnent dans Interviewer et dans [Fresco](/fr/collect-data/fresco/about). Ils font partie du protocole lui-même : aucun fichier supplémentaire n’est nécessaire.

### Activer un libellé dynamique {#turning-on-a-dynamic-label}

1. Dans Architect, ouvrez le **Livre de codes** et modifiez le type de nœud. Vous pouvez aussi le faire depuis une étape, lorsque vous créez un type de nœud ou modifiez celui que l’étape utilise.
2. Activez **Libellé dynamique**.
3. Rédigez le libellé dans le champ **Libellé**.
4. Enregistrez le type de nœud.

Si vous désactivez de nouveau **Libellé dynamique**, le libellé que vous avez rédigé est supprimé et le type de nœud retrouve son libellé par défaut.

### Rédiger le libellé {#writing-the-label}

Le libellé est une seule ligne de texte. Vous pouvez saisir du texte ordinaire et des emojis, et insérer deux sortes d’éléments depuis la barre d’outils du champ.

**Des valeurs, avec le bouton seringue.** Une valeur est un espace réservé : sur chaque nœud, le libellé affiche à sa place la valeur de ce nœud. Vous pouvez insérer n’importe quel attribut du type de nœud, ou le **Libellé par défaut**, c’est-à-dire le libellé que le nœud aurait eu sans libellé dynamique. Par exemple, un libellé composé du libellé par défaut suivi de l’âge du nœud affiche « Alice 34 » sur un nœud et « Bo 27 » sur un autre.

Un attribut peut ne pas avoir de valeur pour certains nœuds. Lorsque vous en insérez un, sélectionnez-le dans le libellé pour rédiger deux versions du texte qui l’entoure : l’une pour le cas où la valeur est connue, l’autre pour le cas où elle ne l’est pas. Voir [Lorsque l’information manque](/fr/design-protocols/key-concepts/piped-text#when-information-is-missing).

**De la logique, avec le bouton de logique.** La logique insère un groupe de formulations possibles, dont chaque nœud affiche une seule :

- **Si … sinon** affiche une formulation lorsque les règles que vous définissez sont satisfaites, et une autre sinon. **Sauf si … sinon** fait l’inverse.
- **Formulation différente pour chaque réponse** affiche une formulation pour chaque réponse à un attribut catégoriel, ordinal ou booléen.

Sélectionnez un groupe dans le libellé pour l’ouvrir et rédiger le texte de chacun de ses cas. Un cas peut rester vide, pour ne rien afficher, et il peut contenir des valeurs et d’autres éléments de logique.

### Règles {#rules}

Un **Si** vérifie des règles portant sur le nœud qui porte le libellé. Choisissez **Modifier les règles** sur sa ligne pour les définir. Une règle peut vérifier :

- un attribut du nœud, par exemple si son âge est d’au moins 18 ;
- si le nœud a un lien d’un type donné, ou un attribut de l’un de ses liens ;
- le nombre de liens du nœud, d’un type ou de tout type. Ce nombre peut être comparé à un nombre que vous indiquez (exactement, plus de, au plus, etc.) ou aux autres nœuds du même type : **Est le plus élevé parmi les nœuds de son type** et **Est le plus faible parmi les nœuds de son type**. Les nœuds à égalité pour le nombre le plus élevé, ou pour le plus faible, satisfont tous la règle. Aucun nœud ne la satisfait lorsque tous les nœuds du type ont le même nombre de liens.

Lorsqu’un **Si** a plusieurs règles, vous choisissez si elles doivent toutes être satisfaites ou si une seule suffit.

**Ajouter « Sinon, si »** ajoute un cas supplémentaire avec ses propres règles, vérifié lorsque les cas précédents ne s’appliquent pas. Le dernier cas, **Sinon**, s’affiche lorsqu’aucun des autres ne s’applique.

Par exemple, pour signaler la personne la mieux connectée sur un sociogramme, rédigez le libellé par défaut suivi d’un **Si** dont la règle est que le nombre de liens « connaît » est le plus élevé parmi les nœuds de son type, et placez un emoji étoile dans ce cas. À mesure que la personne participante trace des liens, l’étoile passe au nœud qui en a le plus.

### Comment les personnes participantes voient un libellé dynamique {#how-participants-see-a-dynamic-label}

Les personnes participantes ne voient que le libellé final. Il s’affiche partout où le nœud est dessiné, et partout où le texte d’une étape insère le libellé du nœud. Le libellé est recalculé chaque fois que les attributs ou les liens du nœud changent : il reste donc à jour tout au long de l’entretien.

Un libellé dynamique ne change que ce qui est affiché. Il n’est pas enregistré avec le nœud et n’est pas exporté : les attributs du nœud sont exportés comme d’habitude.

### Traduire un libellé dynamique {#translating-a-dynamic-label}

Dans un protocole en plusieurs langues, un libellé dynamique se traduit comme tout autre texte qui affiche des valeurs, dans le [tableau des traductions](/fr/design-protocols/tutorials/translating-your-protocol#the-translation-table). Ses valeurs et sa logique sont conservées dans chaque traduction, et le texte de chaque cas est traduit.

### Protocoles qui utilisaient un script de libellés de nœuds {#protocols-that-used-a-node-label-worker}

Les protocoles créés pour d’anciennes versions d’Interviewer pouvaient attribuer un libellé aux nœuds à l’aide d’un script, `nodeLabelWorker.js`, placé dans le fichier du protocole. Ni les versions actuelles d’Interviewer ni Fresco n’exécutent de scripts. Utilisez plutôt un libellé dynamique.
