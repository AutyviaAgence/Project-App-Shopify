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
import { useTranslation } from '@/i18n/context'

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
  { value: 'restaurant', labelKey: 'wizard.sector_restaurant' },
  { value: 'coiffure', labelKey: 'wizard.sector_beauty' },
  { value: 'ecommerce', labelKey: 'wizard.sector_ecommerce' },
  { value: 'immobilier', labelKey: 'wizard.sector_realestate' },
  { value: 'sante', labelKey: 'wizard.sector_health' },
  { value: 'services-b2b', labelKey: 'wizard.sector_b2b' },
  { value: 'services-b2c', labelKey: 'wizard.sector_services' },
  { value: 'formation', labelKey: 'wizard.sector_training' },
  { value: 'artisan', labelKey: 'wizard.sector_craft' },
  { value: 'autre', labelKey: 'wizard.sector_other' },
]

const CONVERSATION_ROLES = [
  { value: 'questions', labelKey: 'wizard.mission_questions' },
  { value: 'rdv', labelKey: 'wizard.mission_booking' },
  { value: 'qualify', labelKey: 'wizard.mission_qualify' },
  { value: 'support', labelKey: 'wizard.mission_support' },
  { value: 'info', labelKey: 'wizard.mission_inform' },
  { value: 'devis', labelKey: 'wizard.mission_quotes' },
]

const ESCALATION_TRIGGERS = [
  { value: 'reclamation', labelKey: 'wizard.escalation_complaints' },
  { value: 'complex', labelKey: 'wizard.escalation_complex' },
  { value: 'urgent', labelKey: 'wizard.escalation_urgent' },
  { value: 'humain', labelKey: 'wizard.escalation_request' },
  { value: 'prix-special', labelKey: 'wizard.escalation_prices' },
]

const CAMPAIGN_OBJECTIVES = [
  { value: 'reactivation', labelKey: 'wizard.objective_reactivate' },
  { value: 'promo', labelKey: 'wizard.objective_offer' },
  { value: 'rappel-rdv', labelKey: 'wizard.objective_reminder' },
  { value: 'avis', labelKey: 'wizard.objective_review' },
  { value: 'nouveaute', labelKey: 'wizard.objective_news' },
  { value: 'fidelite', labelKey: 'wizard.objective_loyalty' },
]

const TONES = [
  { value: 'professionnel', labelKey: 'wizard.tone_professional', descKey: 'wizard.tone_professional_desc' },
  { value: 'amical', labelKey: 'wizard.tone_friendly', descKey: 'wizard.tone_friendly_desc' },
  { value: 'decontracte', labelKey: 'wizard.tone_casual', descKey: 'wizard.tone_casual_desc' },
  { value: 'premium', labelKey: 'wizard.tone_luxury', descKey: 'wizard.tone_luxury_desc' },
]

const FORMALITY = [
  { value: 'vouvoiement', labelKey: 'wizard.formality_formal' },
  { value: 'tutoiement', labelKey: 'wizard.formality_informal' },
  { value: 'adaptatif', labelKey: 'wizard.formality_adaptive' },
]

const EMOJI_USAGE = [
  { value: 'jamais', labelKey: 'wizard.emoji_never' },
  { value: 'parfois', labelKey: 'wizard.emoji_sometimes' },
  { value: 'souvent', labelKey: 'wizard.emoji_often' },
]

const RESPONSE_LENGTHS = [
  { value: 'courte', labelKey: 'wizard.length_short' },
  { value: 'moyenne', labelKey: 'wizard.length_medium' },
  { value: 'detaillee', labelKey: 'wizard.length_detailed' },
]

const STEPS = [
  { id: 1, titleKey: 'wizard.step_type', icon: Bot },
  { id: 2, titleKey: 'wizard.step_identity', icon: Building2 },
  { id: 3, titleKey: 'wizard.step_role', icon: Target },
  { id: 4, titleKey: 'wizard.step_tone', icon: MessageSquare },
  { id: 5, titleKey: 'wizard.step_business', icon: Building2 },
  { id: 6, titleKey: 'wizard.step_limits', icon: Shield },
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
  const { t } = useTranslation()
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
    parts.push(`\nSecteur : ${(() => { const found = BUSINESS_SECTORS.find(s => s.value === data.businessSector); return found ? t(found.labelKey) : data.businessSector; })()}`)

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
      escalation_keywords: data.escalationTriggers.flatMap(trigger => getEscalationKeywords(trigger)),
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
            {t('wizard.title')}
          </DialogTitle>
          <DialogDescription>
            {t('wizard.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('wizard.step_x_of_y', { x: String(step), y: String(totalSteps) })}</span>
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
                <span className="hidden sm:block">{t(s.titleKey)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Étape 1: Type d'agent */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium">{t('wizard.type_question')}</h3>
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
                    <p className="font-medium">{t('wizard.type_conversation')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('wizard.type_conversation_desc')}
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
                    <p className="font-medium">{t('wizard.type_relance')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('wizard.type_relance_desc')}
                    </p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Étape 2: Identité */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-medium">{t('wizard.identity_title')}</h3>

              <div className="space-y-2">
                <Label htmlFor="businessName">{t('wizard.company_name')}</Label>
                <Input
                  id="businessName"
                  placeholder={t('wizard.company_placeholder')}
                  value={data.businessName}
                  onChange={(e) => updateData('businessName', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessSector">{t('wizard.sector')}</Label>
                <Select value={data.businessSector} onValueChange={(v) => updateData('businessSector', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('wizard.sector_placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {BUSINESS_SECTORS.map((sector) => (
                      <SelectItem key={sector.value} value={sector.value}>
                        {t(sector.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessDescription">{t('wizard.company_desc')}</Label>
                <Textarea
                  id="businessDescription"
                  placeholder={t('wizard.company_desc_placeholder')}
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
                  <h3 className="font-medium">{t('wizard.role_title')}</h3>

                  <div className="space-y-2">
                    <Label>{t('wizard.missions')}</Label>
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
                          {t(role.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>{t('wizard.can_give_prices')}</Label>
                        <p className="text-xs text-muted-foreground">{t('wizard.prices_desc')}</p>
                      </div>
                      <Checkbox
                        checked={data.canGivePrices}
                        onCheckedChange={(checked) => updateData('canGivePrices', checked === true)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>{t('wizard.can_book')}</Label>
                        <p className="text-xs text-muted-foreground">{t('wizard.book_desc')}</p>
                      </div>
                      <Checkbox
                        checked={data.canBookAppointments}
                        onCheckedChange={(checked) => updateData('canBookAppointments', checked === true)}
                      />
                    </div>

                    {data.canBookAppointments && (
                      <div className="space-y-2 pl-4">
                        <Label htmlFor="bookingUrl">{t('wizard.booking_link')}</Label>
                        <Input
                          id="bookingUrl"
                          type="url"
                          placeholder={t('wizard.booking_placeholder')}
                          value={data.bookingUrl}
                          onChange={(e) => updateData('bookingUrl', e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>{t('wizard.escalation_title')}</Label>
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
                          {t(trigger.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-medium">{t('wizard.relance_config_title')}</h3>

                  <div className="space-y-2">
                    <Label>{t('wizard.campaign_objective')}</Label>
                    <Select value={data.campaignObjective} onValueChange={(v) => updateData('campaignObjective', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('wizard.objective_placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {CAMPAIGN_OBJECTIVES.map((obj) => (
                          <SelectItem key={obj.value} value={obj.value}>
                            {t(obj.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hookMessage">{t('wizard.hook_message')}</Label>
                    <Textarea
                      id="hookMessage"
                      placeholder={t('wizard.hook_placeholder')}
                      value={data.hookMessage}
                      onChange={(e) => updateData('hookMessage', e.target.value)}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('wizard.hook_help')}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <Label>{t('wizard.continue_conversation')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('wizard.continue_desc')}
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
              <h3 className="font-medium">{t('wizard.tone_title')}</h3>

              <div className="space-y-2">
                <Label>{t('wizard.general_tone')}</Label>
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
                      <span className="font-medium">{t(tone.labelKey)}</span>
                      <span className="text-xs text-muted-foreground">{t(tone.descKey)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('wizard.formality')}</Label>
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
                      {t(f.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('wizard.emoji_usage')}</Label>
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
                      {t(e.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('wizard.response_length')}</Label>
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
                      {t(l.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Étape 5: Informations métier */}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-medium">{t('wizard.business_title')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('wizard.business_desc')}
              </p>

              <div className="space-y-2">
                <Label htmlFor="mainServices">{t('wizard.services')}</Label>
                <Textarea
                  id="mainServices"
                  placeholder={t('wizard.services_placeholder')}
                  value={data.mainServices}
                  onChange={(e) => updateData('mainServices', e.target.value)}
                  rows={4}
                />
              </div>

              {data.canGivePrices && (
                <div className="space-y-2">
                  <Label htmlFor="mainPrices">{t('wizard.pricing')}</Label>
                  <Textarea
                    id="mainPrices"
                    placeholder={t('wizard.pricing_placeholder')}
                    value={data.mainPrices}
                    onChange={(e) => updateData('mainPrices', e.target.value)}
                    rows={3}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="businessHours">{t('wizard.hours')}</Label>
                <Textarea
                  id="businessHours"
                  placeholder={t('wizard.hours_placeholder')}
                  value={data.businessHours}
                  onChange={(e) => updateData('businessHours', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessAddress">{t('wizard.address')}</Label>
                <Input
                  id="businessAddress"
                  placeholder={t('wizard.address_placeholder')}
                  value={data.businessAddress}
                  onChange={(e) => updateData('businessAddress', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currentPromotions">{t('wizard.promotions')}</Label>
                <Textarea
                  id="currentPromotions"
                  placeholder={t('wizard.promotions_placeholder')}
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
              <h3 className="font-medium">{t('wizard.limits_title')}</h3>

              <div className="space-y-2">
                <Label htmlFor="forbiddenTopics">{t('wizard.forbidden_topics')}</Label>
                <Textarea
                  id="forbiddenTopics"
                  placeholder={t('wizard.forbidden_placeholder')}
                  value={data.forbiddenTopics}
                  onChange={(e) => updateData('forbiddenTopics', e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fallbackMessage">{t('wizard.fallback_message')}</Label>
                <Textarea
                  id="fallbackMessage"
                  placeholder={t('wizard.fallback_placeholder')}
                  value={data.fallbackMessage}
                  onChange={(e) => updateData('fallbackMessage', e.target.value)}
                  rows={2}
                />
              </div>

              {data.agentType === 'conversation' && (
                <div className="space-y-2">
                  <Label htmlFor="maxExchanges">{t('wizard.alert_threshold')}</Label>
                  <Input
                    id="maxExchanges"
                    type="number"
                    min={1}
                    max={20}
                    value={data.maxExchangesBeforeEscalation}
                    onChange={(e) => updateData('maxExchangesBeforeEscalation', parseInt(e.target.value) || 5)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('wizard.alert_help')}
                  </p>
                </div>
              )}

              {/* Summary */}
              <div className="rounded-lg border bg-muted/50 p-4 mt-6">
                <h4 className="font-medium mb-2">{t('wizard.summary')}</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• <strong>{t('wizard.summary_type')}</strong> {data.agentType === 'conversation' ? t('wizard.type_conversation_label') : t('wizard.type_relance_label')}</li>
                  <li>• <strong>{t('wizard.summary_company')}</strong> {data.businessName}</li>
                  <li>• <strong>{t('wizard.summary_tone')}</strong> {(() => { const found = TONES.find(item => item.value === data.tone); return found ? t(found.labelKey) : ''; })()}</li>
                  <li>• <strong>{t('wizard.summary_style')}</strong> {(() => { const found = FORMALITY.find(item => item.value === data.formality); return found ? t(found.labelKey) : ''; })()}</li>
                  {data.agentType === 'conversation' && data.roles.length > 0 && (
                    <li>• <strong>{t('wizard.summary_missions')}</strong> {data.roles.map(r => { const found = CONVERSATION_ROLES.find(cr => cr.value === r); return found ? t(found.labelKey) : ''; }).join(', ')}</li>
                  )}
                  {data.agentType === 'relance' && (
                    <li>• <strong>{t('wizard.summary_objective')}</strong> {(() => { const found = CAMPAIGN_OBJECTIVES.find(o => o.value === data.campaignObjective); return found ? t(found.labelKey) : ''; })()}</li>
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
            {step > 1 ? t('common.previous') : t('common.cancel')}
          </Button>

          {step < totalSteps ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
              {t('common.next')}
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={!canProceed() || generating}>
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('wizard.generating')}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t('wizard.create_agent')}
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
