# Plan d'implémentation — Campagnes de relance WhatsApp

## Décisions prises

- **Exécution** : Supabase Edge Functions
- **Limites par défaut** : 50 contacts max, 30-120s délai, 20/h
- **Agent relance** : Type séparé (`agent_type = 'relance'`)
- **Notifications** : Dans l'app uniquement

---

## Phase 1 — Migration SQL

### Tables à créer

```sql
-- 1. Ajouter agent_type aux agents existants
ALTER TABLE ai_agents ADD COLUMN agent_type TEXT DEFAULT 'conversation';

-- 2. Table campaigns
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),

  -- Agent IA pour personnalisation (optionnel)
  relance_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,

  -- Message template (si pas d'agent)
  message_template TEXT,

  -- Filtres de ciblage
  filter_session_ids UUID[],
  filter_tracking_sources TEXT[],
  filter_tag_ids UUID[],
  filter_inactivity_days INTEGER,
  filter_exclude_replied BOOLEAN DEFAULT false,

  -- Limites anti-ban
  max_recipients INTEGER DEFAULT 50,
  delay_between_min INTEGER DEFAULT 30,
  delay_between_max INTEGER DEFAULT 120,
  messages_per_hour INTEGER DEFAULT 20,
  send_hour_start INTEGER DEFAULT 9,
  send_hour_end INTEGER DEFAULT 21,
  min_response_rate FLOAT DEFAULT 0.10,
  min_days_since_last_campaign INTEGER DEFAULT 7,

  -- Planification
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  pause_reason TEXT,

  -- Stats
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table campaign_recipients
CREATE TABLE campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,

  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sending', 'sent', 'delivered', 'replied', 'failed', 'skipped')),

  message_sent TEXT,

  queued_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,

  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, contact_id)
);

-- 4. Table campaign_blacklist
CREATE TABLE campaign_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  reason TEXT CHECK (reason IN ('opt_out', 'manual', 'low_engagement', 'complained')),
  keyword_matched TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, contact_id)
);

-- 5. Indexes
CREATE INDEX idx_campaigns_user ON campaigns(user_id);
CREATE INDEX idx_campaigns_team ON campaigns(team_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX idx_campaign_recipients_status ON campaign_recipients(status);
CREATE INDEX idx_campaign_blacklist_user ON campaign_blacklist(user_id);
CREATE INDEX idx_campaign_blacklist_contact ON campaign_blacklist(contact_id);

-- 6. RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_blacklist ENABLE ROW LEVEL SECURITY;

-- Policies campaigns
CREATE POLICY "Users can view own campaigns" ON campaigns FOR SELECT
  USING (user_id = auth.uid() OR team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid() AND status = 'accepted'
  ));

CREATE POLICY "Users can manage own campaigns" ON campaigns FOR ALL
  USING (user_id = auth.uid());

-- Policies recipients
CREATE POLICY "Users can view campaign recipients" ON campaign_recipients FOR SELECT
  USING (campaign_id IN (
    SELECT id FROM campaigns WHERE user_id = auth.uid() OR team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid() AND status = 'accepted'
    )
  ));

-- Policies blacklist
CREATE POLICY "Users can manage own blacklist" ON campaign_blacklist FOR ALL
  USING (user_id = auth.uid());
```

---

## Phase 2 — Types TypeScript

```typescript
// src/types/database.ts

export type Campaign = {
  id: string
  user_id: string
  team_id: string | null
  name: string
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled'
  relance_agent_id: string | null
  message_template: string | null
  filter_session_ids: string[] | null
  filter_tracking_sources: string[] | null
  filter_tag_ids: string[] | null
  filter_inactivity_days: number | null
  filter_exclude_replied: boolean
  max_recipients: number
  delay_between_min: number
  delay_between_max: number
  messages_per_hour: number
  send_hour_start: number
  send_hour_end: number
  min_response_rate: number
  min_days_since_last_campaign: number
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  paused_at: string | null
  pause_reason: string | null
  total_recipients: number
  sent_count: number
  delivered_count: number
  replied_count: number
  failed_count: number
  created_at: string
  updated_at: string
}

export type CampaignRecipient = {
  id: string
  campaign_id: string
  contact_id: string
  conversation_id: string | null
  session_id: string
  status: 'pending' | 'queued' | 'sending' | 'sent' | 'delivered' | 'replied' | 'failed' | 'skipped'
  message_sent: string | null
  queued_at: string
  sent_at: string | null
  delivered_at: string | null
  replied_at: string | null
  error_message: string | null
  created_at: string
}

export type CampaignBlacklist = {
  id: string
  user_id: string
  contact_id: string
  session_id: string
  reason: 'opt_out' | 'manual' | 'low_engagement' | 'complained'
  keyword_matched: string | null
  created_at: string
}
```

---

## Phase 3 — API Endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/campaigns` | GET | Liste des campagnes |
| `/api/campaigns` | POST | Créer campagne |
| `/api/campaigns/[id]` | GET | Détail campagne |
| `/api/campaigns/[id]` | PATCH | Modifier campagne |
| `/api/campaigns/[id]` | DELETE | Supprimer campagne |
| `/api/campaigns/[id]/preview` | POST | Prévisualiser contacts ciblés |
| `/api/campaigns/[id]/start` | POST | Lancer campagne |
| `/api/campaigns/[id]/pause` | POST | Mettre en pause |
| `/api/campaigns/[id]/resume` | POST | Reprendre |
| `/api/campaigns/[id]/cancel` | POST | Annuler |
| `/api/campaigns/[id]/recipients` | GET | Liste destinataires |
| `/api/blacklist` | GET | Liste blacklist |
| `/api/blacklist` | POST | Ajouter contact |
| `/api/blacklist/[contactId]` | DELETE | Retirer contact |

---

## Phase 4 — UI Pages

```
/campaigns                     -- Liste campagnes (cards avec stats)
/campaigns/new                 -- Création wizard
/campaigns/[id]                -- Détail + stats temps réel
/campaigns/[id]/edit           -- Modification (si draft)

/agents (existant)             -- Ajouter onglet/filtre "Relance"
```

### Composants UI

- `CampaignCard` — Carte avec nom, status, stats
- `CampaignFilters` — Formulaire de filtres
- `CampaignLimits` — Configuration limites anti-ban
- `CampaignPreview` — Liste contacts prévisualisés
- `CampaignStats` — Dashboard stats campagne
- `RecipientsList` — Table des destinataires

---

## Phase 5 — Supabase Edge Function

```typescript
// supabase/functions/process-campaign/index.ts

// Déclenchée par:
// 1. Appel API POST /api/campaigns/[id]/start
// 2. Cron toutes les minutes pour campagnes scheduled

// Workflow:
// 1. Récupérer campagne et recipients pending
// 2. Vérifier heure autorisée
// 3. Pour chaque recipient (avec délai):
//    a. Générer message (IA ou template)
//    b. Envoyer via Evolution API
//    c. Mettre à jour status
// 4. Calculer taux réponse après chaque batch
// 5. Pause si taux < min_response_rate
// 6. Marquer completed quand tous envoyés
```

---

## Phase 6 — Stats Dashboard

### Nouvelles stats à ajouter

- **Campagnes** : Total, actives, terminées
- **Messages relance** : Envoyés, délivrés, réponses
- **Taux conversion** : % réponses sur relances
- **Blacklist** : Contacts exclus

### Modifications `/api/stats`

Ajouter:
```typescript
campaigns: {
  total: number
  active: number
  completed: number
  messages_sent: number
  messages_replied: number
  response_rate: number
}
```

---

## Phase 7 — Détection opt-out

### Keywords à détecter (webhook entrant)

```typescript
const OPT_OUT_KEYWORDS = [
  'stop', 'arrêter', 'arreter', 'désabonner', 'desabonner',
  'unsubscribe', 'ne plus recevoir', 'spam', 'harcèlement'
]
```

### Action

1. Si message entrant contient keyword → ajouter à blacklist
2. Réponse auto : "Vous avez été désabonné des messages automatiques."
3. Marquer recipient comme `skipped` si campagne en cours

---

## Ordre d'exécution

| # | Tâche | Fichiers |
|---|-------|----------|
| 1 | Migration SQL | `supabase/migration_campaigns.sql` |
| 2 | Types TypeScript | `src/types/database.ts` |
| 3 | API CRUD campagnes | `src/app/api/campaigns/` |
| 4 | API preview | `src/app/api/campaigns/[id]/preview/` |
| 5 | UI liste campagnes | `src/app/(dashboard)/campaigns/page.tsx` |
| 6 | UI création campagne | `src/app/(dashboard)/campaigns/new/page.tsx` |
| 7 | UI détail campagne | `src/app/(dashboard)/campaigns/[id]/page.tsx` |
| 8 | Agent type relance | Modifier `src/app/api/agents/` + UI |
| 9 | Edge Function exécution | `supabase/functions/process-campaign/` |
| 10 | API start/pause/resume | `src/app/api/campaigns/[id]/start,pause,resume/` |
| 11 | Blacklist API + UI | `src/app/api/blacklist/` |
| 12 | Détection opt-out | Modifier webhook Evolution |
| 13 | Stats campagnes | Modifier `src/app/api/stats/` + UI |
| 14 | Navigation | Ajouter lien sidebar |
| 15 | Tests + build | `npm run build` |

---

## Estimation

- **Phase 1-3** (SQL + Types + API CRUD) : Fondations
- **Phase 4-7** (UI + Edge Function) : Core feature
- **Phase 8-14** (Finitions) : Polish

On commence ?
