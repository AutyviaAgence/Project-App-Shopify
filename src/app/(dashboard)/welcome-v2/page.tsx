'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useTenant } from '@/lib/tenant/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowRight, ArrowLeft, Check, Smartphone, Bot, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const TEMPLATES = [
  {
    id: 'support',
    name: 'Support client',
    description: 'Répond aux questions fréquentes 24h/24 et redirige vers un humain si besoin.',
    icon: '🎧',
    color: 'border-blue-500/40 bg-blue-500/5 hover:border-blue-500 hover:bg-blue-500/10',
    selectedColor: 'border-blue-500 bg-blue-500/15 ring-2 ring-blue-500/30',
    defaultPrompt: 'Tu es un agent de support client professionnel et bienveillant. Réponds aux questions des clients de manière claire et concise. Si tu ne connais pas la réponse, dis-le honnêtement et propose de transférer à un conseiller humain.',
  },
  {
    id: 'booking',
    name: 'Prise de RDV',
    description: 'Guide le client vers un rendez-vous et gère les relances automatiquement.',
    icon: '📅',
    color: 'border-cyan-500/40 bg-cyan-500/5 hover:border-cyan-500 hover:bg-cyan-500/10',
    selectedColor: 'border-cyan-500 bg-cyan-500/15 ring-2 ring-cyan-500/30',
    defaultPrompt: 'Tu es un assistant spécialisé dans la prise de rendez-vous. Accueille chaleureusement le client, identifie son besoin et propose-lui de réserver un créneau. Sois enthousiaste et efficace.',
  },
  {
    id: 'leads',
    name: 'Qualification leads',
    description: 'Identifie les prospects qualifiés et les transfère automatiquement à votre équipe.',
    icon: '🎯',
    color: 'border-violet-500/40 bg-violet-500/5 hover:border-violet-500 hover:bg-violet-500/10',
    selectedColor: 'border-violet-500 bg-violet-500/15 ring-2 ring-violet-500/30',
    defaultPrompt: 'Tu es un agent de qualification commerciale. Identifie le besoin du prospect, son budget et son délai de décision en posant 3-4 questions naturelles. Classe ensuite le lead comme chaud ou froid.',
  },
  {
    id: 'sales',
    name: 'Vente & catalogue',
    description: 'Présente vos produits, répond aux questions et guide vers l\'achat.',
    icon: '🛍️',
    color: 'border-orange-500/40 bg-orange-500/5 hover:border-orange-500 hover:bg-orange-500/10',
    selectedColor: 'border-orange-500 bg-orange-500/15 ring-2 ring-orange-500/30',
    defaultPrompt: 'Tu es un conseiller commercial enthousiaste. Aide les clients à trouver le produit parfait pour leurs besoins. Mets en valeur les bénéfices et guide vers l\'achat ou la réservation d\'une démo.',
  },
]

const TONES = [
  { id: 'professional', label: 'Professionnel', emoji: '👔' },
  { id: 'friendly', label: 'Chaleureux', emoji: '😊' },
  { id: 'casual', label: 'Décontracté', emoji: '😎' },
]

export default function WelcomeV2Page() {
  const tenant = useTenant()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [tone, setTone] = useState('professional')
  const [agentName, setAgentName] = useState('')
  const [creating, setCreating] = useState(false)

  const template = TEMPLATES.find(t => t.id === selectedTemplate)

  async function handleCreate() {
    if (!selectedTemplate || !companyName.trim()) return
    setCreating(true)

    try {
      // Construire le prompt depuis le template + personnalisation
      const toneLabel = TONES.find(t => t.id === tone)?.label.toLowerCase() || 'professionnel'
      const systemPrompt = `${template?.defaultPrompt}\n\nTon entreprise s'appelle "${companyName}". Adopte un ton ${toneLabel} dans toutes tes réponses. Représente toujours "${companyName}" avec professionnalisme.`

      // Créer l'agent
      const agentRes = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName || `Agent ${template?.name}`,
          description: template?.description,
          system_prompt: systemPrompt,
          model: 'gpt-4o-mini',
          temperature: 0.7,
          is_active: true,
        }),
      })

      if (!agentRes.ok) throw new Error('Erreur création agent')
      const { data: agent } = await agentRes.json()

      // Appliquer le template de workflow
      const templateMod = await import(`@/lib/workflow-templates/${selectedTemplate}`)
      const workflowTemplate = templateMod[`${selectedTemplate}Template`]

      await fetch(`/api/agents/${agent.id}/workflow`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: workflowTemplate.nodes, edges: workflowTemplate.edges }),
      })

      toast.success('Votre agent est prêt !')
      router.push(`/agents/${agent.id}/workflow`)
    } catch {
      toast.error('Erreur lors de la création')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center gap-3">
        <Image src={tenant.logoUrl} alt={tenant.appName} width={32} height={32} className="h-8 w-8" />
        <span className="font-semibold">{tenant.appName}</span>
        <div className="ml-auto flex items-center gap-2">
          {[1, 2, 3].map(s => (
            <div key={s} className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-all',
              step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}>
              {step > s ? <Check className="h-3 w-3" /> : s}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">

        {/* Étape 1 : Choisir un template */}
        {step === 1 && (
          <div className="w-full max-w-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="flex justify-center mb-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Bot className="h-7 w-7 text-primary" />
                </div>
              </div>
              <h1 className="text-2xl font-bold">Quel est votre objectif principal ?</h1>
              <p className="text-muted-foreground text-sm">Choisissez le type d&apos;agent qui correspond le mieux à votre besoin.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t.id)}
                  className={cn(
                    'rounded-xl border-2 p-4 text-left transition-all',
                    selectedTemplate === t.id ? t.selectedColor : t.color
                  )}
                >
                  <span className="text-2xl">{t.icon}</span>
                  <p className="mt-2 font-semibold text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                </button>
              ))}
            </div>

            <div className="flex justify-between items-center">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
              >
                Passer pour l&apos;instant
              </button>
              <Button
                onClick={() => setStep(2)}
                disabled={!selectedTemplate}
              >
                Continuer <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Étape 2 : Personnalisation */}
        {step === 2 && (
          <div className="w-full max-w-md space-y-6">
            <div className="text-center space-y-2">
              <div className="flex justify-center mb-4">
                <span className="text-4xl">{template?.icon}</span>
              </div>
              <h1 className="text-2xl font-bold">Personnalisez votre agent</h1>
              <p className="text-muted-foreground text-sm">Quelques informations pour l&apos;adapter à votre entreprise.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nom de votre entreprise <span className="text-destructive">*</span></Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex: Boulangerie Martin"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nom de l&apos;agent (optionnel)</Label>
                <Input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder={`Agent ${template?.name}`}
                />
              </div>
              <div className="space-y-2">
                <Label>Ton de la conversation</Label>
                <div className="grid grid-cols-3 gap-2">
                  {TONES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTone(t.id)}
                      className={cn(
                        'rounded-lg border-2 py-2.5 text-center transition-all',
                        tone === t.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                      )}
                    >
                      <span className="text-lg block">{t.emoji}</span>
                      <span className="text-xs font-medium">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Retour
              </Button>
              <Button
                className="flex-1"
                onClick={() => setStep(3)}
                disabled={!companyName.trim()}
              >
                Continuer <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Étape 3 : Confirmation & création */}
        {step === 3 && (
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="space-y-2">
              <div className="flex justify-center mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
                  <Zap className="h-8 w-8 text-emerald-500" />
                </div>
              </div>
              <h1 className="text-2xl font-bold">Prêt à lancer votre agent ?</h1>
              <p className="text-muted-foreground text-sm">Voici ce qui va être créé :</p>
            </div>

            <div className="rounded-xl border bg-muted/30 p-4 text-left space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{template?.icon}</span>
                <div>
                  <p className="font-semibold text-sm">{agentName || `Agent ${template?.name}`}</p>
                  <p className="text-xs text-muted-foreground">{template?.name} · Ton {TONES.find(t => t.id === tone)?.label.toLowerCase()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Smartphone className="h-3.5 w-3.5" />
                <span>Workflow pré-configuré avec blocs de base</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Bot className="h-3.5 w-3.5" />
                <span>IA configurée pour {companyName}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald-600">
                <Check className="h-3.5 w-3.5" />
                <span>Vous pourrez personnaliser le workflow ensuite</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Retour
              </Button>
              <Button className="flex-1" onClick={handleCreate} disabled={creating}>
                {creating ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Création en cours...</>
                ) : (
                  <><Zap className="mr-2 h-4 w-4" /> Créer mon agent</>
                )}
              </Button>
            </div>

            <button
              onClick={() => router.push('/dashboard')}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
            >
              Passer pour l&apos;instant, je ferai ça plus tard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
