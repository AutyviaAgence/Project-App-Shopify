'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { createAgentFromConfig } from '@/lib/agents/create-from-config'
import { BlobLoader } from '@/components/blob-loader'
import { AgentTestChat } from '@/components/agent-test-chat'
import {
  X, ArrowRight, ArrowLeft, Sparkles, Settings2, Check,
  Headset, ShoppingBag, CalendarCheck, Megaphone, Filter,
  MessageSquare,
} from 'lucide-react'

// ─── Données du questionnaire ─────────────────────────────────────────────────

type AgentType = 'conversation' | 'relance' | 'qualifier'

const ROLES: { id: string; label: string; desc: string; icon: React.ComponentType<{ className?: string }>; agentType: AgentType }[] = [
  { id: 'secretary', label: 'Remplacer une secrétaire', desc: 'Répond, oriente, prend les demandes', icon: Headset, agentType: 'conversation' },
  { id: 'sav',       label: 'Support client (SAV)',     desc: 'Aide et résout les problèmes',         icon: Headset, agentType: 'conversation' },
  { id: 'sales',     label: 'Vendeur',                  desc: 'Conseille et pousse à l\'achat',        icon: ShoppingBag, agentType: 'conversation' },
  { id: 'booking',   label: 'Prise de rendez-vous',     desc: 'Propose et cale des créneaux',          icon: CalendarCheck, agentType: 'conversation' },
]

const SECTORS = [
  { id: 'restaurant', label: 'Restauration', emoji: '🍽️' },
  { id: 'beaute',     label: 'Beauté / Coiffure', emoji: '💇' },
  { id: 'ecommerce',  label: 'E-commerce', emoji: '🛍️' },
  { id: 'sante',      label: 'Santé / Bien-être', emoji: '🩺' },
  { id: 'immobilier', label: 'Immobilier', emoji: '🏠' },
  { id: 'service',    label: 'Services / Conseil', emoji: '💼' },
  { id: 'education',  label: 'Éducation / Coaching', emoji: '🎓' },
  { id: 'autre',      label: 'Autre', emoji: '✨' },
]

const TONES = [
  { id: 'professional', label: 'Professionnel', emoji: '👔' },
  { id: 'friendly',     label: 'Chaleureux',    emoji: '😊' },
  { id: 'casual',       label: 'Décontracté',   emoji: '😎' },
]
const EMOJIS = [
  { id: 'never',     label: 'Jamais' },
  { id: 'sometimes', label: 'Parfois' },
  { id: 'often',     label: 'Souvent' },
]
const LENGTHS = [
  { id: 'short',  label: 'Courtes' },
  { id: 'medium', label: 'Moyennes' },
  { id: 'long',   label: 'Détaillées' },
]
const HOURS = [
  { id: '24/7',     label: '24h/24, 7j/7' },
  { id: 'business', label: 'Heures de bureau (9h-18h)' },
  { id: 'custom',   label: 'Variable / à préciser' },
]
const ESCALATION = [
  { id: 'always',  label: 'Oui, dès que le client le demande' },
  { id: 'complex', label: 'Seulement pour les cas complexes' },
  { id: 'none',    label: 'Non, l\'agent gère tout seul' },
]
const LANGUAGES = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'Anglais' },
  { id: 'es', label: 'Espagnol' },
  { id: 'ar', label: 'Arabe' },
  { id: 'pt', label: 'Portugais' },
  { id: 'de', label: 'Allemand' },
]

type Answers = {
  role?: string
  agentType?: AgentType
  sector?: string
  agentName?: string
  tone?: string
  emojis?: string
  length?: string
  hours?: string
  services?: string
  languages?: string
  collect?: string
  example?: string
  escalation?: string
  bookingUrl?: string
}

// Écrans de la state machine
type Screen =
  | 'level' | 'welcome'
  | 'role' | 'sector' | 'name'
  | 't-tone' | 'tone' | 'emojis' | 'length'
  | 't-business' | 'hours' | 'services' | 'languages' | 'collect' | 'example'
  | 't-rules' | 'escalation' | 'booking'
  | 'generating' | 'done'

// Ordre des écrans "à compter" pour la barre de progression (hors transitions/level)
const FLOW: Screen[] = ['role', 'sector', 'name', 'tone', 'emojis', 'length', 'hours', 'services', 'languages', 'collect', 'example', 'escalation', 'booking']

export default function NewAgentPage() {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>('level')
  const [answers, setAnswers] = useState<Answers>({})
  const [error, setError] = useState<string | null>(null)
  const [createdAgent, setCreatedAgent] = useState<{ id: string; name: string } | null>(null)
  const [testOpen, setTestOpen] = useState(false)

  const set = (patch: Partial<Answers>) => setAnswers(a => ({ ...a, ...patch }))
  const close = () => router.push('/agents')

  const progress = (() => {
    const i = FLOW.indexOf(screen as Screen)
    return i < 0 ? 0 : Math.round(((i + 1) / FLOW.length) * 100)
  })()

  async function handleGenerate() {
    setScreen('generating')
    setError(null)
    try {
      const genRes = await fetch('/api/agents/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const genJson = await genRes.json()
      if (!genRes.ok || !genJson.data) {
        setError(genJson.error || 'Erreur lors de la génération')
        setScreen('booking')
        toast.error(genJson.error || 'Erreur lors de la génération')
        return
      }
      const { config, ragContent } = genJson.data
      const result = await createAgentFromConfig({ ...config, ragContent })
      if (!result.ok) {
        setError(result.error)
        setScreen('booking')
        toast.error(result.error)
        return
      }
      setCreatedAgent(result.agent)
      setScreen('done')
    } catch {
      setError('Erreur réseau')
      setScreen('booking')
      toast.error('Erreur réseau')
    }
  }

  // "Je suis a l'aise" : cree un agent vierge et ouvre sa page de config complete
  const [creatingManual, setCreatingManual] = useState(false)
  async function handleManual() {
    if (creatingManual) return
    setCreatingManual(true)
    try {
      const result = await createAgentFromConfig({
        name: 'Nouvel agent',
        system_prompt: 'Tu es un assistant qui répond aux clients sur WhatsApp.',
        agent_type: 'conversation',
      })
      if (result.ok) {
        router.push(`/agents/${result.agent.id}`)
      } else {
        toast.error(result.error)
        setCreatingManual(false)
      }
    } catch {
      toast.error('Erreur réseau')
      setCreatingManual(false)
    }
  }

  return (
    <div className="relative flex min-h-[calc(100vh-1px)] flex-col overflow-hidden bg-background">
      {/* Fond d'ambiance dégradé */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[700px] w-[1000px] -translate-x-1/2 rounded-full opacity-[0.12] blur-[130px]"
          style={{ background: 'radial-gradient(circle, #a855f7 0%, #ec4899 45%, transparent 70%)' }} />
      </div>

      {/* Header : retour + progression */}
      <header className="flex items-center gap-4 px-6 py-5">
        <button onClick={close} className="flex h-10 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" /> Retour
        </button>
        {FLOW.includes(screen as Screen) && (
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #a855f7, #ec4899)' }} />
          </div>
        )}
      </header>

      {/* Contenu centré */}
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 pb-10">
        <div className="w-full max-w-xl">

          {/* ─── Niveau ─── */}
          {screen === 'level' && (
            <Step title="Créons ton agent IA" subtitle="Tu préfères être guidé ou tout configurer toi-même ?">
              <div className="space-y-3">
                <BigCard
                  icon={<Sparkles className="h-5 w-5" />}
                  title="Je débute"
                  desc="On te pose quelques questions et on crée l'agent pour toi."
                  onClick={() => setScreen('welcome')}
                  highlight
                />
                <BigCard
                  icon={<Settings2 className="h-5 w-5" />}
                  title="Je suis à l'aise"
                  desc="Accès direct à la configuration manuelle complète."
                  onClick={handleManual}
                />
              </div>
            </Step>
          )}

          {/* ─── Transition d'accueil ─── */}
          {screen === 'welcome' && (
            <Transition
              text="On est contents que tu sois là. On va te créer un agent qui répond à tous tes clients en quelques secondes."
              onNext={() => setScreen('role')}
            />
          )}

          {/* ─── Rôle ─── */}
          {screen === 'role' && (
            <Step title="Que doit faire ton agent ?" subtitle="Choisis sa mission principale.">
              <div className="grid gap-3 sm:grid-cols-2">
                {ROLES.map(r => (
                  <OptionCard
                    key={r.id}
                    selected={answers.role === r.id}
                    onClick={() => { set({ role: r.label, agentType: r.agentType }); setScreen('sector') }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-fuchsia-400">
                        <r.icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{r.label}</p>
                        <p className="text-xs text-muted-foreground">{r.desc}</p>
                      </div>
                    </div>
                  </OptionCard>
                ))}
              </div>
            </Step>
          )}

          {/* ─── Secteur ─── */}
          {screen === 'sector' && (
            <Step title="Dans quel secteur ?" subtitle="Pour adapter le ton et le vocabulaire." onBack={() => setScreen('role')}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                {SECTORS.map(s => (
                  <OptionCard key={s.id} selected={answers.sector === s.label}
                    onClick={() => { set({ sector: s.label }); setScreen('name') }}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{s.emoji}</span>
                      <p className="text-sm font-semibold">{s.label}</p>
                    </div>
                  </OptionCard>
                ))}
              </div>
            </Step>
          )}

          {/* ─── Nom ─── */}
          {screen === 'name' && (
            <Step title="Comment s'appelle ton agent ?" subtitle="Tu pourras le changer plus tard." onBack={() => setScreen('sector')}>
              <input
                autoFocus
                value={answers.agentName || ''}
                onChange={e => set({ agentName: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter' && answers.agentName?.trim()) setScreen('t-tone') }}
                placeholder="Ex: Assistant Xeyo"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
              />
              <NextBtn disabled={!answers.agentName?.trim()} onClick={() => setScreen('t-tone')} />
            </Step>
          )}

          {/* ─── Transition ton ─── */}
          {screen === 't-tone' && (
            <Transition text="Parfait. Donnons-lui maintenant une personnalité." onNext={() => setScreen('tone')} />
          )}

          {/* ─── Ton ─── */}
          {screen === 'tone' && (
            <Step title="Quel ton doit-il adopter ?" onBack={() => setScreen('name')}>
              <div className="grid grid-cols-3 gap-3">
                {TONES.map(t => (
                  <OptionCard key={t.id} selected={answers.tone === t.label} center
                    onClick={() => { set({ tone: t.label }); setScreen('emojis') }}>
                    <span className="block text-3xl mb-2">{t.emoji}</span>
                    <span className="text-sm font-medium">{t.label}</span>
                  </OptionCard>
                ))}
              </div>
            </Step>
          )}

          {/* ─── Emojis ─── */}
          {screen === 'emojis' && (
            <Step title="Utilise-t-il des emojis ?" onBack={() => setScreen('tone')}>
              <div className="grid grid-cols-3 gap-3">
                {EMOJIS.map(e => (
                  <OptionCard key={e.id} selected={answers.emojis === e.label} center
                    onClick={() => { set({ emojis: e.label }); setScreen('length') }}>
                    <span className="text-sm font-medium">{e.label}</span>
                  </OptionCard>
                ))}
              </div>
            </Step>
          )}

          {/* ─── Longueur ─── */}
          {screen === 'length' && (
            <Step title="Quelle longueur de réponse ?" onBack={() => setScreen('emojis')}>
              <div className="grid grid-cols-3 gap-3">
                {LENGTHS.map(l => (
                  <OptionCard key={l.id} selected={answers.length === l.label} center
                    onClick={() => { set({ length: l.label }); setScreen('t-business') }}>
                    <span className="text-sm font-medium">{l.label}</span>
                  </OptionCard>
                ))}
              </div>
            </Step>
          )}

          {/* ─── Transition métier ─── */}
          {screen === 't-business' && (
            <Transition text="Dernière ligne droite : quelques infos sur ton activité pour qu'il réponde juste." onNext={() => setScreen('hours')} />
          )}

          {/* ─── Disponibilité ─── */}
          {screen === 'hours' && (
            <Step title="Quelle est ta disponibilité ?" onBack={() => setScreen('length')}>
              <div className="space-y-3">
                {HOURS.map(h => (
                  <OptionCard key={h.id} selected={answers.hours === h.label}
                    onClick={() => { set({ hours: h.label }); setScreen('services') }}>
                    <span className="text-sm font-medium">{h.label}</span>
                  </OptionCard>
                ))}
              </div>
            </Step>
          )}

          {/* ─── Services (libre, skippable) ─── */}
          {screen === 'services' && (
            <Step title="Tes principaux services / produits ?" subtitle="Optionnel — aide l'agent à mieux répondre." onBack={() => setScreen('hours')}>
              <textarea
                value={answers.services || ''}
                onChange={e => set({ services: e.target.value })}
                placeholder="Ex: Coupe, coloration, soins… à partir de 25€"
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
              />
              <div className="flex items-center gap-3">
                <button onClick={() => setScreen('languages')} className="flex-1 rounded-full border border-white/10 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                  Passer
                </button>
                <NextBtn onClick={() => setScreen('languages')} className="flex-1" />
              </div>
            </Step>
          )}

          {/* ─── Langues gérées (multi) ─── */}
          {screen === 'languages' && (
            <Step title="Quelles langues l'agent doit-il gérer ?" subtitle="Il détectera la langue du client et répondra dans celle-ci." onBack={() => setScreen('services')}>
              <div className="grid grid-cols-3 gap-3">
                {LANGUAGES.map(l => {
                  const selected = (answers.languages || '').split(',').map(s => s.trim()).includes(l.label)
                  return (
                    <OptionCard key={l.id} selected={selected} center
                      onClick={() => {
                        const cur = (answers.languages || '').split(',').map(s => s.trim()).filter(Boolean)
                        const next = cur.includes(l.label) ? cur.filter(x => x !== l.label) : [...cur, l.label]
                        set({ languages: next.join(', ') })
                      }}>
                      <span className="text-sm font-medium">{l.label}</span>
                    </OptionCard>
                  )
                })}
              </div>
              <NextBtn disabled={!answers.languages?.trim()} onClick={() => setScreen('collect')} />
            </Step>
          )}

          {/* ─── Infos à collecter (libre, skippable) ─── */}
          {screen === 'collect' && (
            <Step title="Quelles informations l'agent doit-il récolter ?" subtitle="Optionnel — ce que l'agent demande au client (une par ligne)." onBack={() => setScreen('languages')}>
              <textarea
                value={answers.collect || ''}
                onChange={e => set({ collect: e.target.value })}
                placeholder={"- Prénom\n- Type de demande\n- Date souhaitée\n- Nombre de personnes"}
                rows={5}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
              />
              <div className="flex items-center gap-3">
                <button onClick={() => setScreen('example')} className="flex-1 rounded-full border border-white/10 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                  Passer
                </button>
                <NextBtn onClick={() => setScreen('example')} className="flex-1" />
              </div>
            </Step>
          )}

          {/* ─── Exemple de conversation (libre, skippable) ─── */}
          {screen === 'example' && (
            <Step title="Un exemple de conversation type ?" subtitle="Optionnel — aide l'agent à reproduire le bon ton et le bon déroulé." onBack={() => setScreen('collect')}>
              <textarea
                value={answers.example || ''}
                onChange={e => set({ example: e.target.value })}
                placeholder={"Client : Bonjour, vous livrez à Paris ?\nAgent : Oui, partout en France sous 48h. Vous souhaitez commander ?\nClient : Oui, combien ça coûte ?\n…"}
                rows={6}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
              />
              <div className="flex items-center gap-3">
                <button onClick={() => setScreen('t-rules')} className="flex-1 rounded-full border border-white/10 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                  Passer
                </button>
                <NextBtn onClick={() => setScreen('t-rules')} className="flex-1" />
              </div>
            </Step>
          )}

          {/* ─── Transition règles ─── */}
          {screen === 't-rules' && (
            <Transition text="Et si l'agent ne sait pas répondre ?" onNext={() => setScreen('escalation')} />
          )}

          {/* ─── Escalade ─── */}
          {screen === 'escalation' && (
            <Step title="Transfert vers un humain ?" onBack={() => setScreen('example')}>
              <div className="space-y-3">
                {ESCALATION.map(e => (
                  <OptionCard key={e.id} selected={answers.escalation === e.id}
                    onClick={() => { set({ escalation: e.id }); setScreen('booking') }}>
                    <span className="text-sm font-medium">{e.label}</span>
                  </OptionCard>
                ))}
              </div>
            </Step>
          )}

          {/* ─── RDV (libre, skippable) ─── */}
          {screen === 'booking' && (
            <Step title="Un lien de prise de rendez-vous ?" subtitle="Optionnel — Calendly, Cal.com…" onBack={() => setScreen('escalation')}>
              <input
                value={answers.bookingUrl || ''}
                onChange={e => set({ bookingUrl: e.target.value })}
                placeholder="https://calendly.com/ton-lien"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                onClick={handleGenerate}
                className="flex w-full items-center justify-center gap-2 rounded-full py-4 text-[15px] font-semibold text-white shadow-lg transition-all hover:brightness-110"
                style={{ background: 'linear-gradient(90deg, #a855f7, #ec4899)' }}
              >
                <Sparkles className="h-5 w-5" /> Créer mon agent
              </button>
            </Step>
          )}

          {/* ─── Génération ─── */}
          {screen === 'generating' && (
            <div className="flex flex-col items-center gap-6 text-center">
              <BlobLoader size={120} />
              <div>
                <p className="text-xl font-semibold">On crée ton agent…</p>
                <p className="mt-1 text-sm text-muted-foreground">Quelques secondes, on assemble tout ça.</p>
              </div>
            </div>
          )}

          {/* ─── Fin ─── */}
          {screen === 'done' && createdAgent && (
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <Check className="h-10 w-10" />
              </div>
              <div>
                <p className="text-2xl font-bold">{createdAgent.name} est prêt ! 🎉</p>
                <p className="mt-1 text-sm text-muted-foreground">Teste-le tout de suite, ou peaufine sa configuration.</p>
              </div>
              <div className="mt-2 flex w-full max-w-sm flex-col gap-3">
                <button
                  onClick={() => setTestOpen(true)}
                  className="flex items-center justify-center gap-2 rounded-full py-4 text-[15px] font-semibold text-white shadow-lg transition-all hover:brightness-110"
                  style={{ background: 'linear-gradient(90deg, #a855f7, #ec4899)' }}
                >
                  <MessageSquare className="h-5 w-5" /> Tester l&apos;agent
                </button>
                <button
                  onClick={() => router.push(`/agents/${createdAgent.id}`)}
                  className="flex items-center justify-center gap-2 rounded-full border border-white/15 py-4 text-[15px] font-semibold text-foreground transition-colors hover:bg-white/[0.05]"
                >
                  <Settings2 className="h-5 w-5" /> Configurer
                </button>
                <button
                  onClick={() => router.push('/agents')}
                  className="mt-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Voir tous mes agents
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chat de test de l'agent fraîchement créé */}
      {createdAgent && (
        <AgentTestChat
          open={testOpen}
          onOpenChange={setTestOpen}
          agentId={createdAgent.id}
          agentName={createdAgent.name}
        />
      )}
    </div>
  )
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function Step({ title, subtitle, onBack, children }: {
  title: string; subtitle?: string; onBack?: () => void; children: React.ReactNode
}) {
  return (
    <div className="animate-fade-in-up">
      {onBack && (
        <button onClick={onBack} className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
      )}
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
      <div className="mt-7 space-y-4">{children}</div>
    </div>
  )
}

function Transition({ text, onNext }: { text: string; onNext: () => void }) {
  return (
    <div className="flex animate-fade-in-up flex-col items-center gap-8 text-center">
      <div className="relative">
        <div className="absolute -inset-8 rounded-full opacity-30 blur-3xl" style={{ background: 'radial-gradient(circle, #ec4899, transparent)' }} />
        <BlobLoader size={96} />
      </div>
      <p className="max-w-md text-xl font-medium leading-relaxed">{text}</p>
      <button
        onClick={onNext}
        className="flex items-center justify-center gap-2 rounded-full px-8 py-3.5 text-[15px] font-semibold text-white shadow-lg transition-all hover:brightness-110"
        style={{ background: 'linear-gradient(90deg, #a855f7, #ec4899)' }}
      >
        Continuer <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function BigCard({ icon, title, desc, onClick, highlight }: {
  icon: React.ReactNode; title: string; desc: string; onClick: () => void; highlight?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition-all hover:-translate-y-0.5',
        highlight ? 'border-fuchsia-500/40 bg-fuchsia-500/[0.07] hover:border-fuchsia-500/60' : 'border-white/10 bg-white/[0.03] hover:border-white/20'
      )}
    >
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', highlight ? 'bg-fuchsia-500/20 text-fuchsia-400' : 'bg-white/[0.06] text-muted-foreground')}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
    </button>
  )
}

function OptionCard({ selected, center, onClick, children }: {
  selected?: boolean; center?: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'block w-full rounded-2xl border p-4 transition-all hover:-translate-y-0.5',
        center && 'text-center',
        selected ? 'border-fuchsia-500/60 bg-fuchsia-500/[0.10]' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
      )}
    >
      {children}
    </button>
  )
}

function NextBtn({ onClick, disabled, className }: { onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center gap-2 rounded-full px-8 py-3.5 text-[15px] font-semibold text-white shadow-lg transition-all hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100',
        className
      )}
      style={{ background: 'linear-gradient(90deg, #a855f7, #ec4899)' }}
    >
      Continuer <ArrowRight className="h-4 w-4" />
    </button>
  )
}
