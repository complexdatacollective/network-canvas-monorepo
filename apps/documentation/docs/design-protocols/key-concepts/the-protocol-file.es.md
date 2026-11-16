---
title: El archivo de protocolo
navOrder: 1
translatedFrom: 40092f88310335767b2d6122e9461605a97d223f
---

<Definition>

Un archivo con la extensión .netcanvas que representa tu protocolo de entrevista y contiene todos los datos y recursos que utiliza.

</Definition>

## Detalles {#details}

Un protocolo de Network Canvas se almacena como un archivo `.netcanvas`: una copia autónoma de tu protocolo y de todo lo que utiliza. La relación entre ese archivo y la copia con la que trabajas depende de la versión de Architect que uses:

- En **Architect** (la aplicación para navegador), tu protocolo se guarda en una **biblioteca** dentro del navegador mientras trabajas. Para obtener un archivo `.netcanvas` (para hacer una copia de seguridad, trasladarlo o distribuirlo), usa **Descargar** en la pantalla de vista general del protocolo.
- En **Architect Classic** (la aplicación de escritorio), tu protocolo _es_ un archivo `.netcanvas` de tu ordenador. Se comporta como cualquier otro archivo: puedes moverlo, cambiarle el nombre y puedes (¡y deberías!) hacer copias de seguridad de él.

En cualquier caso, el archivo `.netcanvas` contiene todos los datos de tu protocolo. Así, si usas [recursos](/es/design-protocols/key-concepts/resources), como datos de listas (listas predefinidas que se importan como archivos de datos), imágenes o vídeo, estos se incorporan al archivo. Consulta [Guardar y hacer copias de seguridad](/es/design-protocols/saving-and-backing-up) para saber cómo guarda tu trabajo cada versión y cómo mantenerlo a salvo.

## Contenido de un archivo .netcanvas {#inside-a-netcanvas-file}

Aunque puedes tratar un archivo `.netcanvas` como un único archivo, en realidad es una carpeta comprimida. Dentro, las etapas, las preguntas y la lógica que forman tu entrevista se almacenan en un archivo llamado `protocol.json`, y los recursos que hayas añadido (como imágenes, vídeo o datos de listas) se guardan junto a él en una carpeta `assets/`.

Para ver el contenido de un protocolo, cámbiale el nombre para que termine en `.zip` y descomprímelo. El principal motivo para hacerlo es el flujo de trabajo de [etiquetado personalizado de nodos](/es/design-protocols/key-concepts/node-labelling#custom-node-labeling-advanced), que consiste en colocar un archivo `nodeLabelWorker.js` en el nivel superior del protocolo, en la misma carpeta que `protocol.json`. Una vez añadido el archivo, vuelve a comprimir la carpeta, cambia el nombre del archivo comprimido para que termine en `.netcanvas` e impórtalo en Interviewer. Si más adelante editas el protocolo en Architect, el archivo JavaScript se conservará al guardar.

## Creación de archivos de protocolo {#authoring-protocol-files}

Architect crea tu protocolo por ti cuando empiezas uno nuevo. En **Architect** (la aplicación para navegador), los cambios se guardan automáticamente en la biblioteca del navegador mientras trabajas: no hay ningún botón para guardar, y usas **Descargar** para obtener un archivo `.netcanvas` cuando quieres una copia. En **Architect Classic**, Architect crea el archivo `.netcanvas` y te pide que guardes los cambios a medida que añades etapas, editas el contenido o subes recursos. En cualquier caso, los cambios se almacenan dentro del protocolo.

Sin embargo, ten en cuenta que, una vez que hayas publicado o distribuido tu protocolo en otras aplicaciones, hacer cambios lo convierte, en la práctica, en una versión nueva. Si necesitas hacer cambios después de publicarlo o distribuirlo, tienes dos opciones. Se recomienda guardar una copia del protocolo con un nombre nuevo después de hacer los cambios e importar la versión nueva en Interviewer. La otra opción es eliminar de Interviewer o de Fresco el protocolo existente (y los datos de entrevistas que tenga) y subir la versión más reciente. Esto es necesario para garantizar la compatibilidad entre las herramientas.

Si decides crear o editar un archivo de protocolo a mano, serás responsable de garantizar que cumpla todas las especificaciones del [esquema de protocolo](/es/get-started/protocol-schema-information) actual.

## Uso de los archivos de protocolo {#using-protocol-files}

Una vez completado tu archivo de protocolo, puedes usarlo en Interviewer o en Fresco.

- **Interviewer**: consulta nuestro [tutorial sobre flujos de trabajo de protocolos y datos](/es/collect-data/protocol-and-data-workflows) para obtener más información sobre los flujos de trabajo de protocolos en Interviewer.
- **Fresco**: consulta [Usar Fresco](/es/collect-data/fresco/using-fresco#uploading-protocols) para obtener más información sobre cómo subir protocolos a Fresco.
