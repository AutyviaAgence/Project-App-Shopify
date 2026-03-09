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
} from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'

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
  client_id: string
  is_connected: boolean
  created_at: string
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  calendar: <Calendar className="h-5 w-5" />,
  'shopping-bag': <ShoppingBag className="h-5 w-5" />,
  'shopping-cart': <ShoppingCart className="h-5 w-5" />,
  'credit-card': <CreditCard className="h-5 w-5" />,
  table: <Table className="h-5 w-5" />,
  plug: <Plug className="h-5 w-5" />,
}

const TOOL_COLORS: Record<string, string> = {
  google_calendar: 'text-blue-500',
  shopify: 'text-green-500',
  woocommerce: 'text-purple-500',
  stripe: 'text-indigo-500',
  google_sheets: 'text-emerald-500',
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
    setSelectedCredentialId(null)
    setNewCredName('')
    // Default to existing if credentials available for OAuth tools
    const providerCreds = credentials.filter(c => c.provider === 'google')
    setCredentialMode(isOAuthTool(template.type) && providerCreds.length > 0 ? 'existing' : 'new')
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
      setCredentialMode(isOAuthTool(tool.tool_type) && credentials.filter(c => c.provider === 'google').length > 0 ? 'existing' : 'new')
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

      // Add custom functions if custom API
      if (selectedTemplate.type === 'custom' && customFunctions.length > 0) {
        config.functions = customFunctions.map(fn => ({
          ...fn,
          parameters: fn.parameters.filter(p => p.name.trim() !== ''),
        }))
      }

      // Resolve credential_id for OAuth tools
      let credentialId: string | null = null
      let clientIdForOAuth: string | undefined
      let clientSecretForOAuth: string | undefined

      if (isOAuthTool(selectedTemplate.type)) {
        if (credentialMode === 'existing' && selectedCredentialId) {
          credentialId = selectedCredentialId
          // Remove client_id/client_secret from tool config (they live in the credential)
          delete config.client_id
          delete config.client_secret
        } else if (credentialMode === 'new' && formConfig.client_id && formConfig.client_secret) {
          // Create new shared credential
          const credName = newCredName || `${selectedTemplate.name} - ${formName}`
          const credRes = await fetch('/api/credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: credName,
              provider: 'google',
              client_id: formConfig.client_id,
              client_secret: formConfig.client_secret,
            }),
          })
          const credJson = await credRes.json()
          if (!credRes.ok) throw new Error(credJson.error || 'Erreur création credential')
          credentialId = credJson.data.id
          clientIdForOAuth = formConfig.client_id
          clientSecretForOAuth = formConfig.client_secret
          // Remove from tool config
          delete config.client_id
          delete config.client_secret
          // Refresh credentials list
          fetchCredentials()
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
        if (cred) clientId = cred.client_id
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
      if (!res.ok) throw new Error()
      setTools(prev => prev.filter(t => t.id !== toolToDelete.id))
      toast.success(t('tools.tool_deleted'))
    } catch {
      toast.error(t('tools.delete_error'))
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <Wrench className="h-4 w-4" />
            {t('tools.title')}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('tools.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{tool.name}</span>
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

      {/* Catalog Dialog */}
      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="sm:max-w-2xl w-[95vw] max-h-[80vh] overflow-y-auto">
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
        <DialogContent className="sm:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
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
            <div className="space-y-4 mt-2">
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
              <div className="space-y-3 border-t pt-3">
                <Label className="text-xs font-medium">{t('tools.credentials')}</Label>

                {/* Credential selector for OAuth tools */}
                {isOAuthTool(selectedTemplate.type) && (
                  <div className="space-y-3">
                    {/* Mode toggle */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={credentialMode === 'existing' ? 'default' : 'outline'}
                        className="flex-1 text-xs h-8"
                        onClick={() => setCredentialMode('existing')}
                        disabled={credentials.filter(c => c.provider === 'google').length === 0}
                      >
                        Credential existant
                      </Button>
                      <Button
                        size="sm"
                        variant={credentialMode === 'new' ? 'default' : 'outline'}
                        className="flex-1 text-xs h-8"
                        onClick={() => setCredentialMode('new')}
                      >
                        Nouveau credential
                      </Button>
                    </div>

                    {credentialMode === 'existing' ? (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Sélectionner un credential Google</Label>
                        <Select
                          value={selectedCredentialId || ''}
                          onValueChange={(v) => setSelectedCredentialId(v || null)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir un credential..." />
                          </SelectTrigger>
                          <SelectContent>
                            {credentials
                              .filter(c => c.provider === 'google')
                              .map(c => (
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
                            <p className="text-[10px] text-muted-foreground">
                              Client ID: {cred.client_id.slice(0, 20)}... — {cred.is_connected ? 'Connecté' : 'Non connecté'}
                            </p>
                          ) : null
                        })()}

                        {/* Show non-OAuth fields (e.g. calendar_id, spreadsheet_id) */}
                        {selectedTemplate.auth_fields
                          .filter(f => f.key !== 'client_id' && f.key !== 'client_secret')
                          .map(field => (
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
                    ) : (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Nom du credential</Label>
                          <Input
                            placeholder="Ex: Mon Google Workspace"
                            value={newCredName}
                            onChange={e => setNewCredName(e.target.value)}
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Ce credential sera réutilisable sur d&apos;autres agents
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
                )}

                {/* Non-OAuth auth fields (Shopify, WooCommerce, Stripe, Custom) */}
                {!isOAuthTool(selectedTemplate.type) && (
                  <>
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
                  </>
                )}
              </div>

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
                    <div key={fn.name} className="flex items-center gap-2 p-2 rounded border">
                      <Badge variant={fn.permission === 'write' ? 'destructive' : 'secondary'} className="text-[10px] shrink-0">
                        {fn.permission}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{fn.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{fn.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Save */}
              <Button className="w-full" onClick={handleSaveTool} disabled={saving || !formName}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingTool
                  ? t('tools.update_tool')
                  : selectedTemplate?.auth_type === 'oauth2' ? (
                    <>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t('tools.save_and_connect')}
                    </>
                  ) : t('tools.save_tool')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
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
  return type === 'google_calendar' || type === 'google_sheets'
}

function getIconForType(type: string): string {
  const iconMap: Record<string, string> = {
    google_calendar: 'calendar',
    shopify: 'shopping-bag',
    woocommerce: 'shopping-cart',
    stripe: 'credit-card',
    google_sheets: 'table',
    custom: 'plug',
  }
  return iconMap[type] || 'plug'
}
