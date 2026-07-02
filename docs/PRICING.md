# Xeyo — Modèle de coûts & Pricing

> Document de travail. Objectif : fixer une grille tarifaire avec **marge brute ≥ x3**
> sur les coûts variables, de quoi financer l'affiliation et les tarifs fondateurs.
>
> ⚠️ Les coûts IA ci-dessous sont des **estimations théoriques**. La table
> `ai_usage_log` (migration `20260702`) mesure désormais le **coût réel par
> feature et par discussion** — à recaler après quelques jours d'usage réel.
> Voir la section « Mesure réelle ».

---

## 1. Unité de facturation

**1 « discussion » = 1 contact unique par mois.**

- Un même client qui écrit 3 fois dans le mois = **1** contact unique = 1 unité.
- Simple à comprendre pour le marchand, et corrélé au coût réel (un contact = une
  suite de messages SAV + éventuelles relances).
- Compteur : nombre de `contacts` distincts ayant au moins une conversation IA
  dans le mois calendaire.

---

## 2. Coûts d'infrastructure (fixes)

| Poste | Coût | Par mois |
|---|---|---|
| VPS (Dokploy, tout-en-un) | 85,97 € / 6 mois | **≈ 14,33 €** |
| Nom de domaine, divers | ~2 €/mois | ~2 € |
| **Total fixe** | | **≈ 16 €/mois** |

Ce coût est **indépendant du nombre de marchands** jusqu'au plafond de capacité
(voir `CAPACITE.md`). Il se dilue vite : à 20 marchands payants, l'infra ≈ 0,80 €
par marchand/mois.

---

## 3. Coûts variables — les tokens IA (par appel OpenAI)

Tarifs OpenAI (USD / 1 M tokens), tels que codés dans `src/lib/openai/usage-log.ts` :

| Modèle | Input | Output |
|---|---|---|
| gpt-4o-mini | 0,15 $ | 0,60 $ |
| gpt-4o | 2,50 $ | 10,00 $ |
| text-embedding-3-small | 0,02 $ | — |
| whisper-1 | 0,006 $/min | — |

### Coût d'UNE discussion (estimation)

Hypothèse : une discussion SAV « moyenne » = **5 messages** échangés, chacun
déclenchant un appel au modèle avec le contexte (historique + prompt système +
éventuel RAG).

**Scénario MIN — SAV simple, sans RAG, historique court (gpt-4o-mini)**
- ~800 tokens input + ~150 output par message × 5 messages
- ≈ 4 000 input + 750 output sur la discussion
- Coût ≈ (4000 × 0,15 + 750 × 0,60) / 1 M = **≈ 0,0011 $ ≈ 0,001 €**

**Scénario MAX — SAV avec RAG + historique long (gpt-4o-mini)**
- Le RAG et l'historique gonflent l'input : ~3 000 tokens input + ~250 output / message
- ≈ 15 000 input + 1 250 output + embeddings requête (~1 500 tokens)
- Coût ≈ (15000 × 0,15 + 1250 × 0,60 + 1500 × 0,02) / 1 M = **≈ 0,0031 $ ≈ 0,003 €**

**Scénario HAUT DE GAMME — même discussion en gpt-4o**
- ≈ 15 000 input + 1 250 output
- Coût ≈ (15000 × 2,50 + 1250 × 10) / 1 M = **≈ 0,0500 $ ≈ 0,046 €**

> 📌 gpt-4o coûte **~15× plus cher** que mini pour la même discussion. D'où le
> choix : mini par défaut, gpt-4o **plafonné** sur le plan haut.

### Coût des autres features (par usage, estimation)

| Feature | Modèle | Coût / usage |
|---|---|---|
| Génération de template | gpt-4o-mini | ~0,001 € |
| Traduction template | gpt-4o-mini | ~0,0005 € |
| Résumé conversation | gpt-4o-mini | ~0,001 € |
| Extraction infos contact | gpt-4o-mini | ~0,001 € |
| Génération d'agent | gpt-4o | ~0,01 € |
| Embedding d'un doc RAG (par 10 pages) | embedding-3-small | ~0,001 € |
| Transcription vocal (whisper) | whisper-1 | ~0,006 €/min |

Ces features sont **occasionnelles** (setup, ponctuel) → coût négligeable vs. le SAV.

---

## 4. Coût total par marchand (estimation)

Coût variable dominé par le SAV. Prenons le scénario **MAX mini** (0,003 €/disc.)
comme base prudente :

| Volume mensuel | Coût IA (mini, max) | Coût IA si gpt-4o | Part infra diluée |
|---|---|---|---|
| 100 discussions | ~0,30 € | ~4,60 € | ~0,80 € |
| 500 discussions | ~1,50 € | ~23,00 € | ~0,80 € |
| 2 000 discussions | ~6,00 € | ~92,00 € | ~0,80 € |

**Enseignement clé :** en gpt-4o-mini, même 2 000 discussions ne coûtent que
~6 €. Le risque de marge vient **uniquement de gpt-4o** → il doit rester plafonné.

---

## 5. Grille tarifaire proposée

| Plan | Prix | Contacts uniques / mois | Modèle IA | Coût variable estimé | Marge brute |
|---|---|---|---|---|---|
| **Free** | 0 € | 0 (IA désactivée) | — | ~0 € | onboarding uniquement |
| **Starter** | 29 € | 100 | gpt-4o-mini | ~0,30 € | **~x96** |
| **Pro** | 89 € | 500 | gpt-4o-mini | ~1,50 € | **~x59** |
| **Scale** | 249 € | « illimité » (fair-use) + gpt-4o plafonné | mini + gpt-4o (cap ~500 disc.) | ~25–30 € | **~x8** |

### Détail des plans

**Free — 0 €**
- **Aucune utilisation IA.** Tout en manuel (inbox, envoi de templates, réponses
  à la main). Seul l'**onboarding** est assisté.
- But : acquisition + upsell. Le marchand goûte au produit, puis passe payant
  pour activer l'IA.

**Starter — 29 €**
- 100 contacts uniques/mois, SAV IA en **gpt-4o-mini**.
- Cible : petites boutiques. Coût réel ~0,30 € → marge énorme, finance
  l'affiliation.

**Pro — 89 €**
- 500 contacts uniques/mois, gpt-4o-mini.
- Cible : boutiques établies. Le sweet-spot.

**Scale — 249 €**
- **« Illimité » avec fair-use** (ce n'est PAS un vrai illimité — protège la marge).
- gpt-4o **inclus mais plafonné** (~500 discussions en gpt-4o, le reste bascule en
  mini automatiquement). Au-delà du fair-use (ex. 3 000 contacts), on discute d'un
  sur-mesure.
- Cible : gros volume / marque premium qui veut le meilleur modèle.

> **Pourquoi « fair-use » et pas « illimité » sec :** une boutique à 10 000
> contacts/mois en gpt-4o coûterait ~460 €/mois d'IA → marge négative. Le fair-use
> + le plafond gpt-4o garantissent qu'on ne vend jamais à perte.

---

## 6. Marges & financement affiliation / fondateurs

- La grille laisse une **marge brute ≥ x3 partout**, très au-delà sur Starter/Pro.
- Cette marge finance :
  - **Affiliation** : reverser 20–30 % du 1er mois (ou récurrent) reste
    largement soutenable sur Starter/Pro (coût ~0,30–1,50 €).
  - **Tarifs fondateurs** : -30 à -50 % à vie pour les early adopters restent
    rentables (Starter fondateur à ~15 € ≈ toujours x40 de marge).
- Le seul plan à surveiller est **Scale** (marge x8) : c'est pour ça que gpt-4o y
  est plafonné et le volume en fair-use.

---

## 7. Mesure réelle (à faire tourner quelques jours)

Le pricing ci-dessus repose sur des **estimations**. La table `ai_usage_log`
enregistre maintenant **chaque appel** (feature, modèle, tokens in/out, coût $).

Après 3–7 jours d'usage réel, lancer ces requêtes (via le tunnel SSH) :

```sql
-- Coût moyen RÉEL par discussion (SAV) sur les 7 derniers jours
SELECT
  count(DISTINCT conversation_id)                    AS discussions,
  round(sum(cost_usd)::numeric, 4)                   AS cout_total_usd,
  round((sum(cost_usd) / NULLIF(count(DISTINCT conversation_id),0))::numeric, 5)
                                                     AS cout_moyen_par_discussion_usd
FROM ai_usage_log
WHERE feature IN ('sav_reply','escalation')
  AND created_at > now() - interval '7 days';

-- Répartition du coût par feature
SELECT feature, model,
       count(*)                          AS appels,
       round(sum(cost_usd)::numeric, 4)  AS cout_usd,
       round(avg(total_tokens)::numeric) AS tokens_moyen
FROM ai_usage_log
WHERE created_at > now() - interval '7 days'
GROUP BY feature, model
ORDER BY cout_usd DESC;

-- MIN vs MAX : distribution du coût par discussion (p50 / p95 / max)
SELECT
  round(percentile_cont(0.5)  WITHIN GROUP (ORDER BY c)::numeric, 5) AS p50_usd,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY c)::numeric, 5) AS p95_usd,
  round(max(c)::numeric, 5)                                          AS max_usd
FROM (
  SELECT conversation_id, sum(cost_usd) AS c
  FROM ai_usage_log
  WHERE feature IN ('sav_reply','escalation')
    AND created_at > now() - interval '7 days'
  GROUP BY conversation_id
) t;
```

**Action après mesure :** remplacer les estimations de la section 3 par les
chiffres réels (p50 = cas moyen, p95 = cas lourd RAG). Si le p95 dépasse
largement 0,003 €/disc. en mini, réévaluer les quotas de chaque plan.

---

## 8. Récapitulatif décisionnel

| Décision | Choix retenu |
|---|---|
| Unité | Contact unique / mois |
| Modèle bas de gamme | gpt-4o-mini |
| Modèle haut de gamme | gpt-4o **plafonné** |
| Illimité | « Illimité fair-use » (jamais vrai illimité) |
| Paliers | 100 / 500 / illimité |
| Marge cible | ≥ x3 (largement dépassé sur Starter/Pro) |
| Free | 0 € sans IA (manuel + onboarding) |
| Prix | Free 0 € · Starter 29 € · Pro 89 € · Scale 249 € |
