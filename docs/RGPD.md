# Conformité RGPD — Xeyo

> Ce que Xeyo fait des données personnelles, et comment. Ce document répond aux
> questions du formulaire **Protected Customer Data** de Shopify — chaque « Oui »
> déclaré doit être vérifiable ici.
>
> Complète [`SHOPIFY_COMPLIANCE.md`](SHOPIFY_COMPLIANCE.md) (exigences App Store) et
> [`SECURITY_INCIDENT_POLICY.md`](SECURITY_INCIDENT_POLICY.md) (réponse aux incidents).
>
> Dernière vérification contre le code : **13 juillet 2026**.

---

## 0. Les quatre obligations, et où elles sont traitées

On confond souvent ces quatre choses. Elles sont distinctes, et Shopify les
interroge séparément :

| Obligation | Article | Ce que c'est | Où |
|---|---|---|---|
| **Minimisation** | 5.1.c | Ne demander que les données nécessaires | §1 |
| **Limitation de conservation** | 5.1.e | Ne pas garder les données trop longtemps, **automatiquement** | §2 |
| **Droit à l'effacement** | 17 | Supprimer **sur demande** | §3 |
| **Traçabilité & sécurité** | 30, 32 | Savoir qui a accédé à quoi ; chiffrer | §4, §5 |

La confusion la plus coûteuse : **rétention ≠ effacement**. Un webhook
`customers/redact` qui marche ne suffit pas — il faut *aussi* que les données
disparaissent d'elles-mêmes au bout d'un délai, sans que personne ne le demande.

---

## 1. Données traitées (minimisation)

Pour chaque client final d'un marchand :

| Donnée | Pourquoi elle est indispensable |
|---|---|
| **Téléphone** | C'est l'identifiant WhatsApp. Sans lui, l'app ne fait littéralement rien. |
| **Nom** | Personnalisation des messages, affichage dans l'inbox du marchand. |
| **E-mail** | Jointure client Shopify ↔ contact WhatsApp ; clé des webhooks RGPD. |
| **Conversations** | Le service lui-même (SAV, suivi de commande). |

**L'adresse postale n'est PAS collectée.** Des champs `shippingAddress` /
`billingAddress` sont bien lus côté Shopify, mais on n'en extrait que `phone` et
`countryCodeV2` — jamais la rue ni la ville. C'est pourquoi le champ « Adresse »
n'est pas demandé dans le formulaire Protected Customer Data : réclamer un champ
inutilisé est sanctionné à la review.

Côté marchand : jetons d'accès **Shopify** et **WhatsApp Business (WABA)**.

**Rôles** : le marchand est *responsable de traitement*, Xeyo est *sous-traitant*.

---

## 2. Rétention — la purge automatique (art. 5.1.e)

**Réglage** : `/admin` → Paramètres généraux → **Conservation des données**.

| Réglage | Défaut | Table `platform_settings` |
|---|---|---|
| Messages | **730 j** (24 mois) | `message_retention_days` |
| Logs techniques | **90 j** | `log_retention_days` |

`0` = conservation illimitée (purge désactivée). **C'est le repli délibéré** :
aucun déploiement ne doit se mettre à effacer des données sans décision explicite.

**Purge** : `GET /api/cron/run-retention` (Bearer `CRON_SECRET`), par lots de 1000
pour ne pas tenir un verrou trop longtemps sur les plus grosses tables.

### Deux décisions de conception à connaître

**Les contacts ne sont jamais purgés.** Supprimer un contact opt-in détruirait son
consentement WhatsApp et le sortirait des automatisations : ce serait une
régression fonctionnelle déguisée en conformité. On purge **l'historique des
échanges**, pas la relation commerciale. Le consentement, lui, s'efface sur demande
(§3) ou au désabonnement.

**Verrou 24 h** (`retention_last_run_at`). La route est branchée sur
l'ordonnanceur qui tourne **chaque minute**. Sans ce garde, on scannerait
`messages` et `webhook_logs` 1440 fois par jour pour n'effacer que quelques lignes.
Un échec **ne réarme pas** le verrou : le tick suivant réessaie, plutôt que
d'attendre 24 h en laissant l'erreur passer inaperçue.

> Index `messages_created_at_idx` et `webhook_logs_created_at_idx` : sans eux, la
> purge ferait un seq scan sur les deux plus grosses tables à chaque passage.

---

## 3. Droit à l'effacement (art. 17)

Assuré par les webhooks RGPD Shopify — voir
[`SHOPIFY_COMPLIANCE.md §2`](SHOPIFY_COMPLIANCE.md).

⚠️ **L'incident à ne jamais reproduire.** `customers/redact` supprimait les contacts
**par téléphone/email sans filtre de boutique** : un effacement demandé par la
boutique A détruisait les contacts de *tous* les marchands ayant ce numéro.
Corrigé — la suppression est désormais scopée
`shop_domain → shopify_stores.user_id → whatsapp_sessions.id → contacts.session_id`.

**Invariant** : toute route qui écrit ou supprime doit passer par le `user_id` de
la boutique. En embedded il n'y a **pas de RLS** (service-role key) — chaque filtre
`user_id` est manuel, et c'est la seule barrière.

---

## 4. Journal d'audit des accès (art. 30 & 32)

Table **`data_access_log`**. Répond à la question qui compte après un incident :
*qui a accédé à quelles données, et quand ?*

⚠️ **Ce n'est pas `webhook_logs`**, qui trace les payloads entrants (du technique).

### Ce qui est journalisé — les accès à volume ou à risque

| Action | Déclencheur |
|---|---|
| `export` | Export CSV des contacts (`/api/contacts/table?format=csv`) ; `customers/data_request` |
| `erasure` | `customers/redact` (avec le **nombre réel** de contacts supprimés) |
| `bulk_read` | Lecture en masse |
| `admin_access` | Un admin Xeyo accède aux données d'un marchand ← le cas le plus sensible |

### Ce qui n'est PAS journalisé — et pourquoi

**L'ouverture d'une conversation par son propriétaire légitime.** Tracer chaque
affichage produirait des millions de lignes sans valeur d'audit, et ferait de
cette table le nouveau goulot d'étranglement de la base.

### Garanties

- **RLS activée** : personne ne lit ni n'écrit ce journal via l'API publique. Seul
  le service role y touche. *Un journal modifiable par ses sujets ne vaut rien.*
- **`logDataAccess()` ne lève jamais** : un journal défaillant ne doit pas faire
  échouer l'action métier qu'il observe. Appelé sans `await` — pas de latence
  ajoutée à une requête utilisateur.
- **Aucune donnée personnelle dans `metadata`** : ce journal survit aux données
  qu'il décrit (il n'est pas soumis à la purge de rétention).
- **Non purgé** par la rétention : un journal d'audit qui s'efface tout seul
  n'aurait aucun sens.

> Corrigé au passage : `customers/data_request` écrivait les contacts (téléphones,
> emails) **en clair dans les logs Docker** via un `console.log`. Ces logs
> échappaient à tout contrôle RGPD — exactement ce que cette demande d'accès est
> censée protéger. Remplacé par une entrée d'audit sans PII.

---

## 5. Chiffrement

| Où | Comment |
|---|---|
| **Messages en base** (au repos) | AES-256-GCM (`src/lib/crypto/encryption.ts`) |
| **En transit** | TLS |
| **Sauvegardes** | AES-256-CBC + PBKDF2 (100 000 itérations) |

### Les backups (`scripts/backup/backup-db.sh`)

Les dumps contiennent numéros de téléphone, conversations et jetons Shopify/WABA :
ils ne doivent jamais reposer en clair, ni sur le VPS ni chez l'hébergeur distant.

Le chiffrement se fait **en flux** (`pg_dump | openssl`) : le dump en clair ne
touche jamais le disque. Le script **refuse de tourner** sans passphrase — mieux
vaut pas de backup qu'un backup en clair — et **vérifie que le fichier produit se
déchiffre** (en-tête `PGDMP`) : un backup qu'on ne sait pas restaurer est un faux
filet de sécurité.

**Installation sur le VPS** :

```bash
openssl rand -base64 48 > /home/ubuntu/.backup-passphrase
chmod 600 /home/ubuntu/.backup-passphrase
```

> 🔑 **Recopie cette passphrase dans ton gestionnaire de mots de passe.**
> Elle n'existe nulle part ailleurs. La perdre rend **tous** les backups
> définitivement irrécupérables — et un VPS détruit emporte la passphrase avec lui,
> ce qui est précisément le scénario contre lequel les backups existent.

**Restaurer** :

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass file:/home/ubuntu/.backup-passphrase \
  -in xeyo_AAAAMMJJ_HHMMSS.dump.enc | \
  docker exec -i <conteneur-db> pg_restore -U supabase_admin -d postgres --clean
```

Le script purge aussi les anciens dumps **en clair** laissés par sa version
précédente : les laisser traîner annulerait tout le bénéfice du chiffrement.

---

## 6. Réponses au formulaire Shopify

| Question | Réponse | Preuve |
|---|---|---|
| Données minimales | Oui | §1 (pas d'adresse) |
| Marchands informés du traitement | Oui | CGU/CGV + politique de confidentialité |
| Usage limité à ces fins | Oui | §1 |
| Accords de confidentialité avec les marchands | Oui | CGU/CGV |
| Décisions de consentement respectées | Oui | `opt_in_status` (popup, checkout) |
| Refus de vente des données respecté | Oui | Aucune donnée n'est vendue |
| Décision automatisée à effet juridique | Sans objet | L'IA répond à des questions (art. 22 non applicable) |
| **Durées de rétention configurées** | **Oui** | §2 |
| Chiffrement au repos et en transit | Oui | §5 |
| **Chiffrement des sauvegardes** | **Oui** | §5 |
| Séparation test / production | Oui | Boutique de dev + app custom séparées |
| Stratégie de prévention contre la perte | Oui | Backups quotidiens + rotation 14 j |
| Accès employés limité | Oui | Structure individuelle |
| Exigences sur les mots de passe | Oui | — |
| **Journal des accès aux données** | **Oui** | §4 |
| **Politique de réponse aux incidents** | **Oui** | [SECURITY_INCIDENT_POLICY.md](SECURITY_INCIDENT_POLICY.md) |
| Certifications tierces | *(vide)* | Pas de SOC2/ISO — ne rien déclarer |

Les quatre lignes en gras étaient « Non » avant le 13 juillet 2026.

---

## 7. Ce qu'il reste à faire

- [ ] **Poser la passphrase sur le VPS** (§5) — sans elle, le script de backup
      s'arrête : **il n'y a plus aucune sauvegarde** tant que ce n'est pas fait.
- [ ] Configurer `RCLONE_REMOTE` — un backup sur le même disque que la base ne
      protège pas d'un crash disque.
- [ ] Régénérer `CRON_SECRET` (il a circulé en clair).
- [ ] Purger les anciens dumps **en clair** déjà présents sur le VPS
      (le script le fait à sa prochaine exécution).
