/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2024-11-23T00:00:00Z
 * PURPOSE: Normalises the FastAPI pipeline details payload so the recovery UI can render
 *          resilient status, log, and artefact views even as the backend evolves field names.
 * SRP and DRY check: Pass - Handles client-side transformation/formatting for pipeline detail
 *          display without duplicating fetching logic elsewhere in the app.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, CheckCircle, XCircle, Clock, FileText, Activity, Terminal, ScrollText } from 'lucide-react'
import { getApiBaseUrl } from '@/lib/utils/api-config'

interface PipelineStageApiResponse {
  stage?: string
  status?: string
  timestamp?: string
  data?: Record<string, unknown> | null
  event_name?: string
  task_name?: string
  task_id?: string
}

interface NormalizedPipelineStage {
  id: string
  label: string
  status: string
  timestamp?: string
  taskId?: string
  raw: PipelineStageApiResponse
}

interface GeneratedFileApiResponse {
  filename?: string
  size_bytes?: number
  size?: number
  modified_at?: number | string
  created_at?: string
}

interface NormalizedGeneratedFile {
  filename: string
  sizeBytes: number
  modifiedAt: number
}

interface PipelineDetailsApiResponse {
  plan_id?: string
  run_directory?: string
  pipeline_stages?: PipelineStageApiResponse[]
  pipeline_log?: string
  generated_files?: GeneratedFileApiResponse[]
  total_files?: number
}

interface PipelineDetailsState {
  planId: string
  runDirectory: string
  pipelineStages: NormalizedPipelineStage[]
  pipelineLog: string
  generatedFiles: NormalizedGeneratedFile[]
  totalFiles: number
}

interface PipelineDetailsStateHook {
  details: PipelineDetailsState | null
  loading: boolean
  error: string | null
}

const usePipelineDetails = (planId: string): PipelineDetailsStateHook => {
  const [details, setDetails] = useState<PipelineDetailsState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch pipeline details from FastAPI backend
  const fetchDetails = useCallback(async () => {
    try {
      const baseUrl = getApiBaseUrl()
      const response = await fetch(`${baseUrl}/api/plans/${planId}/details`)
      if (response.ok) {
        const detailsData: PipelineDetailsApiResponse = await response.json()
        const normalizedStages: NormalizedPipelineStage[] = Array.isArray(detailsData.pipeline_stages)
          ? detailsData.pipeline_stages
              .filter((stageEntry): stageEntry is PipelineStageApiResponse => Boolean(stageEntry))
              .map((stageEntry, index) => {
                const data = stageEntry.data ?? {}
                const possibleLabels = [
                  typeof data === 'object' && data && 'task_name' in data
                    ? String((data as Record<string, unknown>).task_name ?? '')
                    : '',
                  stageEntry.task_name ?? '',
                  stageEntry.stage ?? '',
                ].filter((value) => typeof value === 'string' && value.trim().length > 0)
                const label = possibleLabels[0]?.trim() || `Stage ${index + 1}`
                const taskIdCandidate =
                  typeof data === 'object' && data && 'task_id' in data
                    ? String((data as Record<string, unknown>).task_id ?? '')
                    : ''
                const timestampCandidate =
                  (typeof stageEntry.timestamp === 'string' && stageEntry.timestamp) ||
                  (typeof data === 'object' && data && 'timestamp' in data
                    ? String((data as Record<string, unknown>).timestamp ?? '')
                    : '')
                const normalizedStatus =
                  stageEntry.status ||
                  stageEntry.event_name ||
                  (typeof data === 'object' && data && 'status' in data
                    ? String((data as Record<string, unknown>).status ?? '')
                    : '') ||
                  'UNKNOWN'

                return {
                  id: `${stageEntry.stage ?? 'stage'}-${index}`,
                  label,
                  status: normalizedStatus,
                  timestamp: timestampCandidate || undefined,
                  taskId: stageEntry.task_id || taskIdCandidate || undefined,
                  raw: stageEntry,
                }
              })
          : []

        const normalizedFiles: NormalizedGeneratedFile[] = Array.isArray(detailsData.generated_files)
          ? detailsData.generated_files
              .filter((fileEntry): fileEntry is GeneratedFileApiResponse => Boolean(fileEntry?.filename))
              .map((fileEntry) => {
                const created = fileEntry.created_at || fileEntry.modified_at
                const timestamp = typeof created === 'string' ? Date.parse(created) : Number(created)
                const safeTimestamp = Number.isFinite(timestamp) ? Number(timestamp) : 0
                const size =
                  (typeof fileEntry.size === 'number' && fileEntry.size >= 0 && fileEntry.size) ||
                  (typeof fileEntry.size_bytes === 'number' && fileEntry.size_bytes >= 0 && fileEntry.size_bytes) ||
                  0
                return {
                  filename: fileEntry.filename ?? 'unknown',
                  sizeBytes: size,
                  modifiedAt: safeTimestamp,
                }
              })
          : []

        const transformedDetails: PipelineDetailsState = {
          planId: detailsData.plan_id ?? planId,
          runDirectory: detailsData.run_directory ?? '',
          pipelineStages: normalizedStages,
          pipelineLog: detailsData.pipeline_log ?? '',
          generatedFiles: normalizedFiles,
          totalFiles: detailsData.total_files ?? normalizedFiles.length,
        }

        setDetails(transformedDetails)
        setError(null)
      } else {
        // Silently handle 404 - details endpoint may not exist yet
        if (response.status === 404) {
          setError(null)
        } else {
          setError(`Failed to fetch details: ${response.status}`)
        }
      }
    } catch (err) {
      // Silently handle network errors during polling
      console.debug(`Pipeline details fetch error: ${err}`)
    } finally {
      setLoading(false)
    }
  }, [planId])

  // 3-second polling
  useEffect(() => {
    setLoading(true)
    fetchDetails()
    const interval = setInterval(fetchDetails, 3000)
    return () => clearInterval(interval)
  }, [planId, fetchDetails])

  return { details, loading, error }
}

interface PipelineDetailsProps {
  planId: string
  className?: string
}

export function PipelineDetails({ planId, className }: PipelineDetailsProps) {
  const { details, loading, error } = usePipelineDetails(planId)

  const getStageIcon = (status: string) => {
    const normalized = status.toUpperCase()
    switch (normalized) {
      case 'PROCESSING':
      case 'RUNNING':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case 'SUCCESS':
      case 'DONE':
      case 'COMPLETED':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'FAILURE':
      case 'ERROR':
      case 'FAILED':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'START':
      case 'PENDING':
        return <Clock className="h-4 w-4 text-yellow-500" />
      default:
        return <Activity className="h-4 w-4 text-gray-500" />
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const parsed = Date.parse(timestamp)
    if (Number.isNaN(parsed)) {
      return timestamp
    }
    return new Date(parsed).toLocaleTimeString()
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatTaskName = (taskName: string) => {
    // Convert camelCase/PascalCase to readable format while respecting existing spacing
    if (taskName.includes(' ')) {
      return taskName.trim()
    }
    return taskName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim()
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Pipeline Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading pipeline details...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Pipeline Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-500 text-center p-8">{error}</div>
        </CardContent>
      </Card>
    )
  }

  if (!details) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Pipeline Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center p-8">No details available</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          Pipeline Details
        </CardTitle>
        <div className="flex gap-2">
          <Badge variant="outline">{details.pipelineStages.length} stages</Badge>
          <Badge variant="outline">{details.totalFiles} files</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="stages" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="stages">Stages</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
          </TabsList>

          <TabsContent value="stages" className="space-y-4">
            <div className="space-y-2">
              {details.pipelineStages.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No pipeline stages recorded yet
                </p>
              ) : (
                details.pipelineStages.map((stage, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50"
                  >
                    {getStageIcon(stage.status)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {formatTaskName(stage.label)}
                        </span>
                        <Badge
                          variant={(() => {
                            const normalized = stage.status.toUpperCase()
                            if (normalized === 'SUCCESS' || normalized === 'DONE' || normalized === 'COMPLETED') {
                              return 'default'
                            }
                            if (normalized === 'FAILURE' || normalized === 'ERROR' || normalized === 'FAILED') {
                              return 'destructive'
                            }
                            if (normalized === 'PROCESSING' || normalized === 'RUNNING') {
                              return 'secondary'
                            }
                            return 'outline'
                          })()}
                        >
                          {stage.status.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {stage.timestamp ? formatTimestamp(stage.timestamp) : 'Timestamp unavailable'}
                        {stage.taskId && (
                          <span className="ml-2 font-mono text-xs">
                            {stage.taskId}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
              {details.pipelineLog ? (
                <pre className="whitespace-pre-wrap">{details.pipelineLog}</pre>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  No logs available yet
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="files" className="space-y-4">
            <div className="space-y-2">
              {details.generatedFiles.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No files generated yet
                </p>
              ) : (
                details.generatedFiles
                  .sort((a, b) => b.modifiedAt - a.modifiedAt)
                  .map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-500" />
                        <span className="font-mono text-sm">{file.filename}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatFileSize(file.sizeBytes)}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

interface PipelineLogsPanelProps {
  planId: string
  className?: string
}

export function PipelineLogsPanel({ planId, className }: PipelineLogsPanelProps) {
  const { details, loading, error } = usePipelineDetails(planId)

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="px-3 py-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ScrollText className="h-4 w-4" />
            Pipeline Logs
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="flex items-center justify-center rounded-md border border-slate-800/60 bg-slate-950/70 px-3 py-4 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            Loading latest log output…
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader className="px-3 py-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ScrollText className="h-4 w-4" />
            Pipeline Logs
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="rounded-md border border-red-500/40 bg-red-950/30 px-3 py-4 text-center text-xs text-red-300">
            {error}
          </div>
        </CardContent>
      </Card>
    )
  }

  const logContent = details?.pipelineLog ?? ''

  return (
    <Card className={className}>
      <CardHeader className="px-3 py-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ScrollText className="h-4 w-4" />
          Pipeline Logs
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div className="max-h-80 overflow-y-auto rounded-md border border-slate-800/60 bg-slate-950/80 px-3 py-3 font-mono text-[11px] leading-relaxed text-emerald-300">
          {logContent ? (
            <pre className="whitespace-pre-wrap">{logContent}</pre>
          ) : (
            <div className="py-4 text-center text-xs text-slate-400">
              No log entries available yet.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
