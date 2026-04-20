'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from '@/i18n/context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  Loader2,
  Calendar,
  ShoppingBag,
  ShoppingCart,
  CreditCard,
  Table,
  Plug,
  Wrench,
  Eye,
  Pencil,
  ChevronLeft,
  ExternalLink,
  CheckCircle,
  Copy,
  Check,
  KeyRound,
  MessageSquare,
  Mail,
  MapPin,
  Bell,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'

type WASession = {
  id: string
  instance_name: string
  display_name: string | null
  phone_number: string | null
  status: string
  integration_type: string
}

type WAContact = {
  id: string
  phone_number: string
  name: string | null
  first_name: string | null
  last_name: string | null
}

type ToolTemplate = {
  type: string
  name: string
  description: string
  icon: string
  auth_type: string
  auth_fields: { key: string; label: string; placeholder: string; secret: boolean }[]
  functions: { name: string; description: string; permission: string; parameters: unknown[] }[]
}

type AgentTool = {
  id: string
  agent_id: string
  tool_type: string
  name: string
  description: string
  config: Record<string, unknown>
  permissions: string
  is_active: boolean
  rate_limit: number
  credential_id: string | null
  created_at: string
}

type OAuthCred = {
  id: string
  name: string
  provider: string
  credential_type: string
  client_id: string | null
  is_connected: boolean
  created_at: string
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  calendar: <Calendar className="h-5 w-5" />,
  'shopping-bag': <ShoppingBag className="h-5 w-5" />,
  'shopping-cart': <ShoppingCart className="h-5 w-5" />,
  'credit-card': <CreditCard className="h-5 w-5" />,
  table: <Table className="h-5 w-5" />,
  mail: <Mail className="h-5 w-5" />,
  'message-square': <MessageSquare className="h-5 w-5" />,
  plug: <Plug className="h-5 w-5" />,
  'map-pin': <MapPin className="h-5 w-5" />,
  bell: <Bell className="h-5 w-5" />,
}

const TOOL_COLORS: Record<string, string> = {
  google_calendar: 'text-blue-500',
  google_gmail: 'text-red-500',
  shopify: 'text-green-500',
  woocommerce: 'text-sky-500',
  stripe: 'text-indigo-500',
  google_sheets: 'text-emerald-500',
  whatsapp_message: 'text-green-600',
  distance_calculator: 'text-purple-500',
  app_notification: 'text-yellow-500',
  custom: 'text-orange-500',
}

export function AgentToolsManager({ agentId, agentName }: { agentId: string; agentName: string }) {
  const { t } = useTranslation()
  const [tools, setTools] = useState<AgentTool[]>([])
  const [templates, setTemplates] = useState<ToolTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Dialog states
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<ToolTemplate | null>(null)
  const [editingTool, setEditingTool] = useState<AgentTool | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toolToDelete, setToolToDelete] = useState<AgentTool | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  // Shared credentials
  const [credentials, setCredentials] = useState<OAuthCred[]>([])
  const [selectedCredentialId, setSelectedCredentialId] = useState<string | null>(null)
  const [credentialMode, setCredentialMode] = useState<'existing' | 'new'>('new')

  // Config form
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formPermissions, setFormPermissions] = useState('read')
  const [formRateLimit, setFormRateLimit] = useState('60')
  const [formConfig, setFormConfig] = useState<Record<string, string>>({})
  const [newCredName, setNewCredName] = useState('')

  // Custom API form
  const [customFunctions, setCustomFunctions] = useState<Array<{
    name: string; description: string; method: string; endpoint: string; permission: string
    parameters: Array<{ name: string; type: string; description: string; required: boolean }>
  }>>([])

  // WhatsApp Message tool
  const [waSessions, setWaSessions] = useState<WASession[]>([])
  const [waContacts, setWaContacts] = useState<WAContact[]>([])
  const [waContactsLoading, setWaContactsLoading] = useState(false)
  const [waSelectedContacts, setWaSelectedContacts] = useState<Set<string>>(new Set())
  const [waContactSearch, setWaContactSearch] = useState('')

  const fetchWaSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      const json = await res.json()
      if (res.ok) setWaSessions((json.data || []).filter((s: WASession) => s.status === 'connected'))
    } catch { /* silent */ }
  }, [])

  const fetchWaContacts = useCallback(async (sessionId: string) => {
    if (!sessionId) { setWaContacts([]); return }
    setWaContactsLoading(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/contacts`)
      const json = await res.json()
      if (res.ok) setWaContacts(json.data || [])
    } catch { /* silent */ }
    finally { setWaContactsLoading(false) }
  }, [])

  const fetchTools = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/tools`)
      const json = await res.json()
      if (res.ok) setTools(json.data || [])
    } catch {
      // Silent
    } finally {
      setLoading(false)
    }
  }, [agentId])

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/tools/templates')
      const json = await res.json()
      if (res.ok) setTemplates(json.data || [])
    } catch {
      // Silent
    }
  }, [])

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/credentials')
      const json = await res.json()
      if (res.ok) setCredentials(json.data || [])
    } catch {
      // Silent
    }
  }, [])

  useEffect(() => {
    fetchTools()
    fetchTemplates()
    fetchCredentials()

    // Handle OAuth callback params
    const params = new URLSearchParams(window.location.search)
    const oauthSuccess = params.get('oauth_success')
    const oauthError = params.get('oauth_error')
    if (oauthSuccess) {
      toast.success(t('tools.oauth_connected'))
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    } else if (oauthError) {
      toast.error(`OAuth: ${oauthError}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [fetchTools, fetchTemplates, fetchCredentials, t])

  function openCatalog() {
    setCatalogOpen(true)
  }

  function selectTemplate(template: ToolTemplate) {
    setSelectedTemplate(template)
    setEditingTool(null)
    setFormName(template.name)
    setFormDescription(template.description)
    setFormPermissions('read')
    setFormRateLimit('60')
    setFormConfig({})
    setCustomFunctions([])
    setVehiclesList([])
    setSelectedCredentialId(null)
    setNewCredName('')
    // WhatsApp Message: reset and load sessions
    setWaContacts([])
    setWaSelectedContacts(new Set())
    setWaContactSearch('')
    if (template.type === 'whatsapp_message') fetchWaSessions()
    // Default to existing if matching credentials are available
    const mapping = getCredentialMapping(template.type, template.auth_type)
    const matchingCreds = credentials.filter(c =>
      (c.credential_type || 'oauth2') === mapping.credentialType && c.provider === mapping.provider
    )
    setCredentialMode(supportsCredentials(template.type) && matchingCreds.length > 0 ? 'existing' : 'new')
    setCatalogOpen(false)
    setConfigOpen(true)
  }

  function openEditTool(tool: AgentTool) {
    // Find matching template
    const template = templates.find(t => t.type === tool.tool_type)
    if (!template) return

    setSelectedTemplate(template)
    setEditingTool(tool)
    setFormName(tool.name)
    setFormDescription(tool.description)
    setFormPermissions(tool.permissions)
    setFormRateLimit(String(tool.rate_limit))
    // Restore credential selection
    if (tool.credential_id) {
      setSelectedCredentialId(tool.credential_id)
      setCredentialMode('existing')
    } else {
      setSelectedCredentialId(null)
      const editMapping = getCredentialMapping(tool.tool_type, template.auth_type)
      const editMatchingCreds = credentials.filter(c =>
        (c.credential_type || 'oauth2') === editMapping.credentialType && c.provider === editMapping.provider
      )
      setCredentialMode(editMatchingCreds.length > 0 ? 'existing' : 'new')
    }
    setNewCredName('')
    // Pre-fill config (masked secrets show as empty — user can leave blank to keep existing)
    const configEntries: Record<string, string> = {}
    for (const field of template.auth_fields) {
      const val = tool.config[field.key]
      configEntries[field.key] = field.secret ? '' : (typeof val === 'string' ? val : '')
    }
    setFormConfig(configEntries)
    // Pre-fill custom functions with parameters when editing
    if (tool.tool_type === 'custom' && Array.isArray(tool.config.functions)) {
      setCustomFunctions(
        (tool.config.functions as Array<Record<string, unknown>>).map(fn => ({
          name: (fn.name as string) || '',
          description: (fn.description as string) || '',
          method: (fn.method as string) || 'GET',
          endpoint: (fn.endpoint as string) || '/',
          permission: (fn.permission as string) || 'read',
          parameters: Array.isArray(fn.parameters) ? (fn.parameters as Array<Record<string, unknown>>).map(p => ({
            name: (p.name as string) || '',
            type: (p.type as string) || 'string',
            description: (p.description as string) || '',
            required: !!p.required,
          })) : [],
        }))
      )
    } else {
      setCustomFunctions([])
    }
    // Distance calculator: restore vehicles list
    if (tool.tool_type === 'distance_calculator') {
      try {
        const raw = tool.config.vehicles as string
        const parsed: Array<{ name: string; price_per_km: string; minimum_price: string }> = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : [])
        setVehiclesList(parsed)
      } catch {
        setVehiclesList([])
      }
    } else {
      setVehiclesList([])
    }
    // WhatsApp Message: restore session + contacts
    setWaContactSearch('')
    if (tool.tool_type === 'whatsapp_message') {
      fetchWaSessions()
      const sid = tool.config.session_id as string
      if (sid) {
        // Load contacts from session to display checkboxes
        fetchWaContacts(sid).then(() => {
          // Restore previously selected contacts from config
          try {
            const raw = tool.config.contacts as string
            const parsed: Array<{ name: string; phone: string; contact_id?: string }> = typeof raw === 'string' ? JSON.parse(raw) : (raw || [])
            const ids = new Set(parsed.map(c => c.contact_id).filter(Boolean) as string[])
            setWaSelectedContacts(ids)
          } catch { setWaSelectedContacts(new Set()) }
        })
      }
    }
    setConfigOpen(true)
  }

  async function handleSaveTool() {
    if (!selectedTemplate) return
    setSaving(true)

    try {
      const config: Record<string, unknown> = {}
      // Only include non-empty values (empty secret fields = keep existing)
      for (const [key, value] of Object.entries(formConfig)) {
        if (value !== '') config[key] = value
      }

      // WhatsApp Message: serialize selected contacts into config
      if (selectedTemplate.type === 'whatsapp_message' && waSelectedContacts.size > 0) {
        const selectedArr = waContacts
          .filter(c => waSelectedContacts.has(c.id))
          .map(c => ({
            contact_id: c.id,
            name: c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone_number,
            phone: c.phone_number,
          }))
        config.contacts = JSON.stringify(selectedArr)
      }

      // Add vehicles list for distance_calculator
      if (selectedTemplate.type === 'distance_calculator' && vehiclesList.length > 0) {
        config.vehicles = JSON.stringify(vehiclesList.filter(v => v.name.trim() && v.price_per_km.trim()))
      }

      // Add custom functions if custom API
      if (selectedTemplate.type === 'custom' && customFunctions.length > 0) {
        config.functions = customFunctions.map(fn => ({
          ...fn,
          parameters: fn.parameters.filter(p => p.name.trim() !== ''),
        }))
      }

      // Resolve credential_id (OAuth and non-OAuth)
      let credentialId: string | null = null
      let clientIdForOAuth: string | undefined
      let clientSecretForOAuth: string | undefined

      if (supportsCredentials(selectedTemplate.type)) {
        if (credentialMode === 'existing' && selectedCredentialId) {
          credentialId = selectedCredentialId
          // Remove secret fields from tool config (they live in the credential)
          for (const field of selectedTemplate.auth_fields) {
            if (field.secret) delete config[field.key]
          }
          if (isOAuthTool(selectedTemplate.type)) {
            delete config.client_id
            delete config.client_secret
          }
        } else if (credentialMode === 'new') {
          const mapping = getCredentialMapping(selectedTemplate.type, formConfig.auth_type || selectedTemplate.auth_type)
          const secrets = extractSecrets(selectedTemplate.auth_fields, formConfig)

          if (isOAuthTool(selectedTemplate.type) && formConfig.client_id && formConfig.client_secret) {
            // OAuth credential
            const credName = newCredName || `${selectedTemplate.name} - ${formName}`
            const credRes = await fetch('/api/credentials', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: credName,
                provider: 'google',
                credential_type: 'oauth2',
                client_id: formConfig.client_id,
                client_secret: formConfig.client_secret,
              }),
            })
            const credJson = await credRes.json()
            if (!credRes.ok) throw new Error(credJson.error || 'Erreur création credential')
            credentialId = credJson.data.id
            clientIdForOAuth = formConfig.client_id
            clientSecretForOAuth = formConfig.client_secret
            delete config.client_id
            delete config.client_secret
            fetchCredentials()
          } else if (!isOAuthTool(selectedTemplate.type) && secrets && newCredName) {
            // Non-OAuth credential — create shared credential with secrets in metadata
            const credRes = await fetch('/api/credentials', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: newCredName,
                provider: mapping.provider,
                credential_type: mapping.credentialType,
                secrets,
              }),
            })
            const credJson = await credRes.json()
            if (!credRes.ok) throw new Error(credJson.error || 'Erreur création credential')
            credentialId = credJson.data.id
            // Remove secret fields from tool config
            for (const field of selectedTemplate.auth_fields) {
              if (field.secret) delete config[field.key]
            }
            fetchCredentials()
          }
          // If no credential name given for non-OAuth, secrets stay inline in config (backward compat)
        }
      }

      if (editingTool) {
        // UPDATE existing tool
        const res = await fetch(`/api/agents/${agentId}/tools/${editingTool.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName,
            description: formDescription,
            config: Object.keys(config).length > 0 ? config : undefined,
            permissions: formPermissions,
            rate_limit: parseInt(formRateLimit) || 60,
            credential_id: credentialId,
          }),
        })

        const json = await res.json()
        if (!res.ok) throw new Error(json.error)

        toast.success(t('tools.tool_updated'))
        setConfigOpen(false)
        setEditingTool(null)
        fetchTools()
      } else {
        // CREATE new tool
        const res = await fetch(`/api/agents/${agentId}/tools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool_type: selectedTemplate.type,
            name: formName,
            description: formDescription,
            config,
            permissions: formPermissions,
            rate_limit: parseInt(formRateLimit) || 60,
            credential_id: credentialId,
          }),
        })

        const json = await res.json()
        if (!res.ok) throw new Error(json.error)

        // For OAuth tools, trigger the OAuth flow if not yet connected
        const cred = credentialId ? credentials.find(c => c.id === credentialId) : null
        const needsOAuth = selectedTemplate.auth_type === 'oauth2' && (!cred || !cred.is_connected)
        if (needsOAuth) {
          const toolId = json.data?.id
          if (toolId) {
            // When using shared credential, server resolves client_id/secret from DB
            const oauthClientId = clientIdForOAuth || formConfig.client_id || ''
            const oauthClientSecret = clientSecretForOAuth || formConfig.client_secret || ''
            await startOAuthFlow(toolId, selectedTemplate.type, credentialId, oauthClientId, oauthClientSecret)
            return
          }
        }

        toast.success(t('tools.tool_created'))
        setConfigOpen(false)
        fetchTools()
      }
    } catch (err: any) {
      toast.error(err.message || t('tools.create_error'))
    } finally {
      setSaving(false)
    }
  }

  async function startOAuthFlow(
    toolId: string,
    toolType: string,
    credentialId?: string | null,
    clientId?: string,
    clientSecret?: string
  ) {
    try {
      const res = await fetch('/api/oauth/google/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientId || formConfig.client_id,
          clientSecret: clientSecret || formConfig.client_secret,
          toolId,
          agentId,
          toolType,
          credentialId: credentialId || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      // Redirect to Google OAuth consent screen
      window.location.href = json.url
    } catch (err: any) {
      toast.error(err.message || 'OAuth error')
      setSaving(false)
    }
  }

  async function handleReconnectOAuth(tool: AgentTool) {
    setSaving(true)
    try {
      // If tool uses shared credential, get client_id/secret from there
      let clientId = (tool.config.client_id as string) || ''
      let clientSecret = (tool.config.client_secret as string) || ''

      if (tool.credential_id) {
        const cred = credentials.find(c => c.id === tool.credential_id)
        if (cred) clientId = cred.client_id || ''
        // client_secret is masked — the authorize endpoint reads it from the credential
      }

      const res = await fetch('/api/oauth/google/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          clientSecret,
          toolId: tool.id,
          agentId,
          toolType: tool.tool_type,
          credentialId: tool.credential_id || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      window.location.href = json.url
    } catch (err: any) {
      toast.error(err.message || 'OAuth error')
      setSaving(false)
    }
  }

  async function handleToggleTool(tool: AgentTool) {
    try {
      const res = await fetch(`/api/agents/${agentId}/tools/${tool.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !tool.is_active }),
      })
      if (!res.ok) throw new Error()
      setTools(prev => prev.map(t => t.id === tool.id ? { ...t, is_active: !t.is_active } : t))
    } catch {
      toast.error(t('tools.update_error'))
    }
  }

  async function handleDeleteTool() {
    if (!toolToDelete) return

    try {
      const res = await fetch(`/api/agents/${agentId}/tools/${toolToDelete.id}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Erreur inconnue')
      setTools(prev => prev.filter(t => t.id !== toolToDelete.id))
      toast.success(t('tools.tool_deleted'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('tools.delete_error'))
    } finally {
      setDeleteDialogOpen(false)
      setToolToDelete(null)
    }
  }

  async function fetchLogs() {
    setLogsLoading(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/tools/logs?limit=50`)
      const json = await res.json()
      if (res.ok) setLogs(json.data || [])
    } catch {
      // Silent
    } finally {
      setLogsLoading(false)
    }
  }

  function openLogs() {
    setLogsOpen(true)
    fetchLogs()
  }

  // --- Distance calculator vehicles ---
  const [vehiclesList, setVehiclesList] = useState<Array<{ name: string; price_per_km: string; minimum_price: string }>>([])

  function addVehicle() {
    if (vehiclesList.length >= 10) return
    setVehiclesList(prev => [...prev, { name: '', price_per_km: '', minimum_price: '' }])
  }

  function removeVehicle(index: number) {
    setVehiclesList(prev => prev.filter((_, i) => i !== index))
  }

  function updateVehicle(index: number, field: 'name' | 'price_per_km' | 'minimum_price', value: string) {
    setVehiclesList(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v))
  }

  function addCustomFunction() {
    setCustomFunctions(prev => [...prev, {
      name: '', description: '', method: 'GET', endpoint: '/', permission: 'read',
      parameters: [],
    }])
  }

  function addFunctionParam(fnIndex: number) {
    setCustomFunctions(prev => prev.map((fn, i) =>
      i === fnIndex ? { ...fn, parameters: [...fn.parameters, { name: '', type: 'string', description: '', required: false }] } : fn
    ))
  }

  function updateFunctionParam(fnIndex: number, paramIndex: number, field: string, value: string | boolean) {
    setCustomFunctions(prev => prev.map((fn, i) =>
      i === fnIndex ? {
        ...fn,
        parameters: fn.parameters.map((p, j) => j === paramIndex ? { ...p, [field]: value } : p),
      } : fn
    ))
  }

  function removeFunctionParam(fnIndex: number, paramIndex: number) {
    setCustomFunctions(prev => prev.map((fn, i) =>
      i === fnIndex ? { ...fn, parameters: fn.parameters.filter((_, j) => j !== paramIndex) } : fn
    ))
  }

  function updateCustomFunction(index: number, field: string, value: string) {
    setCustomFunctions(prev => prev.map((fn, i) =>
      i === index ? { ...fn, [field]: value } : fn
    ))
  }

  function removeCustomFunction(index: number) {
    setCustomFunctions(prev => prev.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <Wrench className="h-4 w-4 shrink-0" />
            {t('tools.title')}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {t('tools.subtitle')}
          </p>
        </div>
        <div className="flex gap-2 shrink-0 mr-6">
          {tools.length > 0 && (
            <Button size="sm" variant="outline" onClick={openLogs}>
              <Eye className="mr-1 h-3 w-3" />
              {t('tools.logs')}
            </Button>
          )}
          <Button size="sm" onClick={openCatalog}>
            <Plus className="mr-1 h-3 w-3" />
            {t('tools.add_tool')}
          </Button>
        </div>
      </div>

      {/* Tools list */}
      {tools.length === 0 ? (
        <div className="text-center py-6 border rounded-lg border-dashed">
          <Wrench className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">{t('tools.no_tools')}</p>
          <Button size="sm" variant="link" onClick={openCatalog} className="mt-1">
            {t('tools.add_first_tool')}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {tools.map((tool) => (
            <Card key={tool.id} className={!tool.is_active ? 'opacity-60' : ''}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className={TOOL_COLORS[tool.tool_type] || 'text-muted-foreground'}>
                    {TOOL_ICONS[getIconForType(tool.tool_type)] || <Plug className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate max-w-[150px]">{tool.name}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {tool.permissions === 'read_write' ? 'R/W' : tool.permissions === 'write' ? 'W' : 'R'}
                      </Badge>
                      {isOAuthTool(tool.tool_type) && (
                        tool.config.oauth_connected || (tool.credential_id && credentials.find(c => c.id === tool.credential_id)?.is_connected) ? (
                          <Badge variant="default" className="text-[10px] shrink-0 gap-1 bg-green-600">
                            <CheckCircle className="h-2.5 w-2.5" />
                            {t('tools.connected')}
                          </Badge>
                        ) : (
                          <Button size="sm" variant="outline" className="h-5 text-[10px] px-2 gap-1" onClick={() => handleReconnectOAuth(tool)}>
                            <ExternalLink className="h-2.5 w-2.5" />
                            {t('tools.connect')}
                          </Button>
                        )
                      )}
                      {tool.credential_id && (() => {
                        const cred = credentials.find(c => c.id === tool.credential_id)
                        return cred ? (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {cred.name}
                          </Badge>
                        ) : null
                      })()}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{tool.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => openEditTool(tool)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => { setToolToDelete(tool); setDeleteDialogOpen(true) }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Switch
                      checked={tool.is_active}
                      onCheckedChange={() => handleToggleTool(tool)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* OAuth Credentials */}
      {credentials.length > 0 && (
        <div className="space-y-2 mt-6">
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <KeyRound className="h-4 w-4" />
            Credentials OAuth
          </h3>
          <p className="text-xs text-muted-foreground">
            Vos credentials Google réutilisables sur tous vos agents.
          </p>
          <div className="space-y-2">
            {credentials.map(cred => (
              <Card key={cred.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate max-w-[180px]">{cred.name}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{cred.provider}</Badge>
                        {cred.is_connected ? (
                          <Badge variant="default" className="text-[10px] shrink-0 gap-1 bg-green-600">
                            <CheckCircle className="h-2.5 w-2.5" />
                            Connecté
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] shrink-0">Non connecté</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        Client ID: {cred.client_id?.slice(0, 25)}...
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                      onClick={async () => {
                        if (!confirm(`Supprimer "${cred.name}" ? Les outils associés perdront leur connexion OAuth.`)) return
                        try {
                          const res = await fetch(`/api/credentials/${cred.id}`, { method: 'DELETE' })
                          const body = await res.json()
                          if (!res.ok) throw new Error(body?.error || 'Erreur inconnue')
                          toast.success('Credential supprimé')
                          fetchCredentials()
                          fetchTools() // refresh tools that may have lost their credential
                        } catch (err) {
                          toast.error(`Erreur : ${err instanceof Error ? err.message : 'suppression échouée'}`)
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Catalog Dialog */}
      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{t('tools.catalog_title')}</DialogTitle>
            <DialogDescription>{t('tools.catalog_desc')}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            {templates.map((template) => (
              <button
                key={template.type}
                onClick={() => selectTemplate(template)}
                className="p-4 rounded-lg border text-left transition-colors hover:border-[#7DC2A5] hover:bg-[#7DC2A5]/5"
              >
                <div className={`mb-2 ${TOOL_COLORS[template.type] || 'text-muted-foreground'}`}>
                  {TOOL_ICONS[template.icon] || <Plug className="h-5 w-5" />}
                </div>
                <p className="text-sm font-medium">{template.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                {template.functions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {template.functions.map(fn => (
                      <Badge key={fn.name} variant="secondary" className="text-[10px]">
                        {fn.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Config Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {!editingTool && (
                <button onClick={() => { setConfigOpen(false); setCatalogOpen(true) }} className="hover:opacity-70">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {editingTool ? t('tools.edit_tool') : selectedTemplate?.name}
            </DialogTitle>
            <DialogDescription>{editingTool ? t('tools.edit_desc') : t('tools.config_desc')}</DialogDescription>
          </DialogHeader>

          {selectedTemplate && (
            <div className="space-y-4 mt-2 overflow-hidden">
              {/* Name & Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('tools.tool_name')}</Label>
                  <Input value={formName} onChange={e => setFormName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('tools.rate_limit')}</Label>
                  <Input type="number" value={formRateLimit} onChange={e => setFormRateLimit(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t('tools.tool_description')}</Label>
                <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={2} />
              </div>

              {/* Permissions */}
              <div className="space-y-1">
                <Label className="text-xs">{t('tools.permissions')}</Label>
                <Select value={formPermissions} onValueChange={setFormPermissions}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">{t('tools.read_only')}</SelectItem>
                    <SelectItem value="write">{t('tools.write_only')}</SelectItem>
                    <SelectItem value="read_write">{t('tools.read_write')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* OAuth redirect URI helper */}
              {isOAuthTool(selectedTemplate.type) && (
                <OAuthRedirectUri />
              )}

              {/* Auth fields */}
              {supportsCredentials(selectedTemplate.type) && (
              <div className="space-y-3 border-t pt-3">
                <Label className="text-xs font-medium">{t('tools.credentials')}</Label>

                {/* Unified credential selector for all tool types */}
                {(() => {
                  const mapping = getCredentialMapping(selectedTemplate.type, formConfig.auth_type || selectedTemplate.auth_type)
                  const matchingCreds = credentials.filter(c => {
                    const credType = c.credential_type || 'oauth2'
                    // For custom tools, show all non-OAuth credentials
                    if (selectedTemplate.type === 'custom') return credType !== 'oauth2'
                    // For template tools, match by credential_type and provider
                    return credType === mapping.credentialType && c.provider === mapping.provider
                  })
                  const hasSecretFields = selectedTemplate.auth_fields.some(f => f.secret)

                  return hasSecretFields ? (
                  <div className="space-y-3">
                    {/* Mode toggle */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={credentialMode === 'existing' ? 'default' : 'outline'}
                        className="flex-1 text-xs h-8 min-w-0"
                        onClick={() => setCredentialMode('existing')}
                        disabled={matchingCreds.length === 0}
                      >
                        {t('tools.cred_existing')}
                      </Button>
                      <Button
                        size="sm"
                        variant={credentialMode === 'new' ? 'default' : 'outline'}
                        className="flex-1 text-xs h-8 min-w-0"
                        onClick={() => setCredentialMode('new')}
                      >
                        {t('tools.cred_new')}
                      </Button>
                    </div>

                    {credentialMode === 'existing' ? (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">{t('tools.select_credential')}</Label>
                        <Select
                          value={selectedCredentialId || ''}
                          onValueChange={(v) => setSelectedCredentialId(v || null)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('tools.choose_credential')} />
                          </SelectTrigger>
                          <SelectContent>
                            {matchingCreds.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                  <span className="flex items-center gap-2">
                                    {c.name}
                                    {c.is_connected && (
                                      <CheckCircle className="h-3 w-3 text-green-500 inline" />
                                    )}
                                  </span>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        {selectedCredentialId && (() => {
                          const cred = credentials.find(c => c.id === selectedCredentialId)
                          return cred ? (
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] text-muted-foreground">
                                {cred.client_id ? `Client ID: ${cred.client_id.slice(0, 20)}...` : cred.name}
                                {' — '}{cred.is_connected ? t('tools.connected') : t('tools.not_connected')}
                              </p>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                onClick={async () => {
                                  if (!confirm(t('tools.delete_credential_confirm'))) return
                                  try {
                                    const res = await fetch(`/api/credentials/${cred.id}`, { method: 'DELETE' })
                                    if (!res.ok) throw new Error('Erreur suppression')
                                    toast.success(t('tools.credential_deleted'))
                                    setSelectedCredentialId(null)
                                    fetchCredentials()
                                  } catch {
                                    toast.error(t('tools.credential_delete_error'))
                                  }
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : null
                        })()}

                        {/* Show non-secret fields (e.g. calendar_id, shop_url, base_url) */}
                        {selectedTemplate.auth_fields
                          .filter(f => !f.secret && f.key !== 'client_id' && f.key !== 'client_secret')
                          .map(field => (
                            <div key={field.key} className="space-y-1">
                              <Label className="text-xs text-muted-foreground">{field.label}</Label>
                              <Input
                                type="text"
                                placeholder={field.placeholder}
                                value={formConfig[field.key] || ''}
                                onChange={e => setFormConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                              />
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('tools.cred_name')}</Label>
                          <Input
                            placeholder={isOAuthTool(selectedTemplate.type) ? 'Ex: Mon Google Workspace' : `Ex: ${selectedTemplate.name} credentials`}
                            value={newCredName}
                            onChange={e => setNewCredName(e.target.value)}
                          />
                          <p className="text-[10px] text-muted-foreground">
                            {t('tools.cred_reusable_hint')}
                          </p>
                        </div>
                        {editingTool && (
                          <p className="text-[10px] text-muted-foreground">{t('tools.edit_secret_hint')}</p>
                        )}
                        {selectedTemplate.auth_fields.map(field => (
                          <div key={field.key} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{field.label}</Label>
                            <Input
                              type={field.secret ? 'password' : 'text'}
                              placeholder={editingTool && field.secret ? '••••••••' : field.placeholder}
                              value={formConfig[field.key] || ''}
                              onChange={e => setFormConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  ) : (
                    // No secret fields — just show non-secret config fields
                    <>
                      {selectedTemplate.auth_fields.map(field => (
                        <div key={field.key} className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{field.label}</Label>
                          <Input
                            placeholder={field.placeholder}
                            value={formConfig[field.key] || ''}
                            onChange={e => setFormConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </>
                  )
                })()}
              </div>
              )}

                {/* WhatsApp Message — session selector + contact picker + delay */}
                {selectedTemplate.type === 'whatsapp_message' && (
                  <div className="space-y-4">
                    {/* Session selector */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Session WhatsApp (compte d&apos;envoi)</Label>
                      <Select
                        value={formConfig.session_id || ''}
                        onValueChange={(v) => {
                          setFormConfig(prev => ({ ...prev, session_id: v }))
                          setWaContacts([])
                          setWaSelectedContacts(new Set())
                          setWaContactSearch('')
                          if (v) fetchWaContacts(v)
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir une session..." />
                        </SelectTrigger>
                        <SelectContent>
                          {waSessions.map(s => (
                            <SelectItem key={s.id} value={s.id}>
                              <span className="flex items-center gap-2">
                                {s.display_name || s.instance_name}
                                {s.phone_number && (
                                  <span className="text-muted-foreground text-xs">({s.phone_number})</span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {waSessions.length === 0 && (
                        <p className="text-[10px] text-muted-foreground">Aucune session connectée trouvée</p>
                      )}
                    </div>

                    {/* Contact picker */}
                    {formConfig.session_id && (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          Contacts autorisés ({waSelectedContacts.size} sélectionné{waSelectedContacts.size > 1 ? 's' : ''})
                        </Label>
                        <Input
                          placeholder="Rechercher un contact..."
                          value={waContactSearch}
                          onChange={e => setWaContactSearch(e.target.value)}
                          className="h-8 text-xs"
                        />
                        <div className="border rounded-lg max-h-48 overflow-y-auto">
                          {waContactsLoading ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          ) : waContacts.length === 0 ? (
                            <p className="text-xs text-muted-foreground p-3">Aucun contact pour cette session</p>
                          ) : (
                            waContacts
                              .filter(c => {
                                if (!waContactSearch) return true
                                const search = waContactSearch.toLowerCase()
                                const displayName = c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone_number
                                return displayName.toLowerCase().includes(search) || c.phone_number.includes(search)
                              })
                              .map(c => {
                                const displayName = c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone_number
                                const isSelected = waSelectedContacts.has(c.id)
                                return (
                                  <label
                                    key={c.id}
                                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                                  >
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={(checked) => {
                                        setWaSelectedContacts(prev => {
                                          const next = new Set(prev)
                                          if (checked) next.add(c.id)
                                          else next.delete(c.id)
                                          return next
                                        })
                                      }}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium truncate">{displayName}</p>
                                      {displayName !== c.phone_number && (
                                        <p className="text-[10px] text-muted-foreground">{c.phone_number}</p>
                                      )}
                                    </div>
                                  </label>
                                )
                              })
                          )}
                        </div>
                      </div>
                    )}

                    {/* Send delay */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Délai avant envoi (secondes)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="300"
                        placeholder="0"
                        value={formConfig.send_delay || ''}
                        onChange={e => setFormConfig(prev => ({ ...prev, send_delay: e.target.value }))}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Temps d&apos;attente avant l&apos;envoi du message (0 = immédiat, max 300s)
                      </p>
                    </div>
                  </div>
                )}

              {/* Distance Calculator — vehicles list */}
              {selectedTemplate.type === 'distance_calculator' && (
                <div className="space-y-3 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Véhicules ({vehiclesList.length}/10)</Label>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addVehicle}
                      disabled={vehiclesList.length >= 10}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Ajouter un véhicule
                    </Button>
                  </div>
                  {vehiclesList.length === 0 && (
                    <p className="text-xs text-muted-foreground">Aucun véhicule configuré. Ajoutez au moins un véhicule.</p>
                  )}
                  {vehiclesList.map((v, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                      <div className="flex-1 space-y-1.5">
                        <Input
                          placeholder="Nom du véhicule (ex: Berline, Van, Moto...)"
                          value={v.name}
                          onChange={e => updateVehicle(i, 'name', e.target.value)}
                          className="h-7 text-xs"
                        />
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 flex-1">
                            <Input
                              placeholder="Prix/km"
                              value={v.price_per_km}
                              onChange={e => updateVehicle(i, 'price_per_km', e.target.value)}
                              className="h-7 text-xs"
                              type="number"
                              step="0.01"
                              min="0"
                            />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">€/km</span>
                          </div>
                          <div className="flex items-center gap-1 flex-1">
                            <Input
                              placeholder="Min (€)"
                              value={v.minimum_price}
                              onChange={e => updateVehicle(i, 'minimum_price', e.target.value)}
                              className="h-7 text-xs"
                              type="number"
                              step="1"
                              min="0"
                            />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">€ min</span>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeVehicle(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Custom API functions */}
              {selectedTemplate.type === 'custom' && (
                <div className="space-y-3 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">{t('tools.functions')}</Label>
                    <Button size="sm" variant="outline" onClick={addCustomFunction}>
                      <Plus className="mr-1 h-3 w-3" />
                      {t('tools.add_function')}
                    </Button>
                  </div>
                  {customFunctions.map((fn, i) => (
                    <div key={i} className="space-y-2 p-3 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{t('tools.function')} {i + 1}</span>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => removeCustomFunction(i)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input placeholder={t('tools.function_name')} value={fn.name} onChange={e => updateCustomFunction(i, 'name', e.target.value)} />
                        <Select value={fn.method} onValueChange={v => updateCustomFunction(i, 'method', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GET">GET</SelectItem>
                            <SelectItem value="POST">POST</SelectItem>
                            <SelectItem value="PUT">PUT</SelectItem>
                            <SelectItem value="PATCH">PATCH</SelectItem>
                            <SelectItem value="DELETE">DELETE</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Input placeholder={t('tools.endpoint')} value={fn.endpoint} onChange={e => updateCustomFunction(i, 'endpoint', e.target.value)} />
                      <Textarea placeholder={t('tools.function_desc')} value={fn.description} onChange={e => updateCustomFunction(i, 'description', e.target.value)} rows={2} />
                      <Select value={fn.permission} onValueChange={v => updateCustomFunction(i, 'permission', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="read">{t('tools.read_only')}</SelectItem>
                          <SelectItem value="write">{t('tools.write_only')}</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Parameters */}
                      <div className="space-y-2 mt-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] text-muted-foreground">{t('tools.parameters')}</Label>
                          <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5" onClick={() => addFunctionParam(i)}>
                            <Plus className="mr-0.5 h-2.5 w-2.5" />
                            {t('tools.add_param')}
                          </Button>
                        </div>
                        {fn.parameters.map((param, j) => (
                          <div key={j} className="grid grid-cols-[1fr_auto] gap-1.5 p-2 bg-muted/30 rounded-md">
                            <div className="grid grid-cols-2 gap-1.5">
                              <Input
                                className="h-7 text-xs"
                                placeholder={t('tools.param_name')}
                                value={param.name}
                                onChange={e => updateFunctionParam(i, j, 'name', e.target.value)}
                              />
                              <Select value={param.type} onValueChange={v => updateFunctionParam(i, j, 'type', v)}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="string">string</SelectItem>
                                  <SelectItem value="number">number</SelectItem>
                                  <SelectItem value="boolean">boolean</SelectItem>
                                  <SelectItem value="array">array</SelectItem>
                                  <SelectItem value="object">object</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => removeFunctionParam(i, j)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                            <Input
                              className="h-7 text-xs col-span-2"
                              placeholder={t('tools.param_desc')}
                              value={param.description}
                              onChange={e => updateFunctionParam(i, j, 'description', e.target.value)}
                            />
                            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground col-span-2">
                              <input
                                type="checkbox"
                                checked={param.required}
                                onChange={e => updateFunctionParam(i, j, 'required', e.target.checked)}
                                className="rounded"
                              />
                              {t('tools.param_required')}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Available functions (for templates) */}
              {selectedTemplate.type !== 'custom' && selectedTemplate.functions.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <Label className="text-xs font-medium">{t('tools.available_functions')}</Label>
                  {selectedTemplate.functions.map(fn => (
                    <div key={fn.name} className="flex items-start gap-2 p-2 rounded border overflow-hidden">
                      <Badge variant={fn.permission === 'write' ? 'destructive' : 'secondary'} className="text-[10px] shrink-0 mt-0.5">
                        {fn.permission}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium break-all">{fn.name}</p>
                        <p className="text-[10px] text-muted-foreground line-clamp-2">{fn.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Save */}
              <Button className="w-full truncate" onClick={handleSaveTool} disabled={saving || !formName}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" />}
                {editingTool
                  ? t('tools.update_tool')
                  : selectedTemplate?.auth_type === 'oauth2' ? (
                    <>
                      <ExternalLink className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">{t('tools.save_and_connect')}</span>
                    </>
                  ) : t('tools.save_tool')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{t('tools.logs_title')}</DialogTitle>
            <DialogDescription>{agentName}</DialogDescription>
          </DialogHeader>
          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t('tools.no_logs')}</p>
          ) : (
            <div className="space-y-2">
              {logs.map(log => (
                <div key={log.id} className="p-3 border rounded-lg text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={
                      log.status === 'success' ? 'default' :
                      log.status === 'error' ? 'destructive' :
                      'secondary'
                    } className="text-[10px]">
                      {log.status}
                    </Badge>
                    <span className="font-medium">{log.function_name}</span>
                    <span className="text-muted-foreground ml-auto">
                      {log.duration_ms}ms
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    {new Date(log.created_at).toLocaleString()}
                  </p>
                  {log.error_message && (
                    <p className="text-destructive mt-1">{log.error_message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteTool}
        title={t('tools.delete_title')}
        description={t('tools.delete_desc', { name: toolToDelete?.name || '' })}
      />
    </div>
  )
}

function OAuthRedirectUri() {
  const [copied, setCopied] = useState(false)
  const redirectUri = `${window.location.origin}/api/oauth/google/callback`

  function handleCopy() {
    navigator.clipboard.writeText(redirectUri)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <Label className="text-xs font-medium">URI de redirection autorisée</Label>
      <p className="text-[10px] text-muted-foreground">
        Copiez cette URL et ajoutez-la dans <strong>Google Cloud Console</strong> → Identifiants → votre Client OAuth → <strong>URI de redirection autorisés</strong>
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-[11px] bg-muted px-3 py-2 rounded-md border break-all select-all">
          {redirectUri}
        </code>
        <Button size="sm" variant="outline" className="h-8 w-8 p-0 shrink-0" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  )
}

function isOAuthTool(type: string): boolean {
  return type === 'google_calendar' || type === 'google_sheets' || type === 'google_gmail'
}

/** Returns true if the tool type supports shared credentials (all except whatsapp_message) */
function supportsCredentials(type: string): boolean {
  return type !== 'whatsapp_message'
}

/** Maps tool type → credential_type and provider for filtering shared credentials */
function getCredentialMapping(toolType: string, authType?: string): { credentialType: string; provider: string } {
  if (isOAuthTool(toolType)) return { credentialType: 'oauth2', provider: 'google' }
  if (toolType === 'shopify') return { credentialType: 'api_key', provider: 'shopify' }
  if (toolType === 'stripe') return { credentialType: 'api_key', provider: 'stripe' }
  if (toolType === 'woocommerce') return { credentialType: 'api_key', provider: 'woocommerce' }
  // Custom: match by auth_type
  if (authType === 'basic') return { credentialType: 'basic', provider: 'custom' }
  if (authType === 'bearer') return { credentialType: 'bearer', provider: 'custom' }
  return { credentialType: 'api_key', provider: 'custom' }
}

/** Get secret fields from auth_fields to store in credential metadata */
function extractSecrets(authFields: { key: string; secret: boolean }[], formConfig: Record<string, string>): Record<string, string> | null {
  const secrets: Record<string, string> = {}
  let hasValue = false
  for (const field of authFields) {
    if (field.secret && formConfig[field.key]) {
      secrets[field.key] = formConfig[field.key]
      hasValue = true
    }
  }
  return hasValue ? secrets : null
}

/** Get non-secret fields from auth_fields (e.g. shop_url, calendar_id) */
function getNonSecretFields(authFields: { key: string; secret: boolean }[]): string[] {
  return authFields.filter(f => !f.secret && f.key !== 'auth_type').map(f => f.key)
}

function getIconForType(type: string): string {
  const iconMap: Record<string, string> = {
    google_calendar: 'calendar',
    google_gmail: 'mail',
    shopify: 'shopping-bag',
    woocommerce: 'shopping-cart',
    stripe: 'credit-card',
    google_sheets: 'table',
    whatsapp_message: 'message-square',
    distance_calculator: 'map-pin',
    app_notification: 'bell',
    custom: 'plug',
  }
  return iconMap[type] || 'plug'
}
