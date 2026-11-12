---
title: Narrativa
navOrder: 10
translatedFrom: 046c8b96038791df427f8f6c2342d857777cc42c
---

<InterfaceSummary type="Narrative">

<InterfaceMeta type="Visualización de datos" creates="No crea datos" usesprompts="false">

</InterfaceMeta>

</InterfaceSummary>

Las interfaces «Narrativa» y [«Sociograma»](/es/design-protocols/interface-documentation/sociogram) son las dos interfaces de visualización basadas en un lienzo de Network Canvas. En una etapa «Sociograma», quienes participan construyen la imagen espacial de su red colocando a sus álteres (cada persona a la que se nombra durante la entrevista) y dibujando los vínculos que los unen. La interfaz «Narrativa» es su complemento de solo visualización: toma una red que la persona participante ya ha dispuesto (normalmente en una etapa «Sociograma») y se la vuelve a mostrar para conversar abiertamente sobre ella, en un diálogo que guía quien investiga. No registra ningún dato nuevo propio.

Como no recopila nada, la interfaz «Narrativa» está pensada para el trabajo cualitativo. Representa sobre la red visual datos recopilados en otras partes de la entrevista (pertenencia a grupos, atributos y tipos de vínculo), para que la persona participante y quien investiga puedan comentar conjuntamente la imagen y analizar a fondo lo que muestra.

## Vistas predefinidas {#presets}

Todo lo que configuras en una etapa «Narrativa» se guarda en una o varias **vistas predefinidas** (configuraciones de visualización de la red que defines en una etapa «Narrativa»). Una vista predefinida es una vista guardada de la red que combina hasta cuatro elementos:

| Elemento                      | Qué hace                                                                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Disposición** (obligatoria) | Un atributo de disposición que coloca los nodos. Solo aparecen los álteres que ya tienen un valor en este atributo, así que elige uno que haya rellenado una etapa anterior; por ejemplo, el atributo de disposición que rellenó una pregunta de una etapa «Sociograma». |
| **Grupos** (opcional)         | Un atributo categórico que se dibuja como envolventes convexas de color y semitransparentes detrás de los nodos que comparten cada valor. Un nodo con varios valores aparece dentro de varias envolventes superpuestas.                                                  |
| **Vínculos** (opcional)       | Uno o varios tipos de vínculo que se dibujan entre los nodos.                                                                                                                                                                                                            |
| **Atributos** (opcional)      | Uno o varios atributos booleanos. Los nodos cuyo valor es verdadero se resaltan mientras la vista predefinida está activa.                                                                                                                                               |

Cada vista predefinida tiene una etiqueta que la identifica en la interfaz. Durante la entrevista, un selector flotante de vistas predefinidas permite a quien investiga o a la persona participante pasar de una vista predefinida a otra y mostrar u ocultar los grupos, los vínculos y los atributos resaltados. Cuando una vista predefinida incluye varios atributos para resaltar, se elige cuál se muestra en cada momento en una lista que muestra la etiqueta que has dado a cada atributo. Los tipos de vínculo que dibuja una vista predefinida también se enumeran con las etiquetas que les has dado. Nada de lo que se hace aquí se guarda en los datos: la interfaz «Narrativa» se limita a leerlos.

![Un ejemplo de vista predefinida de una etapa «Narrativa», con nodos resaltados, vínculos entre ellos y envolventes de color de los grupos](/assets/img/interface-documentation/narrative/narrative-example.png)

## Configurar las vistas predefinidas en Architect {#configuring-presets-in-architect}

Una etapa «Narrativa» necesita al menos una vista predefinida. En cada vista predefinida se definen:

- **Etiqueta de la vista predefinida**: un nombre corto, visible para quienes participan, que se muestra en el selector de vistas predefinidas.
- **Atributo de disposición**: el atributo que se usa para colocar los nodos en esta vista predefinida.
- **Atributo de agrupación** (opcional): un atributo categórico que se usa para dibujar envolventes convexas alrededor de los nodos que comparten cada valor.
- **Vínculos mostrados** (opcional): uno o varios tipos de vínculo que se dibujan. Cada tipo de vínculo que eliges también necesita una etiqueta, que quienes participan ven en el selector de vistas predefinidas. Inicialmente es el nombre del tipo de vínculo, y puedes traducirla como cualquier otro texto.
- **Resaltado de nodos** (opcional): uno o varios atributos booleanos; los nodos cuyo valor es verdadero se resaltan mientras la vista predefinida está activa. Cada atributo que eliges también necesita una etiqueta, que quienes participan ven en el selector de vistas predefinidas. Inicialmente, la etiqueta es el nombre del atributo, y puedes traducirla como cualquier otro texto (consulta [Traducir tu protocolo](/es/design-protocols/translating-your-protocol#labels-in-a-narrative-stages-legend)).

Las opciones de grupos, vínculos y resaltado se eligen entre los atributos que ya hay en tu libro de códigos, así que define los atributos que necesita una vista predefinida antes de crearla.

### Fondo {#background}

Como en una etapa «Sociograma», el fondo de una etapa «Narrativa» puede ser una serie de círculos concéntricos o una imagen de fondo personalizada. Como imagen de fondo funciona mejor un SVG adaptable, porque mantiene legibles las zonas y las etiquetas cuando cambia la forma del lienzo. Consulta [Fondos SVG adaptables](/es/design-protocols/responsive-svg-backgrounds) para saber cómo prepararlo.

### Comportamientos {#behaviors}

Tres comportamientos de la etapa cambian la forma en que quienes participan pueden interactuar con el lienzo:

- **Disposición automática** aplica una disposición dirigida por fuerzas que ajusta ligeramente las posiciones guardadas de los nodos y acerca los nodos agrupados hasta reunirlos en sus envolventes. Si está desactivada, se muestran las posiciones del atributo de disposición tal como se dispusieron.
- **Permitir cambiar la posición** permite a la persona participante arrastrar los nodos por el lienzo.
- **Dibujo libre** activa las herramientas de anotación, para que la persona participante o quien investiga pueda dibujar a mano alzada sobre la red con el ratón, con un dedo o con un lápiz óptico.

<AppOnly app="current">

### Personalizar la redacción predeterminada {#customize-built-in-wording}

La sección **Personalizar la redacción predeterminada** del editor de etapas contiene los encabezados de los paneles, en **Textos exclusivos de esta etapa**. Network Canvas aporta una redacción inicial para cada uno, en todos los idiomas para los que la tiene, y puedes cambiarla y traducirla como cualquier otro texto (consulta [Palabras que aporta Network Canvas](/es/design-protocols/translating-your-protocol#words-network-canvas-supplies)). Un encabezado solo está en la sección mientras alguna vista predefinida resalta atributos, muestra vínculos o agrupa nodos, y se elimina cuando ninguna lo hace.

La información emergente de las herramientas de dibujo es la misma en todas las etapas «Narrativa», así que está en **Textos comunes a todas las etapas de este tipo**, en la misma sección, mientras **Dibujo libre** está activado. Un cambio en ella se aplica a todas esas etapas, y se guarda en cuanto sales del campo. Hay tres textos: **Información emergente de activar o desactivar el dibujo** nombra el botón que activa y desactiva el dibujo; **Información emergente de congelar o descongelar las anotaciones**, el botón que congela y descongela las anotaciones, y **Información emergente de restablecer las anotaciones**, el botón que las borra.

La información emergente de los botones que pausan y reanudan la disposición automática es [texto de entrevista](/es/design-protocols/translating-your-protocol#interview-text), compartido con la interfaz «Sociograma», y se reformula y traduce en la tabla de traducciones, en **Botones**.

</AppOnly>

## Diseñar las vistas predefinidas en función de tus preguntas de investigación {#designing-presets-around-your-research-questions}

Una vista predefinida es una lente a través de la cual mirar la red, así que diseña cada una para abrir una línea de preguntas concreta que quieras plantear en la entrevista. Mantén cada vista predefinida centrada en un aspecto: una idea clara por vista es más fácil de interpretar para la persona participante y más fácil de comentar para ti.

<GoodPractice>

Da a cada vista predefinida un único enfoque que corresponda a una pregunta, y ponle una etiqueta acorde; por ejemplo, una vista «Apoyo» que resalte quién presta apoyo, o una vista «Grupos» que muestre cómo se divide la red en comunidades. La etiqueta es visible para la persona participante, así que un nombre corto y significativo le ayuda a seguir la conversación cuando cambias de vista.

</GoodPractice>

<GoodPractice>

Como la interfaz «Narrativa» solo muestra los álteres que tienen un valor en el atributo de disposición de la vista predefinida, reutiliza el atributo de disposición que quienes participan rellenaron en una etapa [«Sociograma»](/es/design-protocols/interface-documentation/sociogram) anterior. Así se reproduce la disposición de la red que hizo la propia persona participante, en lugar de empezar con un lienzo vacío.

</GoodPractice>

## Registrar la conversación {#capturing-the-conversation}

Las anotaciones del dibujo libre son una ayuda para la conversación en directo, no datos guardados. Una anotación desaparece al cabo de unos segundos salvo que la congeles, y nada de lo que se dibuja en el lienzo se registra con la entrevista. Como la interfaz «Narrativa» no recopila nada por sí misma, planifica por separado cómo vas a registrar la conversación que suscita; por ejemplo, con software de grabación de pantalla y de audio para conservar un registro de lo que se dice y se dibuja.

### Qué evitar {#try-to-avoid}

<BadPractice>

No dependas de la interfaz «Narrativa» para recopilar datos. Es de solo visualización; si necesitas registrar un atributo o un vínculo que la persona participante señala mientras habla, recógelo en una etapa que recopile datos, como una etapa [«Sociograma»](/es/design-protocols/interface-documentation/sociogram) o un intérprete de nombres.

</BadPractice>

<BadPractice>

Evita sobrecargar una sola vista predefinida con todos los grupos, tipos de vínculo y atributos a la vez. Una vista densa es difícil de interpretar y de comentar. Separa los distintos aspectos en vistas predefinidas diferentes y cambia de una a otra.

</BadPractice>
