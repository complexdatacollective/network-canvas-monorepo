---
title: Comités de ética (IRB) y buenas prácticas de seguridad
navOrder: 2
translatedFrom: 1bafff6dc52b2e78d4e08e60d4a0e5ec310adc56
---

Sabemos que la seguridad de los datos es una de las principales preocupaciones de la mayoría de quienes investigan. Network Canvas nació en el contexto de la investigación en salud pública sobre temas sensibles con poblaciones marginadas, y nos hemos basado en nuestra experiencia realizando estudios en este ámbito para orientar nuestro enfoque de la seguridad.

Network Canvas utiliza funciones de seguridad modernas y se apoya en tecnologías existentes y soluciones ampliamente utilizadas. En todas nuestras herramientas, **el equipo de Network Canvas nunca recibe, transmite ni almacena datos de participantes**. No actuamos como responsable del tratamiento ni como encargado del tratamiento: quienes investigan conservan en todo momento el control total de los datos de su estudio y la responsabilidad sobre ellos.

La forma en que se almacenan esos datos, y por tanto las medidas de seguridad que debes aplicar, depende de la herramienta que uses:

- **Aplicaciones locales (Architect, Architect Classic, Interviewer e Interviewer Classic)**. Los datos solo se almacenan en el dispositivo local: en el navegador, en el caso de las versiones de Architect e Interviewer para navegador, o dentro de la aplicación, en el caso de las aplicaciones Classic para ordenador y tableta. La seguridad depende de proteger ese dispositivo.
- **Fresco (aplicación web de alojamiento propio)**. Los datos se almacenan de forma centralizada en una base de datos y un servicio de almacenamiento que implementas y alojas tú. La seguridad depende de proteger esa infraestructura de servidores.

<TipBox>

Esta página resume las buenas prácticas para cada herramienta. Si quieres un análisis completo y detallado del cumplimiento del Reglamento General de Protección de Datos (RGPD), consulta nuestra [Guía de cumplimiento del RGPD](/es/get-started/planning-a-study/gdpr-compliance): incluye las figuras que define el reglamento (responsable y encargado del tratamiento), orientación para comités de ética y departamentos de informática, y una lista de comprobación de seguridad completa.

</TipBox>

## Aplicaciones locales (Architect, Architect Classic, Interviewer e Interviewer Classic) {#local-device-apps-architect-architect-classic-interviewer-and-interviewer-classic}

<TipBox>

**Interviewer Classic** funciona completamente sin conexión. **Interviewer** almacena los datos de las entrevistas en el dispositivo de la misma forma, pero algunas interfaces del esquema 8 (por ejemplo, la [interfaz geoespacial](/es/design-protocols/interface-documentation/geospatial)) necesitan conexión a internet y se comunican con servicios de terceros durante la entrevista. Tenlo en cuenta en tu evaluación de riesgos si las usas.

</TipBox>

Interviewer Classic y Architect Classic son herramientas que funcionan completamente sin conexión y están diseñadas para ejecutarse en dispositivos que controla el equipo de investigación, y la versión de Interviewer para navegador almacena sus datos en el dispositivo de la misma forma. Nuestro enfoque de la seguridad de los datos en estas aplicaciones se centra en la transferencia de datos, ya que partimos de la base de que los dispositivos en los que se ejecutan estarán totalmente bajo el control del equipo de investigación. Esto significa que **la transferencia de datos (exportar datos fuera del dispositivo) es el paso más vulnerable del flujo de trabajo.**

### Almacenamiento de datos {#data-storage}

Los datos que recopilas sobre el terreno son tuyos, y solo se almacenan en tus dispositivos. Nunca recibimos, transmitimos ni almacenamos datos de participantes, y ningún dato de participantes sale del dispositivo a menos que lo exportes manualmente. Interviewer envía datos analíticos opcionales y anónimos sobre el uso y los errores (nunca datos de participantes), que están activados por defecto y se pueden desactivar en cualquier momento en Configuración → Privacidad; Interviewer Classic no envía ninguno. No utilizamos cookies ni ningún otro tipo de identificador de seguimiento en Network Canvas.

### Qué datos se almacenan y dónde {#what-data-is-stored-where}

Al evaluar los riesgos, conviene saber exactamente qué guardan estas aplicaciones en el dispositivo. Cada una almacena tres tipos de datos, y todos deben tratarse como potencialmente sensibles:

- **Protocolos**: además de la estructura de tu entrevista, un protocolo puede incorporar cualquier conjunto de datos necesario para realizarla. Por ejemplo, un estudio en un centro escolar puede incluir una lista predefinida (que se importa como archivo de datos) con los nombres del alumnado de una clase.
- **Datos de sesión**: los datos de las respuestas de cada participante, que pueden incluir información personal sensible (sobre todo en ámbitos como la atención sanitaria), además de metadatos como la fecha en que se realizó una sesión, que pueden revelar dónde se encontraba la persona participante.
- **Configuración y metadatos de la aplicación**: los ajustes de la aplicación y los metadatos de los protocolos, como las preferencias de visualización en Interviewer Classic o el último protocolo editado en Architect Classic.

Dónde se guardan estos datos depende de la generación de la aplicación. Las versiones de **Architect** e **Interviewer** para navegador almacenan sus datos en el almacenamiento local de tu navegador web, en el dispositivo que uses, mientras que **Architect Classic** e **Interviewer Classic** los almacenan dentro de la aplicación, en el dispositivo. En ambos casos, lo que mantiene estos datos a salvo son las protecciones del dispositivo que se describen a continuación: el cifrado del disco, las contraseñas seguras y el bloqueo automático. Para obtener información sobre el almacenamiento y la seguridad de los datos en Fresco, consulta las [preguntas frecuentes sobre Fresco](/es/collect-data/fresco/faq#is-fresco-gdpr-compliant) y el apartado sobre Fresco, más abajo.

### Buenas prácticas de seguridad {#security-best-practices}

Como la responsabilidad del almacenamiento de los datos y de la seguridad de los dispositivos recae en el equipo de investigación, te recomendamos las siguientes buenas prácticas para garantizar la seguridad de los datos de tu estudio con Network Canvas:

- **Activa el cifrado completo del disco (sistema operativo).** Uses la aplicación que uses, activa FileVault (macOS), BitLocker o el cifrado del dispositivo (Windows), o el equivalente de tu plataforma. Interviewer Classic y Architect Classic no cifran los datos que almacenan, así que el cifrado del dispositivo es la única protección de esos datos en reposo. Interviewer, además, cifra los datos que almacena en el dispositivo cuando configuras un bloqueo de la aplicación, con una clave vinculada a la misma autenticación que desbloquea la aplicación. Considéralo una medida de defensa en profundidad, no un sustituto del cifrado del dispositivo.
- **Usa contraseñas o códigos de acceso seguros en los dispositivos.** Aplica controles de acceso de usuario para que, en los sistemas con varias cuentas de usuario, ninguna cuenta pueda acceder a los datos de las demás.
- **Restringe el acceso físico a los dispositivos.** El uso de modos de «quiosco» (o similares), junto con una supervisión completa y constante de la entrevista, impide que quienes participan en la investigación accedan a los datos de la aplicación.
- **Reduce al mínimo el tiempo que los datos del estudio permanecen en los dispositivos de campo.** Subir los datos con la mayor regularidad posible a ubicaciones de almacenamiento seguras designadas, y después eliminarlos de los dispositivos de campo, ayuda a limitar el riesgo de una violación de la seguridad de los datos (por ejemplo, si roban un dispositivo).

## Fresco (aplicación web de alojamiento propio) {#fresco-self-hosted-web-app}

Fresco lleva las entrevistas de Network Canvas al navegador web. Cada participante completa la entrevista visitando una URL, y tú gestionas el estudio desde un panel de administración web protegido con inicio de sesión. Como **los datos se guardan en un servidor accesible a través de internet, y no solo en un dispositivo local**, las consideraciones de seguridad son distintas de las de las aplicaciones de escritorio: importan la seguridad del servidor y de la base de datos, los controles de acceso al panel y las decisiones de alojamiento.

### Almacenamiento de datos {#data-storage-1}

Implementas y alojas Fresco en tu propia infraestructura, y todos los datos de participantes permanecen en todo momento bajo tu control. El equipo de Network Canvas no aloja ningún dato y no es ni responsable ni encargado del tratamiento.

- **Los datos de las entrevistas** se almacenan de forma centralizada en una base de datos **Postgres** (cifrada en reposo si usas proveedores como Neon, que también ofrece regiones de alojamiento en la UE, cifrado en tránsito mediante TLS, copias de seguridad automáticas y contratos de encargo del tratamiento).
- **Los recursos del estudio** (por ejemplo, vídeos de introducción, imágenes, logotipos y archivos de listas) se guardan en un **almacenamiento de objetos compatible con S3**. Puedes usar **UploadThing** (un servicio alojado basado en S3, el más fácil de configurar) o conectar Fresco a cualquier servicio compatible con S3, como **AWS S3, MinIO en alojamiento propio, Cloudflare R2 o Backblaze B2**. El acceso se controla mediante URL firmadas, y, según el servicio, Fresco exige el cifrado del lado del servidor o este viene activado por defecto en el proveedor. Ten en cuenta que Fresco no recopila archivos multimedia subidos por participantes: el almacenamiento de recursos solo contiene materiales que aporta el equipo de investigación.
- **La autenticación del panel** admite varias cuentas de administración, WebAuthn y llaves de acceso (passkeys), autenticación en dos pasos mediante TOTP, códigos de recuperación y limitación de intentos de inicio de sesión. Las URL de las entrevistas de participantes no requieren autenticación y están protegidas porque no se pueden adivinar; si tu comité de ética (IRB) exige una autenticación más estricta de quienes participan, añade una capa externa de inicio de sesión único (SSO) o de un proveedor de identidad (IdP).
- **Es posible un alojamiento conforme al RGPD** si eliges una región de la UE tanto para la base de datos como para el almacenamiento de objetos (un bucket de S3 en la UE, un plan de pago de UploadThing en una región de la UE o una implementación de alojamiento propio dentro de tu jurisdicción).
- **Los datos analíticos** son opcionales y anónimos, y se pueden desactivar en la configuración de Fresco. No incluyen datos de las entrevistas, aunque, mientras están activados, un término de búsqueda del panel puede aparecer en las direcciones de página que envían.
- **Fresco se puede alojar íntegramente en tu infraestructura.** Con un servicio compatible con S3, todos los componentes (la aplicación, Postgres y el almacenamiento de objetos) pueden ejecutarse dentro de tu propia infraestructura, sin ninguna dependencia externa obligatoria. Fresco **no** tiene certificación HIPAA (la ley estadounidense de protección de datos sanitarios): consúltalo con tu equipo de cumplimiento normativo antes de usarlo con datos sujetos a la HIPAA.

### Buenas prácticas de seguridad {#security-best-practices-1}

Como responsable del tratamiento, te corresponde:

- **Establecer una base jurídica** para tratar los datos de participantes.
- **Elegir regiones de alojamiento conformes al RGPD** tanto para tu base de datos Postgres como para tu almacenamiento en UploadThing o S3.
- **Aplicar medidas de seguridad de los datos adecuadas**: usar HTTPS (se aplica automáticamente), mantener actualizadas la plataforma y sus dependencias, usar credenciales seguras y únicas para el panel de administración, permitir el acceso a la base de datos solo desde la aplicación y activar el cifrado en reposo y en tránsito.
- **Mantener políticas de conservación y eliminación de datos**, y hacer copias de seguridad seguras de tu base de datos.
- **Permitir que quienes participan ejerzan sus derechos** (acceso, rectificación y supresión).

<TipBox>

Si estás trabajando con el departamento de informática, el equipo de administración de sistemas o el equipo de seguridad de la información de tu institución en una implementación de Fresco, indícales que consulten las [preguntas frecuentes para departamentos de informática](/es/collect-data/fresco/it-faq), que tratan en detalle los requisitos de infraestructura, el cifrado, la autenticación, el acceso a la red, los registros y la postura de seguridad de la aplicación. Para obtener más información sobre el almacenamiento y la seguridad de los datos en general, consulta las [preguntas frecuentes sobre Fresco](/es/collect-data/fresco/faq#is-fresco-gdpr-compliant). Para obtener una orientación completa y paso a paso sobre el cumplimiento normativo, consulta la [Guía de cumplimiento del RGPD](/es/get-started/planning-a-study/gdpr-compliance).

</TipBox>
