# Politique de réponse aux incidents de sécurité — Xeyo

> Engagement opérationnel de Xeyo (Autyvia) en cas de violation de données
> personnelles. Requis par le RGPD (art. 33 & 34) et déclaré à Shopify dans le
> formulaire *Protected Customer Data* (« Avez-vous une politique de réponse aux
> incidents de sécurité ? » → **Oui**).
>
> Dernière mise à jour : 13 juillet 2026.

---

## 1. Périmètre

Les données personnelles traitées par Xeyo sont, pour chaque client final d'un
marchand : **numéro de téléphone**, **nom**, **e-mail**, et le **contenu des
conversations WhatsApp**. S'y ajoutent, côté marchand, les **jetons d'accès
Shopify** et les **jetons WhatsApp Business (WABA)**.

**Rôles RGPD** : le marchand est *responsable de traitement*, Xeyo est
*sous-traitant*. Xeyo notifie donc le marchand, qui reste responsable de la
notification aux personnes concernées et à son autorité de contrôle.

**Est un incident** au sens de ce document : tout accès, divulgation, altération
ou perte — avérés ou raisonnablement suspectés — de ces données. Un doute
sérieux se traite comme un incident jusqu'à preuve du contraire.

---

## 2. Niveaux de gravité

| Niveau | Définition | Exemples |
|---|---|---|
| **P1 — Critique** | Données personnelles exposées ou exfiltrées ; secret de production compromis. | Fuite de la `SUPABASE_SERVICE_ROLE_KEY`, accès non autorisé à la base, jeton WABA d'un marchand divulgué. |
| **P2 — Élevé** | Vulnérabilité exploitable donnant accès à des données, sans preuve d'exploitation. | Faille d'autorisation permettant de lire les contacts d'un autre marchand. |
| **P3 — Modéré** | Faiblesse sans accès direct aux données personnelles. | Fuite d'une donnée non personnelle, absence de rate limit, dépendance vulnérable non exploitée. |

> Le bug historique du webhook `customers/redact` (suppression de contacts
> **cross-tenant**, corrigé en juillet 2026) aurait été un **P1** : perte de
> données affectant plusieurs marchands.

---

## 3. Délais d'engagement

| Étape | Délai |
|---|---|
| Prise en compte d'un signalement | **24 h** |
| Confinement d'un P1 | **Immédiat**, avant toute autre action |
| Notification aux marchands affectés (P1/P2 avec données touchées) | **≤ 72 h** après avoir eu connaissance de la violation |
| Rapport post-incident écrit | **≤ 14 jours** |

Le délai de 72 h est celui de l'article 33 du RGPD. Il court à partir du moment
où l'on **a connaissance** de la violation, pas de celui où elle s'est produite.

---

## 4. Procédure

### Étape 1 — Confiner (priorité absolue)

Arrêter l'hémorragie avant de comprendre. Selon la nature de l'incident :

- **Secret compromis** → le faire pivoter immédiatement. `SHOPIFY_API_SECRET` se
  régénère dans le Dev Dashboard (« Faire pivoter ») ; les clés Supabase et
  `MESSAGE_ENCRYPTION_KEY` côté Dokploy ; les jetons WABA côté Meta.
- **Accès non autorisé à la base** → couper l'accès réseau au conteneur Postgres,
  révoquer les sessions actives.
- **Faille applicative** → désactiver la route ou la fonctionnalité concernée
  (quitte à dégrader le service) plutôt que de la laisser exploitable.

⚠️ **Ne rien détruire.** Les logs et les traces sont la seule matière de
l'enquête — et une purge de rétention mal réglée peut les effacer. Suspendre
`/api/cron/run-retention` le temps de l'investigation.

### Étape 2 — Évaluer

Répondre par écrit, dès le départ, à ces questions :

- Quelles **données** ont été touchées ? (téléphones, conversations, jetons ?)
- Quels **marchands** ? (toujours vérifier si le périmètre est un tenant ou tous)
- Combien de **personnes concernées** ?
- L'accès a-t-il été **effectif** (données lues/exfiltrées) ou seulement **possible** ?
- **Depuis quand** ? Jusqu'à quand ?

Sources : `webhook_logs`, les logs applicatifs Dokploy, les logs Postgres, l'historique git.

### Étape 3 — Notifier

**Aux marchands affectés (≤ 72 h)** — par e-mail, en nommant les faits :
ce qui s'est passé, quelles données de *leurs* clients sont concernées, ce qui a
été fait, ce qu'ils doivent faire de leur côté. Le marchand étant responsable de
traitement, il lui appartient de notifier ses clients et la CNIL ; Xeyo lui
fournit tous les éléments nécessaires pour le faire.

**À Shopify** — si des données Shopify (jetons, données client protégées) sont
touchées, via le Partner Dashboard.

**À Meta** — si un jeton WABA est compromis.

Ne jamais minimiser ni retarder une notification pour « voir si ça se reproduit ».

### Étape 4 — Corriger et rapporter

Correction déployée, puis rapport écrit sous 14 jours : chronologie, cause
racine, périmètre réel, correctif, et **mesure de prévention** — la question qui
compte étant *« qu'est-ce qui aurait dû rendre cet incident impossible ? »*.

---

## 5. Signaler une vulnérabilité

**security@xeyo.io** (ou le contact support de la fiche App Store).

Nous nous engageons à accuser réception sous 24 h, à ne pas poursuivre un
chercheur agissant de bonne foi, et à le tenir informé jusqu'à la correction.

Merci d'inclure : les étapes de reproduction, l'impact estimé, et de ne pas
accéder à des données réelles au-delà de ce qui prouve la faille.

---

## 6. Mesures préventives en place

| Mesure | État |
|---|---|
| Chiffrement des messages au repos (AES-256-GCM) | ✅ |
| Chiffrement en transit (TLS) | ✅ |
| Vérification HMAC de tous les webhooks (Shopify, Meta) | ✅ |
| Vérification des session tokens Shopify (signature, `aud`, `exp`) | ✅ |
| Isolation par tenant (`user_id` explicite ; pas de RLS en embedded) | ✅ |
| Rétention limitée + purge automatique (art. 5.1.e) | ✅ |
| Backups quotidiens hors VPS | ✅ |
| Chiffrement des backups (AES-256 + PBKDF2) | ✅ |
| Journal d'audit des accès aux données personnelles | ✅ |

Détail de ces mesures : [`RGPD.md`](RGPD.md).

⚠️ Le chiffrement des backups exige une **passphrase posée sur le VPS**
(`/home/ubuntu/.backup-passphrase`) : sans elle, le script s'arrête et il n'y a
plus aucune sauvegarde. Voir [`RGPD.md §5`](RGPD.md).
