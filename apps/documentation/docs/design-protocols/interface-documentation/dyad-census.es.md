---
title: Censo de díadas
navOrder: 17
translatedFrom: ebfab1b11b3ddb6077c6a43cc7f22461742e0502
---

<InterfaceSummary type="DyadCensus">

<InterfaceMeta type="Intérprete de nombres" creates="Vínculos de uno o varios tipos" usesprompts="true">

</InterfaceMeta>

</InterfaceSummary>

La interfaz «Censo de díadas» es una interfaz de tipo _intérprete de nombres_ que recoge vínculos entre los álteres (cada persona a la que se nombra durante la entrevista) que ya forman parte de la red. En una etapa «Censo de díadas», se pregunta a quienes participan si cada par posible de álteres está unido por un vínculo. Para explicar a la persona participante el propósito de la tarea, coloca una etapa [«Información»](../interface-documentation/information) antes de la etapa «Censo de díadas».

## Configurar la etapa «Censo de díadas» {#configuring-dyad-census}

Una etapa «Censo de díadas» puede incluir varias [preguntas](/es/design-protocols/key-concepts/prompts), cada una de las cuales corresponde a un único tipo de vínculo. Cada par de álteres se considera por separado en cada pregunta.

### Buenas prácticas {#best-practices}

<GoodPractice>

Usa esta interfaz para animar a quienes participan a añadir vínculos que quizá no habían tenido en cuenta.

</GoodPractice>

### Qué evitar {#try-to-avoid}

<BadPractice>

Usar esta interfaz con un gran número de álteres da lugar a un gran número de pantallas. El número de pares crece rápidamente con el número de álteres: n álteres suponen n(n-1)/2 pares por pregunta.

</BadPractice>
