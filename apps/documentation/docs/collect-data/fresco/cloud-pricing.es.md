---
title: Precios de los servicios en la nube
date: 8th October 2025
navOrder: 6
wip: false
translatedFrom: d5aea0aa8530dc7f42a20f198982c7bef95238af
---

Puedes implementar Fresco de forma totalmente gratuita usando los planes gratuitos de cada servicio. Si lo necesitas, puedes pasar a un plan superior en cualquiera de ellos.

## Netlify {#netlify}

- **Plan gratuito**: el plan gratuito de Netlify ofrece funciones suficientes para implementaciones a pequeña escala.

- **Opción de ampliación**: si tu proyecto crece o necesitas funciones adicionales, Netlify ofrece planes de pago individuales y para equipos.

Para consultar los planes y precios actuales, visita la [página de precios](https://www.netlify.com/pricing) de Netlify (en inglés).

## Neon {#neon}

- **Plan gratuito**: el plan gratuito de Neon incluye una pequeña cantidad de almacenamiento y de capacidad de cómputo, suficiente para proyectos a pequeña escala.

- **Opción de ampliación**: si necesitas más almacenamiento o más horas de cómputo, Neon ofrece planes de pago con límites más altos.

Para consultar los planes y precios actuales, visita la [página de precios](https://neon.com/pricing) de Neon (en inglés).

## UploadThing {#uploadthing}

- **Plan gratuito**: el plan gratuito de UploadThing ofrece funciones básicas y una pequeña cantidad de almacenamiento, adecuadas para proyectos pequeños.

- **Opción de ampliación**: si necesitas más almacenamiento o funciones adicionales, UploadThing ofrece planes de pago con más capacidad de almacenamiento.

Para consultar los planes y precios actuales, visita la [página de precios](https://uploadthing.com/pricing) de UploadThing (en inglés).

## Almacenamiento compatible con S3 (alternativa a UploadThing) {#s3-compatible-storage-alternative-to-uploadthing}

En lugar de UploadThing, puedes almacenar los recursos de los protocolos en cualquier bucket compatible con S3. Los costes dependen del proveedor que elijas:

- **AWS S3**: pagas por el almacenamiento, las solicitudes y la transferencia de datos de salida. Consulta la [página de precios de AWS S3](https://aws.amazon.com/s3/pricing/) (en inglés).
- **Cloudflare R2**: compatible con S3 y sin tarifas por transferencia de datos de salida; pagas por el almacenamiento y las solicitudes. Consulta la [página de precios de R2](https://developers.cloudflare.com/r2/pricing/) (en inglés).
- **Backblaze B2**: almacenamiento de bajo coste con una API compatible con S3. Consulta la [página de precios de B2](https://www.backblaze.com/cloud-storage/pricing) (en inglés).
- **MinIO en alojamiento propio**: sin tarifas de servicio; solo pagas la infraestructura en la que lo ejecutas.

Para ver los pasos de configuración, consulta [Configurar el almacenamiento](./guide#configure-storage) en la guía de implementación.
