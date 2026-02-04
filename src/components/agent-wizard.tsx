'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import {
  Bot,
  Building2,
  Target,
  MessageSquare,
  Shield,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  Check,
  Megaphone,
  MessageCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Types pour le wizard
export interface WizardData {
  // Étape 1: Type d'agent
  agentType: 'conversation' | 'relance'

  // Étape 2: Identité
  businessName: string
  businessSector: string
  businessDescription: string

  // Étape 3: Rôle (conversation)
  roles: string[]
  canGivePrices: boolean
  canBookAppointments: boolean
  bookingUrl: string
  escalationTriggers: string[]

  // Étape 3: Rôle (relance)
  campaignObjective: string
  hookMessage: string
  continueConversation: boolean

  // Étape 4: Ton & Personnalité
  tone: string
  formality: string
  useEmojis: string
  responseLength: string

  // Étape 5: Informations métier
  businessHours: string
  businessAddress: string
  mainServices: string
  mainPrices: string
  currentPromotions: string
  faq: { question: string; answer: string }[]

  // Étape 6: Limites
  forbiddenTopics: string
  fallbackMessage: string
  maxExchangesBeforeEscalation: number
}

export interface GeneratedAgentConfig {
  name: string
  description: string
  system_prompt: string
  objective: string
  agent_type: 'conversation' | 'relance'
  escalation_enabled: boolean
  escalation_keywords: string[]
  escalation_message: string
  booking_url: string
  schedule_enabled: boolean
  schedule_start_time: string
  schedule_end_time: string
  schedule_days: number[]
  // Données RAG à créer
  ragContent: string
}

interface AgentWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (config: GeneratedAgentConfig) => void
}

const BUSINESS_SECTORS = [
  { value: 'restaurant', label: 'Restaurant / Restauration' },
  { value: 'coiffure', label: 'Salon de coiffure / Beauté' },
  { value: 'ecommerce', label: 'E-commerce / Boutique en ligne' },
  { value: 'immobilier', label: 'Immobilier' },
  { value: 'sante', label: 'Santé / Médical' },
  { value: 'services-b2b', label: 'Services B2B' },
  { value: 'services-b2c', label: 'Services aux particuliers' },
  { value: 'formation', label: 'Formation / Coaching' },
  { value: 'artisan', label: 'Artisan / BTP' },
  { value: 'autre', label: 'Autre' },
]

const CONVERSATION_ROLES = [
  { value: 'questions', label: 'Répondre aux questions' },
  { value: 'rdv', label: 'Prendre des rendez-vous' },
  { value: 'qualify', label: 'Qualifier des leads' },
  { value: 'support', label: 'Support client' },
  { value: 'info', label: 'Informer sur les produits/services' },
  { value: 'devis', label: 'Faire des devis' },
]

const ESCALATION_TRIGGERS = [
  { value: 'reclamation', label: 'Réclamations' },
  { value: 'complex', label: 'Questions complexes' },
  { value: 'urgent', label: 'Demandes urgentes' },
  { value: 'humain', label: 'Sur demande du client' },
  { value: 'prix-special', label: 'Prix personnalisés' },
]

const CAMPAIGN_OBJECTIVES = [
  { value: 'reactivation', label: 'Réactiver des clients inactifs' },
  { value: 'promo', label: 'Proposer une offre/promotion' },
  { value: 'rappel-rdv', label: 'Rappel de rendez-vous' },
  { value: 'avis', label: 'Demande d\'avis client' },
  { value: 'nouveaute', label: 'Annoncer une nouveauté' },
  { value: 'fidelite', label: 'Programme de fidélité' },
]

const TONES = [
  { value: 'professionnel', label: 'Professionnel', description: 'Sérieux et corporate' },
  { value: 'amical', label: 'Amical', description: 'Chaleureux et accessible' },
  { value: 'decontracte', label: 'Décontracté', description: 'Cool et moderne' },
  { value: 'premium', label: 'Luxe / Premium', description: 'Élégant et raffiné' },
]

const FORMALITY = [
  { value: 'vouvoiement', label: 'Vouvoiement' },
  { value: 'tutoiement', label: 'Tutoiement' },
  { value: 'adaptatif', label: 'S\'adapter au client' },
]

const EMOJI_USAGE = [
  { value: 'jamais', label: 'Jamais' },
  { value: 'parfois', label: 'Parfois (1-2 max)' },
  { value: 'souvent', label: 'Souvent' },
]

const RESPONSE_LENGTHS = [
  { value: 'courte', label: 'Courtes (1-2 phrases)' },
  { value: 'moyenne', label: 'Moyennes (3-4 phrases)' },
  { value: 'detaillee', label: 'Détaillées' },
]

const STEPS = [
  { id: 1, title: 'Type', icon: Bot },
  { id: 2, title: 'Identité', icon: Building2 },
  { id: 3, title: 'Rôle', icon: Target },
  { id: 4, title: 'Ton', icon: MessageSquare },
  { id: 5, title: 'Métier', icon: Building2 },
  { id: 6, title: 'Limites', icon: Shield },
]

const DEFAULT_DATA: WizardData = {
  agentType: 'conversation',
  businessName: '',
  businessSector: '',
  businessDescription: '',
  roles: [],
  canGivePrices: false,
  canBookAppointments: false,
  bookingUrl: '',
  escalationTriggers: [],
  campaignObjective: '',
  hookMessage: '',
  continueConversation: true,
  tone: 'amical',
  formality: 'vouvoiement',
  useEmojis: 'parfois',
  responseLength: 'moyenne',
  businessHours: '',
  businessAddress: '',
  mainServices: '',
  mainPrices: '',
  currentPromotions: '',
  faq: [],
  forbiddenTopics: '',
  fallbackMessage: '',
  maxExchangesBeforeEscalation: 5,
}

export function AgentWizard({ open, onOpenChange, onComplete }: AgentWizardProps) {
  const [step, setStep] = useState(1)
  const [data, setData] = useState<WizardData>(DEFAULT_DATA)
  const [generating, setGenerating] = useState(false)

  const totalSteps = 6
  const progress = (step / totalSteps) * 100

  function updateData<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData(prev => ({ ...prev, [key]: value }))
  }

  function toggleArrayItem(key: 'roles' | 'escalationTriggers', value: string) {
    setData(prev => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter(v => v !== value)
        : [...prev[key], value]
    }))
  }

  function canProceed(): boolean {
    switch (step) {
      case 1:
        return !!data.agentType
      case 2:
        return !!data.businessName.trim() && !!data.businessSector
      case 3:
        if (data.agentType === 'conversation') {
          return data.roles.length > 0
        }
        return !!data.campaignObjective
      case 4:
        return !!data.tone && !!data.formality
      case 5:
        return !!data.mainServices.trim()
      case 6:
        return true
      default:
        return false
    }
  }

  function generatePrompt(): string {
    const parts: string[] = []

    // Identité
    parts.push(`Tu es l'assistant virtuel de ${data.businessName}, ${getSectorDescription(data.businessSector)}.`)
    if (data.businessDescription) {
      parts.push(data.businessDescription)
    }

    // Type d'agent
    if (data.agentType === 'relance') {
      parts.push('\nTu es un agent de relance. Ton rôle est d\'initier des conversations pour ' + getCampaignObjectiveDescription(data.campaignObjective) + '.')
      if (data.continueConversation) {
        parts.push('Après ton message initial, tu peux continuer la conversation normalement.')
      }
    }

    // Ton et personnalité
    parts.push(`\n## Ton et style`)
    parts.push(`- Adopte un ton ${data.tone}.`)
    parts.push(`- ${getFormalityInstruction(data.formality)}`)
    parts.push(`- ${getEmojiInstruction(data.useEmojis)}`)
    parts.push(`- ${getResponseLengthInstruction(data.responseLength)}`)

    // Rôle et capacités (conversation)
    if (data.agentType === 'conversation' && data.roles.length > 0) {
      parts.push(`\n## Tes missions`)
      data.roles.forEach(role => {
        parts.push(`- ${getRoleDescription(role)}`)
      })
    }

    // Capacités spécifiques
    if (data.canGivePrices) {
      parts.push(`\nTu peux communiquer les prix et tarifs de nos services.`)
    } else {
      parts.push(`\nNe communique pas de prix précis. Invite le client à nous contacter pour un devis personnalisé.`)
    }

    if (data.canBookAppointments && data.bookingUrl) {
      parts.push(`\nTu peux proposer des rendez-vous. Utilise ce lien pour les prises de RDV : ${data.bookingUrl}`)
    }

    // Informations métier
    if (data.mainServices) {
      parts.push(`\n## Nos services/produits`)
      parts.push(data.mainServices)
    }

    if (data.canGivePrices && data.mainPrices) {
      parts.push(`\n## Nos tarifs`)
      parts.push(data.mainPrices)
    }

    if (data.businessHours) {
      parts.push(`\n## Horaires d'ouverture`)
      parts.push(data.businessHours)
    }

    if (data.businessAddress) {
      parts.push(`\n## Adresse / Zone d'intervention`)
      parts.push(data.businessAddress)
    }

    if (data.currentPromotions) {
      parts.push(`\n## Promotions en cours`)
      parts.push(data.currentPromotions)
    }

    // Limites
    if (data.forbiddenTopics) {
      parts.push(`\n## Sujets à éviter`)
      parts.push(`N'aborde JAMAIS les sujets suivants : ${data.forbiddenTopics}`)
    }

    if (data.fallbackMessage) {
      parts.push(`\n## En cas de doute`)
      parts.push(`Si tu ne sais pas répondre ou si la question dépasse tes compétences, réponds : "${data.fallbackMessage}"`)
    }

    // Escalation
    if (data.escalationTriggers.length > 0) {
      parts.push(`\n## Passer la main à un humain`)
      parts.push(`Dans les cas suivants, indique poliment qu'un conseiller va prendre le relais :`)
      data.escalationTriggers.forEach(trigger => {
        parts.push(`- ${getEscalationDescription(trigger)}`)
      })
    }

    return parts.join('\n')
  }

  function generateRAGContent(): string {
    const parts: string[] = []

    parts.push(`# Informations sur ${data.businessName}`)
    parts.push(`\nSecteur : ${BUSINESS_SECTORS.find(s => s.value === data.businessSector)?.label || data.businessSector}`)

    if (data.businessDescription) {
      parts.push(`\n## Description`)
      parts.push(data.businessDescription)
    }

    if (data.mainServices) {
      parts.push(`\n## Services / Produits`)
      parts.push(data.mainServices)
    }

    if (data.mainPrices) {
      parts.push(`\n## Tarifs`)
      parts.push(data.mainPrices)
    }

    if (data.businessHours) {
      parts.push(`\n## Horaires`)
      parts.push(data.businessHours)
    }

    if (data.businessAddress) {
      parts.push(`\n## Adresse / Zone`)
      parts.push(data.businessAddress)
    }

    if (data.currentPromotions) {
      parts.push(`\n## Promotions actuelles`)
      parts.push(data.currentPromotions)
    }

    if (data.faq.length > 0) {
      parts.push(`\n## Questions fréquentes`)
      data.faq.forEach(({ question, answer }) => {
        parts.push(`\nQ: ${question}`)
        parts.push(`R: ${answer}`)
      })
    }

    return parts.join('\n')
  }

  async function handleComplete() {
    setGenerating(true)

    // Simuler un petit délai pour l'effet "génération"
    await new Promise(resolve => setTimeout(resolve, 800))

    const config: GeneratedAgentConfig = {
      name: `Agent ${data.businessName}`,
      description: data.agentType === 'conversation'
        ? `Agent de conversation pour ${data.businessName}`
        : `Agent de relance pour ${data.businessName} - ${getCampaignObjectiveDescription(data.campaignObjective)}`,
      system_prompt: generatePrompt(),
      objective: data.agentType === 'conversation'
        ? data.roles.map(r => getRoleDescription(r)).join(', ')
        : getCampaignObjectiveDescription(data.campaignObjective),
      agent_type: data.agentType,
      escalation_enabled: data.escalationTriggers.length > 0,
      escalation_keywords: data.escalationTriggers.flatMap(t => getEscalationKeywords(t)),
      escalation_message: data.fallbackMessage || 'Je comprends. Un conseiller va prendre le relais pour mieux vous aider.',
      booking_url: data.canBookAppointments ? data.bookingUrl : '',
      schedule_enabled: !!data.businessHours,
      schedule_start_time: extractStartTime(data.businessHours),
      schedule_end_time: extractEndTime(data.businessHours),
      schedule_days: [1, 2, 3, 4, 5], // Par défaut lundi-vendredi
      ragContent: generateRAGContent(),
    }

    setGenerating(false)
    onComplete(config)

    // Reset wizard
    setStep(1)
    setData(DEFAULT_DATA)
  }

  function handleClose() {
    setStep(1)
    setData(DEFAULT_DATA)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Assistant de création d&apos;agent
          </DialogTitle>
          <DialogDescription>
            Répondez à quelques questions pour configurer votre agent IA automatiquement.
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Étape {step} sur {totalSteps}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between">
            {STEPS.map((s) => (
              <div
                key={s.id}
                className={cn(
                  'flex flex-col items-center gap-1 text-xs',
                  step >= s.id ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2',
                    step > s.id ? 'border-primary bg-primary text-primary-foreground' :
                    step === s.id ? 'border-primary' : 'border-muted'
                  )}
                >
                  {step > s.id ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                </div>
                <span className="hidden sm:block">{s.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Étape 1: Type d'agent */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium">Quel type d&apos;agent souhaitez-vous créer ?</h3>
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => updateData('agentType', 'conversation')}
                  className={cn(
                    'flex items-start gap-4 rounded-lg border p-4 text-left transition-all hover:border-primary',
                    data.agentType === 'conversation' && 'border-primary bg-primary/5'
                  )}
                >
                  <MessageCircle className="h-6 w-6 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Agent de conversation</p>
                    <p className="text-sm text-muted-foreground">
                      Répond automatiquement aux messages entrants. Idéal pour le support client,
                      la prise de rendez-vous, ou répondre aux questions.
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => updateData('agentType', 'relance')}
                  className={cn(
                    'flex items-start gap-4 rounded-lg border p-4 text-left transition-all hover:border-primary',
                    data.agentType === 'relance' && 'border-primary bg-primary/5'
                  )}
                >
                  <Megaphone className="h-6 w-6 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Agent de relance (campagnes)</p>
                    <p className="text-sm text-muted-foreground">
                      Envoie le premier message pour réactiver des clients, proposer des offres,
                      ou faire des rappels. Utilisé dans les campagnes.
                    </p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Étape 2: Identité */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-medium">Parlez-nous de votre entreprise</h3>

              <div className="space-y-2">
                <Label htmlFor="businessName">Nom de l&apos;entreprise *</Label>
                <Input
                  id="businessName"
                  placeholder="Ex: Salon Marie Coiffure"
                  value={data.businessName}
                  onChange={(e) => updateData('businessName', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessSector">Secteur d&apos;activité *</Label>
                <Select value={data.businessSector} onValueChange={(v) => updateData('businessSector', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez votre secteur" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUSINESS_SECTORS.map((sector) => (
                      <SelectItem key={sector.value} value={sector.value}>
                        {sector.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessDescription">Description (optionnel)</Label>
                <Textarea
                  id="businessDescription"
                  placeholder="Ex: Salon de coiffure mixte spécialisé dans les colorations et les soins capillaires, situé en centre-ville."
                  value={data.businessDescription}
                  onChange={(e) => updateData('businessDescription', e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Étape 3: Rôle */}
          {step === 3 && (
            <div className="space-y-4">
              {data.agentType === 'conversation' ? (
                <>
                  <h3 className="font-medium">Quel sera le rôle de l&apos;agent ?</h3>

                  <div className="space-y-2">
                    <Label>Missions principales *</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {CONVERSATION_ROLES.map((role) => (
                        <button
                          key={role.value}
                          type="button"
                          onClick={() => toggleArrayItem('roles', role.value)}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border p-3 text-sm transition-all hover:border-primary',
                            data.roles.includes(role.value) && 'border-primary bg-primary/5'
                          )}
                        >
                          <Checkbox checked={data.roles.includes(role.value)} />
                          {role.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>L&apos;agent peut-il donner des prix ?</Label>
                        <p className="text-xs text-muted-foreground">Communiquer les tarifs de vos services</p>
                      </div>
                      <Checkbox
                        checked={data.canGivePrices}
                        onCheckedChange={(checked) => updateData('canGivePrices', checked === true)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>L&apos;agent peut-il prendre des RDV ?</Label>
                        <p className="text-xs text-muted-foreground">Partager un lien de prise de rendez-vous</p>
                      </div>
                      <Checkbox
                        checked={data.canBookAppointments}
                        onCheckedChange={(checked) => updateData('canBookAppointments', checked === true)}
                      />
                    </div>

                    {data.canBookAppointments && (
                      <div className="space-y-2 pl-4">
                        <Label htmlFor="bookingUrl">Lien de prise de RDV</Label>
                        <Input
                          id="bookingUrl"
                          type="url"
                          placeholder="https://calendly.com/votre-lien"
                          value={data.bookingUrl}
                          onChange={(e) => updateData('bookingUrl', e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Quand passer la main à un humain ?</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {ESCALATION_TRIGGERS.map((trigger) => (
                        <button
                          key={trigger.value}
                          type="button"
                          onClick={() => toggleArrayItem('escalationTriggers', trigger.value)}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border p-3 text-sm transition-all hover:border-primary',
                            data.escalationTriggers.includes(trigger.value) && 'border-primary bg-primary/5'
                          )}
                        >
                          <Checkbox checked={data.escalationTriggers.includes(trigger.value)} />
                          {trigger.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-medium">Configurez votre agent de relance</h3>

                  <div className="space-y-2">
                    <Label>Objectif de la campagne *</Label>
                    <Select value={data.campaignObjective} onValueChange={(v) => updateData('campaignObjective', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez l'objectif" />
                      </SelectTrigger>
                      <SelectContent>
                        {CAMPAIGN_OBJECTIVES.map((obj) => (
                          <SelectItem key={obj.value} value={obj.value}>
                            {obj.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hookMessage">Message d&apos;accroche (optionnel)</Label>
                    <Textarea
                      id="hookMessage"
                      placeholder="Ex: Bonjour ! Cela fait un moment que nous ne vous avons pas vu au salon. Nous avons pensé à vous..."
                      value={data.hookMessage}
                      onChange={(e) => updateData('hookMessage', e.target.value)}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      Ce message servira de base pour le premier contact. L&apos;IA l&apos;adaptera.
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <Label>Continuer la conversation après la relance ?</Label>
                      <p className="text-xs text-muted-foreground">
                        L&apos;agent peut répondre aux messages suivants
                      </p>
                    </div>
                    <Checkbox
                      checked={data.continueConversation}
                      onCheckedChange={(checked) => updateData('continueConversation', checked === true)}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Étape 4: Ton & Personnalité */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-medium">Définissez le ton de l&apos;agent</h3>

              <div className="space-y-2">
                <Label>Ton général *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {TONES.map((tone) => (
                    <button
                      key={tone.value}
                      type="button"
                      onClick={() => updateData('tone', tone.value)}
                      className={cn(
                        'flex flex-col items-start rounded-lg border p-3 text-left transition-all hover:border-primary',
                        data.tone === tone.value && 'border-primary bg-primary/5'
                      )}
                    >
                      <span className="font-medium">{tone.label}</span>
                      <span className="text-xs text-muted-foreground">{tone.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Vouvoiement / Tutoiement *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {FORMALITY.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => updateData('formality', f.value)}
                      className={cn(
                        'rounded-lg border p-3 text-sm transition-all hover:border-primary',
                        data.formality === f.value && 'border-primary bg-primary/5'
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Utilisation d&apos;emojis</Label>
                <div className="grid grid-cols-3 gap-2">
                  {EMOJI_USAGE.map((e) => (
                    <button
                      key={e.value}
                      type="button"
                      onClick={() => updateData('useEmojis', e.value)}
                      className={cn(
                        'rounded-lg border p-3 text-sm transition-all hover:border-primary',
                        data.useEmojis === e.value && 'border-primary bg-primary/5'
                      )}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Longueur des réponses</Label>
                <div className="grid grid-cols-3 gap-2">
                  {RESPONSE_LENGTHS.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => updateData('responseLength', l.value)}
                      className={cn(
                        'rounded-lg border p-3 text-sm transition-all hover:border-primary',
                        data.responseLength === l.value && 'border-primary bg-primary/5'
                      )}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Étape 5: Informations métier */}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-medium">Informations sur votre activité</h3>
              <p className="text-sm text-muted-foreground">
                Ces informations seront utilisées par l&apos;agent pour répondre aux questions.
              </p>

              <div className="space-y-2">
                <Label htmlFor="mainServices">Services / Produits principaux *</Label>
                <Textarea
                  id="mainServices"
                  placeholder="Ex:&#10;- Coupe femme : à partir de 35€&#10;- Coupe homme : 25€&#10;- Coloration : à partir de 60€&#10;- Balayage : à partir de 80€"
                  value={data.mainServices}
                  onChange={(e) => updateData('mainServices', e.target.value)}
                  rows={4}
                />
              </div>

              {data.canGivePrices && (
                <div className="space-y-2">
                  <Label htmlFor="mainPrices">Tarifs détaillés</Label>
                  <Textarea
                    id="mainPrices"
                    placeholder="Détaillez vos tarifs si nécessaire..."
                    value={data.mainPrices}
                    onChange={(e) => updateData('mainPrices', e.target.value)}
                    rows={3}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="businessHours">Horaires d&apos;ouverture</Label>
                <Textarea
                  id="businessHours"
                  placeholder="Ex:&#10;Lundi - Vendredi : 9h00 - 19h00&#10;Samedi : 9h00 - 17h00&#10;Dimanche : Fermé"
                  value={data.businessHours}
                  onChange={(e) => updateData('businessHours', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessAddress">Adresse / Zone d&apos;intervention</Label>
                <Input
                  id="businessAddress"
                  placeholder="Ex: 123 rue de la Paix, 75001 Paris"
                  value={data.businessAddress}
                  onChange={(e) => updateData('businessAddress', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currentPromotions">Promotions en cours (optionnel)</Label>
                <Textarea
                  id="currentPromotions"
                  placeholder="Ex: -20% sur les colorations jusqu'au 31 mars"
                  value={data.currentPromotions}
                  onChange={(e) => updateData('currentPromotions', e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* Étape 6: Limites */}
          {step === 6 && (
            <div className="space-y-4">
              <h3 className="font-medium">Limites et sécurité</h3>

              <div className="space-y-2">
                <Label htmlFor="forbiddenTopics">Sujets à ne jamais aborder (optionnel)</Label>
                <Textarea
                  id="forbiddenTopics"
                  placeholder="Ex: concurrents, politique, religion, informations personnelles des autres clients..."
                  value={data.forbiddenTopics}
                  onChange={(e) => updateData('forbiddenTopics', e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fallbackMessage">Message si l&apos;agent ne sait pas répondre</Label>
                <Textarea
                  id="fallbackMessage"
                  placeholder="Ex: Je vais transmettre votre question à un conseiller qui vous répondra rapidement."
                  value={data.fallbackMessage}
                  onChange={(e) => updateData('fallbackMessage', e.target.value)}
                  rows={2}
                />
              </div>

              {data.agentType === 'conversation' && (
                <div className="space-y-2">
                  <Label htmlFor="maxExchanges">Alerter un humain après N échanges sans solution</Label>
                  <Input
                    id="maxExchanges"
                    type="number"
                    min={1}
                    max={20}
                    value={data.maxExchangesBeforeEscalation}
                    onChange={(e) => updateData('maxExchangesBeforeEscalation', parseInt(e.target.value) || 5)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Si la conversation dépasse ce nombre d&apos;échanges, un humain sera alerté.
                  </p>
                </div>
              )}

              {/* Résumé */}
              <div className="rounded-lg border bg-muted/50 p-4 mt-6">
                <h4 className="font-medium mb-2">Résumé de votre agent</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• <strong>Type :</strong> {data.agentType === 'conversation' ? 'Conversation' : 'Relance'}</li>
                  <li>• <strong>Entreprise :</strong> {data.businessName}</li>
                  <li>• <strong>Ton :</strong> {TONES.find(t => t.value === data.tone)?.label}</li>
                  <li>• <strong>Style :</strong> {FORMALITY.find(f => f.value === data.formality)?.label}</li>
                  {data.agentType === 'conversation' && data.roles.length > 0 && (
                    <li>• <strong>Missions :</strong> {data.roles.map(r => CONVERSATION_ROLES.find(cr => cr.value === r)?.label).join(', ')}</li>
                  )}
                  {data.agentType === 'relance' && (
                    <li>• <strong>Objectif :</strong> {CAMPAIGN_OBJECTIVES.find(o => o.value === data.campaignObjective)?.label}</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between border-t pt-4">
          <Button
            variant="outline"
            onClick={() => step > 1 ? setStep(step - 1) : handleClose()}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            {step > 1 ? 'Précédent' : 'Annuler'}
          </Button>

          {step < totalSteps ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
              Suivant
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={!canProceed() || generating}>
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Créer l&apos;agent
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Fonctions utilitaires
function getSectorDescription(sector: string): string {
  const descriptions: Record<string, string> = {
    'restaurant': 'un restaurant',
    'coiffure': 'un salon de coiffure et beauté',
    'ecommerce': 'une boutique en ligne',
    'immobilier': 'une agence immobilière',
    'sante': 'un établissement de santé',
    'services-b2b': 'une entreprise de services B2B',
    'services-b2c': 'une entreprise de services aux particuliers',
    'formation': 'un organisme de formation',
    'artisan': 'une entreprise artisanale',
    'autre': 'une entreprise',
  }
  return descriptions[sector] || 'une entreprise'
}

function getCampaignObjectiveDescription(objective: string): string {
  const descriptions: Record<string, string> = {
    'reactivation': 'réactiver des clients inactifs',
    'promo': 'proposer une offre promotionnelle',
    'rappel-rdv': 'rappeler un rendez-vous',
    'avis': 'demander un avis client',
    'nouveaute': 'annoncer une nouveauté',
    'fidelite': 'promouvoir le programme de fidélité',
  }
  return descriptions[objective] || objective
}

function getFormalityInstruction(formality: string): string {
  switch (formality) {
    case 'vouvoiement':
      return 'Vouvoie toujours le client.'
    case 'tutoiement':
      return 'Tutoie le client de manière naturelle.'
    case 'adaptatif':
      return 'Adapte-toi au style du client : vouvoie par défaut, puis tutoie si le client te tutoie.'
    default:
      return 'Vouvoie le client.'
  }
}

function getEmojiInstruction(usage: string): string {
  switch (usage) {
    case 'jamais':
      return 'N\'utilise jamais d\'emojis.'
    case 'parfois':
      return 'Tu peux utiliser 1 ou 2 emojis par message pour rendre la conversation plus chaleureuse.'
    case 'souvent':
      return 'Utilise des emojis pour rendre les échanges plus vivants et sympathiques.'
    default:
      return ''
  }
}

function getResponseLengthInstruction(length: string): string {
  switch (length) {
    case 'courte':
      return 'Fais des réponses courtes et directes (1-2 phrases).'
    case 'moyenne':
      return 'Fais des réponses de longueur moyenne (3-4 phrases).'
    case 'detaillee':
      return 'N\'hésite pas à faire des réponses détaillées quand c\'est nécessaire.'
    default:
      return ''
  }
}

function getRoleDescription(role: string): string {
  const descriptions: Record<string, string> = {
    'questions': 'Répondre aux questions des clients',
    'rdv': 'Aider à la prise de rendez-vous',
    'qualify': 'Qualifier les prospects (comprendre leurs besoins)',
    'support': 'Assurer le support client',
    'info': 'Informer sur les produits et services',
    'devis': 'Aider à établir des devis',
  }
  return descriptions[role] || role
}

function getEscalationDescription(trigger: string): string {
  const descriptions: Record<string, string> = {
    'reclamation': 'Réclamations ou clients mécontents',
    'complex': 'Questions techniques ou complexes',
    'urgent': 'Demandes urgentes',
    'humain': 'Quand le client demande explicitement un humain',
    'prix-special': 'Demandes de prix personnalisés ou négociations',
  }
  return descriptions[trigger] || trigger
}

function getEscalationKeywords(trigger: string): string[] {
  const keywords: Record<string, string[]> = {
    'reclamation': ['réclamation', 'plainte', 'mécontent', 'énervé', 'scandaleux', 'inacceptable', 'remboursement'],
    'complex': ['technique', 'compliqué', 'je ne comprends pas'],
    'urgent': ['urgent', 'urgence', 'immédiatement', 'tout de suite'],
    'humain': ['humain', 'conseiller', 'parler à quelqu\'un', 'responsable', 'manager'],
    'prix-special': ['négocier', 'remise', 'réduction spéciale', 'prix de groupe'],
  }
  return keywords[trigger] || []
}

function extractStartTime(hours: string): string {
  const match = hours.match(/(\d{1,2})[h:](\d{2})/)
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`
  }
  return '09:00'
}

function extractEndTime(hours: string): string {
  const matches = hours.match(/(\d{1,2})[h:](\d{2})/g)
  if (matches && matches.length >= 2) {
    const lastMatch = matches[1].match(/(\d{1,2})[h:](\d{2})/)
    if (lastMatch) {
      return `${lastMatch[1].padStart(2, '0')}:${lastMatch[2]}`
    }
  }
  return '18:00'
}
