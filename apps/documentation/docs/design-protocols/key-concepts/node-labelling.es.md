---
title: Etiquetado de nodos
navOrder: 13
translatedFrom: 16f0a31bf39a92b6aec134b3022dba22baa9066b
---

## Cómo se elige la etiqueta de un nodo {#how-a-nodes-label-is-chosen}

Cada nodo se muestra con una etiqueta: en un sociograma, en la lista de un generador de nombres, en un contenedor y en cualquier lugar donde el texto de una etapa [inserte](/es/design-protocols/key-concepts/piped-text) la **Etiqueta del nodo**. La entrevista elige la etiqueta de cada nodo de la siguiente manera:

1. Si el tipo del nodo tiene una [etiqueta dinámica](#dynamic-labels), el nodo muestra esa etiqueta.
2. En caso contrario, el nodo muestra su etiqueta predeterminada, que se obtiene de los propios datos del nodo: un atributo llamado «name»; si no lo hay, uno cuyo nombre contenga «name»; si tampoco, en los datos importados, una columna cuyo nombre contenga «name» aunque el [libro de códigos](/es/design-protocols/key-concepts/codebook) no la incluya; y, si no, el primer atributo de texto que tenga un valor.
3. Un nodo que no tenga ninguno de ellos se muestra como «Sin nombre».

Si un nodo muestra una etiqueta inesperada, comprueba que su tipo tenga un atributo llamado «name» y que ese atributo reciba un valor durante la entrevista.

## Etiquetar nodos a partir de datos de listas predefinidas {#labeling-nodes-from-roster-data}

Para controlar el etiquetado de los nodos procedentes de recursos de archivos de red (listas predefinidas que se importan como archivos de datos), da a tus nodos un atributo llamado «name» (sin distinguir mayúsculas y minúsculas). Puedes incluir este atributo como columna en tu archivo CSV o como atributo con nombre en un archivo GraphML.

Consulta también: [trabajar con recursos](/es/design-protocols/key-concepts/resources#network).

## Etiquetas dinámicas {#dynamic-labels}

Una etiqueta dinámica es una etiqueta que escribes por tu cuenta para un tipo de nodo. Sustituye a la etiqueta predeterminada en todos los nodos de ese tipo, y puede cambiar de un nodo a otro y a lo largo de la entrevista: puede mostrar los atributos de un nodo y puede mostrar un texto distinto según esos atributos o según el lugar que el nodo ocupa en la red, por ejemplo cuántos vínculos tiene.

Las etiquetas dinámicas son una función avanzada. La mayoría de los protocolos no las necesitan, porque la etiqueta predeterminada ya muestra el nombre de cada nodo.

Las etiquetas dinámicas funcionan en Interviewer y en [Fresco](/es/collect-data/fresco/about). Forman parte del propio protocolo, así que no hace falta ningún archivo adicional.

### Activar una etiqueta dinámica {#turning-on-a-dynamic-label}

1. En Architect, abre el **Libro de códigos** y edita el tipo de nodo. También puedes hacerlo desde una etapa, al crear un tipo de nodo o al editar el que usa la etapa.
2. Activa **Etiqueta dinámica**.
3. Escribe la etiqueta en el campo **Etiqueta**.
4. Guarda el tipo de nodo.

Si vuelves a desactivar **Etiqueta dinámica**, se elimina la etiqueta que escribiste y el tipo de nodo vuelve a su etiqueta predeterminada.

### Escribir la etiqueta {#writing-the-label}

La etiqueta es una sola línea de texto. Puedes escribir texto normal y emojis, e insertar dos clases de elementos con el botón **Atributo** de la barra de herramientas del campo, o escribiendo `{`.

**Atributos.** Un atributo se muestra como una píldora: en cada nodo, la etiqueta muestra en su lugar el valor que tiene ese nodo. Puedes insertar cualquier atributo del tipo de nodo, o la **Etiqueta predeterminada**, que es la etiqueta que el nodo habría tenido sin una etiqueta dinámica. Por ejemplo, una etiqueta formada por la etiqueta predeterminada seguida de la edad del nodo muestra «Alice 34» en un nodo y «Bo 27» en otro. Puede que un atributo no tenga valor en algunos nodos, y un valor que falta no muestra nada. Consulta [Cuando falta información](/es/design-protocols/key-concepts/piped-text#when-information-is-missing).

**Atributos dinámicos.** Un atributo dinámico es una palabra o expresión que cambia de un nodo a otro. Elige **Crear atributo dinámico** bajo **Atributos dinámicos** en la lista, elige su **Lógica** y escribe cada versión:

- **Si … en caso contrario** muestra una versión cuando se cumplen las reglas que defines, y otra en caso contrario. **Si no se cumple … en caso contrario** hace lo contrario.
- **Redacción distinta para cada respuesta** muestra una versión para cada respuesta a un atributo categórico, ordinal o booleano.
- **Redacción para números en singular o en plural** muestra una versión para cada forma de número, como «1 hijo» y «3 hijos».

Un atributo dinámico pertenece a la etiqueta, así que se puede usar más de una vez en la etiqueta, y un cambio en él se aplica en todos los lugares de la etiqueta en los que se usa. Selecciona su píldora para cambiarlo. Sus versiones son palabras sin formato. Una versión se puede dejar vacía y, en ese caso, no se muestra nada en lugar de la píldora. Consulta [Atributos dinámicos](/es/design-protocols/key-concepts/piped-text#dynamic-attributes).

### Reglas {#rules}

Un **Si** comprueba reglas sobre el nodo en el que está la etiqueta. Defínelas en **Reglas de «Si»**, en los ajustes del atributo dinámico. Una regla puede comprobar:

- un atributo del nodo, por ejemplo si su edad es de al menos 18;
- si el nodo tiene un vínculo de un tipo determinado, o un atributo de uno de sus vínculos;
- el número de vínculos que tiene el nodo, de un tipo o de cualquier tipo. El número puede compararse con un número que indiques (exactamente, más de, como máximo, etc.) o con los demás nodos del mismo tipo: **Es el más alto entre los nodos de su tipo** y **Es el más bajo entre los nodos de su tipo**. Los nodos que empatan en el número más alto, o en el más bajo, cumplen todos la regla. Ningún nodo la cumple cuando todos los nodos del tipo tienen el mismo número de vínculos.

Cuando un **Si** tiene más de una regla, eliges en **Coincidencia** si deben cumplirse todas o basta con cualquiera de ellas.

**Añadir «En caso contrario, si»** añade una versión más con sus propias reglas, que se comprueba cuando las versiones anteriores no se aplican. La última versión, **En caso contrario**, se muestra cuando no se aplica ninguna de las demás.

Por ejemplo, para señalar a la persona mejor conectada en un sociograma, escribe la etiqueta predeterminada seguida de un atributo dinámico con **Si … en caso contrario**, cuya regla sea que el número de vínculos «conoce» es el más alto entre los nodos de su tipo. Haz que su primera versión sea un emoji de estrella y deja vacía la versión **En caso contrario**. A medida que la persona participante dibuja vínculos, la estrella pasa al nodo que tenga más.

### Cómo ven las personas participantes una etiqueta dinámica {#how-participants-see-a-dynamic-label}

Las personas participantes solo ven la etiqueta terminada. Se muestra en cualquier lugar donde se dibuje el nodo y en cualquier lugar donde el texto de una etapa inserte la etiqueta del nodo. La etiqueta se vuelve a calcular cada vez que cambian los atributos o los vínculos del nodo, de modo que se mantiene al día a medida que avanza la entrevista.

Una etiqueta dinámica solo cambia lo que se muestra. No se guarda con el nodo ni se exporta: los atributos del nodo se exportan como de costumbre.

### Traducir una etiqueta dinámica {#translating-a-dynamic-label}

En un protocolo con más de un idioma, una etiqueta dinámica se traduce en la [tabla de traducciones](/es/design-protocols/tutorials/translating-your-protocol#the-translation-table), como cualquier otra cadena traducible que muestre valores. La lógica de sus atributos dinámicos es la misma en todos los idiomas, y solo se traduce la redacción de cada versión.

### Protocolos que usaban un script de etiquetado de nodos {#protocols-that-used-a-node-label-worker}

Los protocolos creados para versiones anteriores de Interviewer podían etiquetar los nodos con un script, `nodeLabelWorker.js`, colocado dentro del archivo del protocolo. Ni las versiones actuales de Interviewer ni Fresco ejecutan scripts. Usa una etiqueta dinámica en su lugar.
