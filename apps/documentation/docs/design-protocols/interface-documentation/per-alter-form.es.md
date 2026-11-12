---
title: Formulario por álter
navOrder: 14
translatedFrom: 256c212458540e1bafa75a56da05227af8971b5e
---

<InterfaceSummary type="AlterForm">

<InterfaceMeta type="Intérprete de nombres" creates="Datos de atributos sobre un único tipo de nodo" usesprompts="false">

</InterfaceMeta>

</InterfaceSummary>

La interfaz «Formulario por álter» (un formulario para cada álter) es una interfaz de tipo _intérprete de nombres_ que recoge datos de atributos sobre los álteres (cada persona a la que se nombra durante la entrevista) de la red de una persona participante. En una etapa «Formulario por álter», quienes participan rellenan un [formulario](../key-concepts/forms) sobre cada nodo de su red. Estos formularios se pueden personalizar y pueden incluir uno o varios campos para recoger datos concretos de atributos mediante diversos [controles de entrada](../key-concepts/input-controls).

## Configurar la etapa «Formulario por álter» {#configuring-per-alter-form}

![](/assets/img/interface-documentation/per-alter-form/add-screen.png)

En cada pantalla se puede seleccionar un único tipo de nodo. Esta pantalla admite el [filtrado](../key-concepts/network-filtering) de los nodos que coinciden con el tipo indicado.

![](/assets/img/interface-documentation/per-alter-form/architect-node-type.png)

A cada nodo se le asignarán variables mediante un [formulario](../key-concepts/forms) configurable.

![](/assets/img/interface-documentation/per-alter-form/architect-form.png)

### Buenas prácticas {#best-practices}

<GoodPractice>

Usa esta interfaz como una forma sencilla de recoger datos sobre los álteres de manera sistemática.

</GoodPractice>

<GoodPractice>

Coloca una etapa [«Información»](../interface-documentation/information) antes de esta interfaz para explicar a quienes participan las tareas del formulario que rellenarán para cada álter.

</GoodPractice>

### Qué evitar {#try-to-avoid}

<BadPractice>

Evita sobrecargar esta interfaz con demasiados campos o con preguntas con mucho texto. En su lugar, plantéate aprovechar otras interfaces más interactivas, como [«Clasificación por categorías»](../interface-documentation/categorical-bin) y [«Clasificación ordinal»](../interface-documentation/ordinal-bin), para reducir la carga de quienes participan.

</BadPractice>
