# Politique de réponse aux incidents de sécurité — Xeyo

**Entité responsable** : TOURAILLE-TRAN Julian (Autyvia), éditeur de Xeyo
**Contact sécurité** : contact@autyvia.fr
**Dernière mise à jour** : 2026-06-11

Cette politique décrit comment Xeyo détecte, gère et notifie les incidents de
sécurité affectant les données personnelles des marchands et de leurs clients.
Elle répond aux exigences du RGPD (art. 33/34) et de Shopify.

---

## 1. Qu'est-ce qu'un incident de sécurité ?

Tout événement compromettant la confidentialité, l'intégrité ou la
disponibilité des données, notamment :
- accès non autorisé à la base de données ou aux comptes,
- fuite ou exfiltration de données personnelles (téléphone, email, contenus),
- compromission d'un secret (token API, clé de chiffrement, mot de passe),
- indisponibilité majeure (perte de données, ransomware),
- vulnérabilité exploitée dans le code ou l'infrastructure.

---

## 2. Détection

- **Logs** : Supabase/PostgreSQL (requêtes), Docker/Dokploy (conteneurs), routes
  API applicatives. Surveillance des erreurs et des accès anormaux.
- **Alertes** : surveillance des échecs d'authentification, des pics d'accès,
  des erreurs serveur.
- **Signalement** : toute personne (interne ou marchand) peut signaler un
  incident à **contact@autyvia.fr**.

---

## 3. Procédure de réponse (étapes)

### Étape 1 — Qualification (immédiate)
Évaluer la nature, l'étendue et la gravité de l'incident. Déterminer si des
données personnelles sont concernées.

### Étape 2 — Confinement (< quelques heures)
- Isoler la source (révoquer un token compromis, couper un accès, bloquer une IP).
- Faire pivoter les secrets exposés (clés API, JWT, mots de passe).
- Empêcher la propagation.

### Étape 3 — Éradication & restauration
- Corriger la faille (patch, mise à jour, correctif de configuration).
- Restaurer depuis une sauvegarde saine si nécessaire.
- Vérifier l'intégrité des données.

### Étape 4 — Notification
- **Marchands concernés** : informés sans délai injustifié par email.
- **Autorité (CNIL)** : en cas de violation de données personnelles présentant
  un risque, notification **sous 72h** après en avoir pris connaissance (RGPD art. 33).
- **Personnes concernées** : si risque élevé pour leurs droits et libertés,
  information directe (RGPD art. 34).
- **Shopify** : notification via les canaux partenaires si l'incident touche des
  données issues de l'API Shopify.

### Étape 5 — Post-mortem
Documenter l'incident (cause, impact, actions), tirer les leçons et renforcer
les mesures pour éviter la récurrence.

---

## 4. Mesures préventives en place

- **Chiffrement** : données sensibles chiffrées au repos (AES-256-GCM pour les
  tokens/messages) et en transit (HTTPS/TLS partout).
- **Secrets** : stockés en variables d'environnement (jamais dans le code/git),
  `.env` gitignoré.
- **Accès minimal** : seul l'éditeur a accès à l'infrastructure de production ;
  accès protégé par mots de passe forts et SSH.
- **RLS** : Row Level Security activé sur les tables sensibles (Supabase).
- **Sauvegardes** : sauvegardes régulières et chiffrées de la base.
- **Données minimales** : collecte limitée à ce qui est nécessaire au service.
- **Conformité opt-in** : aucun message envoyé sans consentement (Meta/RGPD).

---

## 5. Rétention et suppression

- Les données ne sont pas conservées plus longtemps que nécessaire.
- Suppression sur demande via les webhooks RGPD Shopify
  (`customers/redact`, `shop/redact`) et la page de suppression de compte.

---

## 6. Révision

Cette politique est revue au moins une fois par an et après tout incident majeur.
