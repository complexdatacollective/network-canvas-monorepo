---
title: Clasificación ordinal
navOrder: 12
translatedFrom: 4d63fb56c2937ccb0144b4f208adaba2681c5333
---

<InterfaceSummary type="OrdinalBin">

<InterfaceMeta type="Intérprete de nombres" creates="Datos de atributos ordinales sobre un único tipo de nodo" usesprompts="true">

</InterfaceMeta>

</InterfaceSummary>

La interfaz «Clasificación ordinal» es una interfaz de tipo intérprete de nombres que recoge datos ordinales sobre los álteres (cada persona a la que se nombra durante la entrevista) de la red de una persona participante. En una etapa «Clasificación ordinal», quienes participan arrastran y sueltan los álteres, uno a uno, en contenedores paralelos (cada una de las zonas a las que se arrastran los nodos para clasificarlos) que representan los valores de una escala ordinal. Una vez colocados, quienes participan pueden mover los álteres de un contenedor a otro.

## Configurar la etapa «Clasificación ordinal» {#configuring-ordinal-bin}

En cada pantalla se puede seleccionar un único tipo de nodo. Esta pantalla admite el [filtrado](../key-concepts/network-filtering) de esos nodos según sus atributos.

![](/assets/img/interface-documentation/ordinal-bin/architect_1.png)

Una etapa «Clasificación ordinal» puede incluir varias [preguntas](/es/design-protocols/key-concepts/prompts), cada una de las cuales corresponde a una única variable ordinal.

![](/assets/img/interface-documentation/ordinal-bin/architect_2.png)

<AppOnly app="current">

### Personalizar la redacción predeterminada {#customize-built-in-wording}

Cuando **Exigir que se coloquen todos los nodos** está activado en la sección **Colocación de nodos** de la etapa, quienes participan no pueden continuar hasta que todos los nodos estén en un contenedor. El aviso que ven si lo intentan está en **Nodos sin colocar**, en la sección **Personalizar la redacción predeterminada** del editor de etapas. Network Canvas aporta una redacción inicial, en todos los idiomas para los que la tiene, y puedes cambiarla y traducirla como cualquier otro texto (consulta [Palabras que aporta Network Canvas](/es/design-protocols/translating-your-protocol#words-network-canvas-supplies)). El aviso puede mostrar el nombre del tipo de nodo de la etapa, que se inserta como una píldora con el botón de texto dinámico (piped text) del campo.

</AppOnly>

### Buenas prácticas {#best-practices}

<GoodPractice>

Usa esta interfaz para recoger datos de escala ordinal o de intervalo sobre los álteres. Aunque en otras interfaces se puede añadir una Escala Likert como [control de entrada](../key-concepts/input-controls/), la función de arrastrar y soltar de la interfaz «Clasificación ordinal» ofrece una forma táctil de recoger estos datos que resulta atractiva para quienes participan.

</GoodPractice>

### Qué evitar {#try-to-avoid}

<BadPractice>

Como el espacio es limitado, evita usar en esta interfaz escalas de más de seis contenedores. Con escalas más grandes, las etiquetas de los contenedores se vuelven difíciles de leer y los demás elementos visuales de la interfaz se ven comprometidos.

Las etiquetas de los contenedores pueden ser bastante más largas que una o dos palabras: una frase corta no es ningún problema. Cada etiqueta se reduce, paso a paso, hasta caber en el espacio de su contenedor, en lugar de cortarse a mitad de palabra, y un lector de pantalla siempre lee la etiqueta completa. Sin embargo, esa reducción tiene un límite: una etiqueta tan larga que desborda su contenedor incluso con el tamaño mínimo se recorta, algo que es más probable con una escala más grande o en una pantalla pequeña. Comprueba tu etiqueta más larga en la [vista previa](/es/design-protocols/preview-mode) con el tamaño que usarán quienes participan. Las etiquetas pueden usar texto en **negrita** y _cursiva_ para resaltar algo. Las etiquetas cortas se mantienen más grandes y se leen mejor de un vistazo.

</BadPractice>

<BadPractice>

No uses esta interfaz para recoger datos nominales que sería más adecuado recoger con la interfaz [«Clasificación por categorías»](../interface-documentation/categorical-bin/).

</BadPractice>
