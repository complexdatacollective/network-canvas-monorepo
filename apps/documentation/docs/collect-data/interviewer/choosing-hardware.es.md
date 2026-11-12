---
title: Elegir un dispositivo para Interviewer
navOrder: 3
wip: false
toc: true
translatedFrom: e172569169a1662f0d42f1623b4f90ac38be9f52
---

Elegir el dispositivo en el que vas a ejecutar Interviewer es un paso importante para optimizar la calidad de los datos que recopilas, así como el flujo de trabajo general de un estudio con Network Canvas.

<TipBox>

La comparación de plataformas que aparece más abajo (junto con las consideraciones sobre la disponibilidad en las tiendas de aplicaciones y la gestión de aplicaciones nativas) se aplica sobre todo a **Interviewer Classic**, que se instala de forma nativa en cada dispositivo. La versión de **Interviewer** para navegador funciona en cualquier [navegador web compatible](/es/collect-data/interviewer/installing-interviewer#supported-browsers), así que su principal requisito de hardware es un dispositivo que ejecute bien un navegador actual. Los consejos de esta página sobre la calidad de la pantalla, el teclado, el rendimiento y la conectividad siguen siendo válidos, pero puedes pasar por alto las advertencias sobre las tiendas de aplicaciones y la instalación nativa.

</TipBox>

## Aspectos clave {#key-concerns}

Hay varias consideraciones importantes que debes tener en cuenta al tomar esta decisión.

La primera es que **introducir texto resulta muy engorroso sin un teclado físico**. Cuando usas un dispositivo sin teclado físico (como una tableta), el teclado en pantalla que aparece al introducir texto puede ocupar más del 50 % de la pantalla disponible. Eso deja muy poco espacio para mostrar los elementos de la aplicación u otros datos. Aunque Interviewer Classic tiene funciones para paliarlo (consulta nuestro [artículo sobre cómo configurar el dispositivo de entrevista](/es/collect-data/interviewer/configuring-devices)), te recomendamos encarecidamente que elijas un dispositivo con teclado físico, salvo que en tu estudio haya que introducir muy poco texto.

La segunda es que debes **tener en cuenta tu flujo de trabajo de gestión de datos**. ¿Cómo vas a distribuir tus protocolos de entrevista (y con qué frecuencia necesitarás versiones nuevas)? ¿Cómo vas a sacar los datos de tus dispositivos de entrevista? Según el sistema operativo y la plataforma, este proceso puede ser más o menos difícil, y puede requerir herramientas de terceros (como proveedores de servicios en la nube).

La tercera es que **el rendimiento del hardware influye directamente en la experiencia de uso**. Interviewer hace un uso intensivo de animaciones y de interacciones que exigen mucho a la GPU. Si el dispositivo tiene un rendimiento de GPU deficiente, habrá tirones y otros efectos secundarios que quienes participan pueden percibir como desagradables, lo que a su vez se traduce en datos de peor calidad. Del mismo modo, el rendimiento de la CPU influye en cuánto se tarda en abrir las interfaces que usan una lista (una lista predefinida que se importa como archivo de datos), lo que puede hacer que estas funciones resulten más tediosas.

La cuarta es la **conectividad**. Si piensas usar **Interviewer** con interfaces del esquema 8 que dependen de internet, como la [interfaz geoespacial](/es/design-protocols/interface-documentation/geospatial), el dispositivo de entrevista necesitará una conexión a internet fiable sobre el terreno. **Interviewer Classic**, y los protocolos que no usan ese tipo de interfaces, funcionan completamente sin conexión.

## Comparación de plataformas {#platform-comparison}

### Tableta Android {#android-tablet}

✅ Muy fáciles de conseguir, también fuera de Occidente y del Norte global.  
✅ Pueden ser muy asequibles.  
👎 A menudo tienen un rendimiento deficiente y ejecutan versiones antiguas de Android.  
👎 Pocos fabricantes de hardware de calidad (Samsung y Huawei).  
👎 Suelen tener pantallas con una relación de aspecto muy panorámica, que no es la ideal para Interviewer.  
👎 En general, no pueden ejecutar otro software de investigación.  
👎 Importar protocolos y gestionar los datos puede resultar difícil.  
👎 El teclado se compra aparte.

### Chromebook {#chromebook}

✅ Los dispositivos suelen incluir tanto pantalla táctil como teclado.  
✅ Pueden ser muy asequibles, aunque también se pueden configurar con hardware más potente.  
✅ Formato fácil de transportar, parecido al de un ordenador portátil o una tableta con teclado.  
✅ Suelen usar la versión más reciente de Android.  
👎 Algunos modelos rinden mal al ejecutar aplicaciones de Android.  
👎 No todos los modelos pueden ejecutar aplicaciones de Android.  
👎 En general, no pueden ejecutar otro software de investigación.

### iPad {#ipad}

✅ Extremadamente potentes en cuanto a GPU y CPU, con pantallas de gran calidad.  
✅ Posiblemente más aceptables en determinados entornos.  
⛔️ **Por lo general, ya no es una opción disponible debido a la situación con la revisión de la App Store de Apple.**  
👎 Importar protocolos y gestionar los datos puede resultar difícil.  
👎 ¡Caros! El teclado se compra aparte.

### Ordenador portátil {#laptop}

✅ Un entorno familiar tanto para el equipo de investigación como para quienes participan.  
✅ Gestionar los protocolos y los datos de las entrevistas es sencillo.  
✅ Puede ejecutar otro software de uso general si hace falta.  
✅ Fácil de adquirir a través de los procesos de compra del departamento de informática.  
👎 Puede resultar menos cómodo de transportar y tener menos autonomía de batería.  
👎 Las pantallas de mayor calidad son más caras.

## Recomendación general {#overall-recommendation}

Para la mayoría de quienes usan nuestras herramientas, la mejor opción en conjunto será ejecutar Interviewer en un **ordenador portátil con pantalla táctil de uno de los grandes fabricantes** (Dell, HP, Lenovo, Acer, Asus).

Cuando estos fabricantes ofrezcan distintas configuraciones, da prioridad a la calidad de la pantalla (busca pantallas lo más grandes y luminosas posible, con la máxima resolución), así como al rendimiento de la GPU. Una tarjeta gráfica dedicada ofrecerá el mejor rendimiento, pero las CPU recientes (como las de 11.ª y 12.ª generación de Intel) incluyen gráficos integrados potentes.
