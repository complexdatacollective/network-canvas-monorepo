---
title: Tarifs des services cloud
date: 8th October 2025
navOrder: 6
wip: false
translatedFrom: d5aea0aa8530dc7f42a20f198982c7bef95238af
---

Il est possible de déployer Fresco entièrement gratuitement en utilisant les offres gratuites de chaque service. Vous pouvez, si vous le souhaitez, passer à une offre supérieure selon vos besoins.

## Netlify {#netlify}

- **Offre gratuite** : l’offre gratuite de Netlify fournit des fonctionnalités suffisantes pour des déploiements à petite échelle.

- **Option de mise à niveau** : si votre projet prend de l’ampleur ou si vous avez besoin de fonctionnalités supplémentaires, Netlify propose des offres payantes pour les particuliers et pour les équipes.

Pour connaître les offres et les tarifs actuels, consultez la [page des tarifs](https://www.netlify.com/pricing) de Netlify (en anglais).

## Neon {#neon}

- **Offre gratuite** : l’offre gratuite de Neon comprend une petite quantité de stockage et de puissance de calcul, suffisante pour des projets à petite échelle.

- **Option de mise à niveau** : si vous avez besoin de davantage de stockage ou d’heures de calcul, Neon propose des offres payantes aux limites plus élevées.

Pour connaître les offres et les tarifs actuels, consultez la [page des tarifs](https://neon.com/pricing) de Neon (en anglais).

## UploadThing {#uploadthing}

- **Offre gratuite** : l’offre gratuite d’UploadThing propose des fonctionnalités de base et une petite quantité de stockage, adaptées aux petits projets.

- **Option de mise à niveau** : si vous avez besoin de davantage de stockage ou de fonctionnalités supplémentaires, UploadThing propose des offres payantes avec des capacités de stockage plus importantes.

Pour connaître les offres et les tarifs actuels, consultez la [page des tarifs](https://uploadthing.com/pricing) d’UploadThing (en anglais).

## Stockage compatible S3 (alternative à UploadThing) {#s3-compatible-storage-alternative-to-uploadthing}

Au lieu d’UploadThing, vous pouvez stocker les ressources des protocoles dans n’importe quel bucket compatible S3. Les coûts dépendent du fournisseur choisi :

- **AWS S3** — vous payez le stockage, les requêtes et le trafic de données sortant. Consultez la [page des tarifs d’AWS S3](https://aws.amazon.com/s3/pricing/) (en anglais).
- **Cloudflare R2** — compatible S3, sans frais de trafic sortant ; vous payez le stockage et les requêtes. Consultez la [page des tarifs de R2](https://developers.cloudflare.com/r2/pricing/) (en anglais).
- **Backblaze B2** — un stockage à faible coût doté d’une API compatible S3. Consultez la [page des tarifs de B2](https://www.backblaze.com/cloud-storage/pricing) (en anglais).
- **MinIO auto-hébergé** — aucuns frais de service ; vous ne payez que l’infrastructure sur laquelle vous l’exécutez.

Pour les étapes de configuration, consultez [Configurer le stockage](./guide#configure-storage) dans le guide de déploiement.
