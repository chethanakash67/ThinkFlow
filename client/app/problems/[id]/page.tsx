'use client'

import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import ProtectedRoute from '@/components/ProtectedRoute'
import { LogicWorkspaceProvider, useLogicWorkspace, type LogicNode, type SyncMap } from '@/context/logic-workspace.context'
import { getCurrentUser, logout } from '@/lib/auth'
import api from '@/lib/api'
import { FaSignOutAlt, FaCheckCircle, FaTimesCircle, FaExclamationTriangle, FaArrowLeft, FaLightbulb, FaRobot, FaMoon, FaSun, FaEye, FaEyeSlash, FaInfoCircle } from 'react-icons/fa'
import dynamic from 'next/dynamic'
import './problem-detail.css'

const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="editor-loading-state">
      Loading compiler...
    </div>
  )
})

const DEFAULT_CUSTOM_INPUT = '{\n  "nums": [2, 7, 11, 15],\n  "target": 9\n}'
const DEFAULT_CUSTOM_EXPECTED = '[0, 1]'

interface LogicStep {
  step_number: number
  description: string
  type?: string
  complexity?: string
  isValid?: boolean | null
  starterComment?: string
  error?: string | null
}

interface EditorHint {
  title: string
  description: string
  snippet: string
}

interface LogicFeedbackNode {
  id: number
  status: 'correct' | 'warning' | 'error'
  message: string
}

interface LogicInsight {
  line: number
  type: 'error' | 'warning' | 'info'
  message: string
}

interface LogicValidationResult {
  overall_status: 'valid' | 'warning' | 'invalid'
  feedback_nodes: LogicFeedbackNode[]
  source?: string
}

type FlowNodeStatus = LogicFeedbackNode['status'] | 'idle'

const FATAL_DIAGNOSTIC_PHASES = new Set(['compile', 'runtime', 'time_limit', 'memory_limit', 'output_limit'])

const getPrimaryExecutionDiagnostic = (submission: any) => {
  if (!submission) return null

  const directDiagnostic = submission.errorDetails
  const fatalResult = Array.isArray(submission.results)
    ? submission.results.find((result: any) => FATAL_DIAGNOSTIC_PHASES.has(result?.errorDetails?.phase))
    : null
  const fallbackResult = Array.isArray(submission.results)
    ? submission.results.find((result: any) => result?.error)
    : null
  const sourceResult = fatalResult || (submission.status === 'error' ? fallbackResult : null)
  const diagnostic = directDiagnostic?.title || directDiagnostic?.message
    ? directDiagnostic
    : sourceResult?.errorDetails

  if (diagnostic?.title || diagnostic?.message) {
    return {
      ...diagnostic,
      input: sourceResult?.input,
      expectedOutput: sourceResult?.expectedOutput,
      actualOutput: sourceResult?.actualOutput,
      fallbackError: sourceResult?.error || submission.error,
    }
  }

  if (sourceResult?.error || submission.error) {
    const message = sourceResult?.error || submission.error
    return {
      phase: 'runtime',
      title: 'Execution Error',
      severity: 'error',
      message,
      raw: message,
      input: sourceResult?.input,
      expectedOutput: sourceResult?.expectedOutput,
      actualOutput: sourceResult?.actualOutput,
    }
  }

  return null
}

const getDiagnosticRawText = (diagnostic: any) => (
  String(diagnostic?.raw || diagnostic?.stderr || diagnostic?.fallbackError || diagnostic?.message || '').trim()
)

const normalizeLogicInsights = (payload: any): LogicInsight[] => {
  const rawInsights = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.insights)
      ? payload.insights
      : []
  const seen = new Set<string>()

  return rawInsights
    .map((insight: any) => {
      const line = Number(insight?.line)
      const type: LogicInsight['type'] = insight?.type === 'error' || insight?.type === 'warning' || insight?.type === 'info'
        ? insight.type
        : 'warning'
      const message = String(insight?.message || '').trim()

      if (!Number.isFinite(line) || !message) return null

      return {
        line: Math.max(1, Math.round(line)),
        type,
        message
      }
    })
    .filter((insight: LogicInsight | null): insight is LogicInsight => {
      if (!insight) return false
      const key = `${insight.line}:${insight.type}:${insight.message.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

const buildProblemDescriptionForLogic = (currentProblem: any) => [
  currentProblem?.title,
  currentProblem?.description,
  currentProblem?.constraints,
  currentProblem?.examples ? JSON.stringify(currentProblem.examples) : ''
].filter(Boolean).join('\n')

const buildLogicValidationFromInsights = (insights: LogicInsight[]): LogicValidationResult => {
  const hasError = insights.some((insight) => insight.type === 'error')
  const hasWarning = insights.some((insight) => insight.type === 'warning')

  return {
    overall_status: hasError ? 'invalid' : hasWarning ? 'warning' : 'valid',
    feedback_nodes: insights.map((insight) => ({
      id: insight.line,
      status: insight.type === 'error' ? 'error' : insight.type === 'warning' ? 'warning' : 'correct',
      message: insight.message
    })),
    source: 'logic-analysis'
  }
}

const LOGIC_INSIGHT_SEVERITY: Record<LogicInsight['type'], number> = {
  info: 1,
  warning: 2,
  error: 3
}

const isCriticalMismatchInsight = (insight: LogicInsight) => /critical mismatch/i.test(insight.message)

const compactAuditorInsights = (insights: LogicInsight[]) => {
  const seen = new Set<string>()
  const uniqueInsights = insights.filter((insight) => {
    const key = `${insight.type}:${insight.message.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const criticalFindings = uniqueInsights.filter(isCriticalMismatchInsight)

  if (criticalFindings.length === 0) return uniqueInsights

  const primaryCritical = criticalFindings.find((insight) => (
    /\bfail cases\b|\brequires\b|\bshould produce\b|\bexample\b/i.test(insight.message)
  )) || criticalFindings[0]

  return [
    primaryCritical,
    {
      line: primaryCritical.line,
      type: 'warning' as const,
      message: 'Rewrite the Blueprint: calculate digit product for each number, sort by digit product ascending, then tie by actual value ascending.'
    }
  ]
}

interface UseSyncLogicOptions {
  enabled: boolean
  logicText: string
  problem: any
  language: string
  parseRequestRef: MutableRefObject<number>
  normalizeParsedNodes: (nodes: any[]) => LogicNode[]
  setNodes: (nodes: LogicNode[]) => void
  setSyncMap: (syncMap: SyncMap) => void
  setParsingLogic: (value: boolean) => void
}

const useSyncLogic = ({
  enabled,
  logicText,
  problem,
  language,
  parseRequestRef,
  normalizeParsedNodes,
  setNodes,
  setSyncMap,
  setParsingLogic
}: UseSyncLogicOptions) => {
  useEffect(() => {
    if (!enabled || !problem) return
    const trimmedLogic = logicText.trim()

    if (!trimmedLogic) {
      setNodes([])
      setSyncMap({})
      setParsingLogic(false)
      return
    }

    const requestId = parseRequestRef.current + 1
    parseRequestRef.current = requestId
    setParsingLogic(true)

    const timer = window.setTimeout(async () => {
      try {
        const response = await api.post('/parse-logic', {
          userLogic: trimmedLogic,
          problemContext: {
            title: problem?.title,
            description: problem?.description,
            constraints: problem?.constraints,
            examples: problem?.examples
          }
        })

        if (parseRequestRef.current !== requestId) return

        const parsedNodes = normalizeParsedNodes(response.data.nodes || [])
        setNodes(parsedNodes)
      } catch (error) {
        console.error('Logic parsing failed:', error)
      } finally {
        if (parseRequestRef.current === requestId) {
          setParsingLogic(false)
        }
      }
    }, 300)

    return () => window.clearTimeout(timer)
  }, [enabled, logicText, problem])
}

export default function ProblemDetailPage() {
  return (
    <LogicWorkspaceProvider>
      <ProblemDetailContent />
    </LogicWorkspaceProvider>
  )
}

function ProblemDetailContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const problemId = params.id as string
  const isCompetitionMode = searchParams.get('mode') === 'competition'
  const {
    nodes,
    setNodes,
    updateNode,
    code,
    setCode,
    syncMap,
    setSyncMap,
    activeLine,
    setActiveLine,
    focusedNodeId,
    setFocusedNodeId,
    implementedNodeIds,
    setImplementedNodeIds
  } = useLogicWorkspace()

  const [problem, setProblem] = useState<any>(null)
  const [englishLogic, setEnglishLogic] = useState('')
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') return 'cpp'
    return localStorage.getItem('thinkflow:preferred-language') || 'cpp'
  })
  const [codeSubmission, setCodeSubmission] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showCodeEditor, setShowCodeEditor] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [loadingSuggestion, setLoadingSuggestion] = useState(false)
  const [editorInstance, setEditorInstance] = useState<any>(null)
  const [syntaxErrors, setSyntaxErrors] = useState<any[]>([])
  const [editorHints, setEditorHints] = useState<EditorHint[]>([])
  const [codeAnalysis, setCodeAnalysis] = useState<any>(null)
  const [analyzingCode, setAnalyzingCode] = useState(false)
  const [logicHistory, setLogicHistory] = useState<any[]>([])
  const [codeHistory, setCodeHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [customInputText, setCustomInputText] = useState(DEFAULT_CUSTOM_INPUT)
  const [customExpectedText, setCustomExpectedText] = useState(DEFAULT_CUSTOM_EXPECTED)
  const [customRunResult, setCustomRunResult] = useState<any>(null)
  const [runningCustomTest, setRunningCustomTest] = useState(false)
  const [showTestTray, setShowTestTray] = useState(false)
  const [logicValidation, setLogicValidation] = useState<LogicValidationResult | null>(null)
  const [logicInsights, setLogicInsights] = useState<LogicInsight[]>([])
  const [validatingLogic, setValidatingLogic] = useState(false)
  const [parsingLogic, setParsingLogic] = useState(false)
  const [complexityToast, setComplexityToast] = useState('')
  const [focusMode, setFocusMode] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [programmingTheme, setProgrammingTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark'
    return localStorage.getItem('thinkflow:programming-theme') === 'light' ? 'light' : 'dark'
  })
  const [showExecutionTrace, setShowExecutionTrace] = useState(false)
  const [showQuestionPane, setShowQuestionPane] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('thinkflow:show-question-pane') !== 'false'
  })
  const [showBlueprintPane, setShowBlueprintPane] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('thinkflow:show-blueprint-pane') !== 'false'
  })
  const [draftSavedAt, setDraftSavedAt] = useState<string>('')
  const blueprintTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const blueprintHighlightRef = useRef<HTMLDivElement | null>(null)
  const completionProviderRef = useRef<any>(null)
  const ghostDecorationsRef = useRef<any>(null)
  const syncMapRef = useRef<SyncMap>({})
  const draftLoadedRef = useRef(false)
  const customInputEditedRef = useRef(false)
  const customExpectedEditedRef = useRef(false)
  const lastBlueprintRef = useRef('')
  const starterCodeRef = useRef('')
  const parseRequestRef = useRef(0)
  const validationRequestRef = useRef(0)

  useEffect(() => {
    syncMapRef.current = syncMap
  }, [syncMap])

  const logicSteps: LogicStep[] = nodes.map((node) => ({
    step_number: node.id,
    description: node.text,
    type: node.type?.toLowerCase(),
    complexity: node.complexity,
    isValid: node.isValid,
    starterComment: node.starterComment,
    error: node.error
  }))

  const setLogicSteps = (steps: LogicStep[]) => {
    setNodes(steps.map((step) => ({
      id: step.step_number,
      text: step.description,
      type: step.type ? step.type.charAt(0).toUpperCase() + step.type.slice(1) : 'Process',
      isValid: step.isValid ?? null,
      complexity: step.complexity || 'O(?)',
      starterComment: step.starterComment || step.description,
      error: step.error || null
    })))
  }

  const handleLanguageChange = (nextLanguage: string) => {
    setLanguage(nextLanguage)
    if (typeof window !== 'undefined') {
      localStorage.setItem('thinkflow:preferred-language', nextLanguage)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('thinkflow:programming-theme', programmingTheme)
  }, [programmingTheme])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('thinkflow:show-question-pane', String(showQuestionPane))
  }, [showQuestionPane])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('thinkflow:show-blueprint-pane', String(showBlueprintPane))
  }, [showBlueprintPane])

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await getCurrentUser()
        setUser(userData)
      } catch (error) {
        console.error('Failed to load user:', error)
      }
    }
    loadUser()
  }, [])

  useEffect(() => {
    draftLoadedRef.current = false
    setDraftSavedAt('')
    customInputEditedRef.current = false
    customExpectedEditedRef.current = false
    setCustomInputText(DEFAULT_CUSTOM_INPUT)
    setCustomExpectedText(DEFAULT_CUSTOM_EXPECTED)
    setLogicValidation(null)
    setLogicInsights([])
    setValidatingLogic(false)
  }, [problemId])

  useEffect(() => {
    if (isCompetitionMode) {
      setShowCodeEditor(true)
    }
  }, [isCompetitionMode])

  // Clear syntax errors when language changes
  useEffect(() => {
    setSyntaxErrors([])
    
    // Update Monaco Editor language configuration when language changes
    if (editorInstance) {
      const monaco = (window as any).monaco
      if (monaco) {
        if (language === 'javascript') {
          // Enable diagnostics for JavaScript
          monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: false,
            noSyntaxValidation: false,
          })
        } else {
          // Disable TypeScript/JavaScript diagnostics for other languages
          monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: true,
          })
          monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: true,
          })
        }
      }
    }
  }, [language, editorInstance])

  useEffect(() => {
    if (!editorInstance) return
    const monaco = (window as any).monaco
    const model = editorInstance.getModel?.()
    if (!monaco || !model) return

    const executionDiagnostic = getPrimaryExecutionDiagnostic(codeSubmission)
    const markers = [
      ...syntaxErrors
        .filter((error) => Number.isFinite(Number(error.line)))
        .map((error) => ({
          severity: monaco.MarkerSeverity.Error,
          startLineNumber: Math.max(1, Number(error.line)),
          startColumn: 1,
          endLineNumber: Math.max(1, Number(error.line)),
          endColumn: model.getLineMaxColumn(Math.max(1, Number(error.line))),
          message: error.message || 'Syntax error',
          source: 'ThinkFlow syntax',
        })),
      ...(executionDiagnostic?.lineNumber ? [{
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: Math.max(1, Number(executionDiagnostic.lineNumber)),
        startColumn: Math.max(1, Number(executionDiagnostic.columnNumber || 1)),
        endLineNumber: Math.max(1, Number(executionDiagnostic.lineNumber)),
        endColumn: model.getLineMaxColumn(Math.max(1, Number(executionDiagnostic.lineNumber))),
        message: executionDiagnostic.message || executionDiagnostic.title || 'Execution error',
        source: executionDiagnostic.title || 'ThinkFlow compiler',
      }] : []),
    ]

    monaco.editor.setModelMarkers(model, 'thinkflow-execution', markers)
  }, [editorInstance, syntaxErrors, codeSubmission])

  useEffect(() => {
    const fetchProblem = async () => {
      try {
        const response = await api.get(`/problems/${problemId}`)
        const fetchedProblem = response.data.problem
        setProblem(fetchedProblem)
        
        setLogicSteps([])
      } catch (error) {
        console.error('Failed to fetch problem:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchProblem()
  }, [problemId])

  useEffect(() => {
    const nextHints = buildEditorHints(problem, language)
    setEditorHints(nextHints)
  }, [problem, language])

  useEffect(() => {
    if (!problem) return

    const fallbackInput = problem?.examples?.[0]?.input ?? problem?.test_cases?.[0]?.input
    const fallbackOutput = problem?.examples?.[0]?.output ?? problem?.expected_outputs?.[0]?.output

    if (fallbackInput !== undefined && !customInputEditedRef.current) {
      setCustomInputText(JSON.stringify(fallbackInput, null, 2))
    }

    if (fallbackOutput !== undefined && !customExpectedEditedRef.current) {
      setCustomExpectedText(JSON.stringify(fallbackOutput, null, 2))
    }
  }, [problem])

  useEffect(() => {
    if (!editorInstance) return
    const monaco = (window as any).monaco
    if (!monaco) return

    if (completionProviderRef.current) {
      completionProviderRef.current.dispose()
      completionProviderRef.current = null
    }

    const completionItems = buildEditorHints(problem, language).map((hint, index) => ({
      label: hint.title,
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: hint.snippet,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: hint.description,
      sortText: `0${index}`
    }))

    try {
      completionProviderRef.current = monaco.languages.registerCompletionItemProvider(language, {
        provideCompletionItems: () => ({ suggestions: completionItems })
      })
    } catch (error) {
      console.warn(`Unable to register completion hints for language: ${language}`, error)
    }

    return () => {
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose()
        completionProviderRef.current = null
      }
    }
  }, [editorInstance, language, problem])

  useEffect(() => {
    if (!editorInstance) return
    const monaco = (window as any).monaco
    if (!monaco) return

    const model = editorInstance.getModel?.()
    const maxLine = model?.getLineCount?.() || 1
    const decorations = nodes
      .map((node) => {
        const range = syncMap[node.id]
        if (!range) return null
        if (range.commentLine > maxLine) return null
        const implemented = implementedNodeIds.includes(node.id)
        const invalid = node.isValid === false

        return {
          range: new monaco.Range(range.commentLine, 1, range.commentLine, 1),
          options: {
            isWholeLine: false,
            className: invalid ? 'logic-ghost-line-error' : implemented ? 'logic-ghost-line-implemented' : 'logic-ghost-line',
            glyphMarginClassName: invalid ? 'logic-ghost-glyph-error' : 'logic-ghost-glyph',
            after: {
              content: `  ${getGhostComment(node).replace(/^\/{1,2}|^#/, '').trim()}`,
              inlineClassName: invalid
                ? 'logic-ghost-text-error'
                : implemented
                  ? 'logic-ghost-text-implemented'
                  : 'logic-ghost-text'
            },
            hoverMessage: {
              value: invalid
                ? node.error || 'This code appears to conflict with the logic node.'
                : implemented
                  ? 'Implementation in progress for this logic node.'
                  : 'Ghost logic hint. Add code directly beneath it.'
            }
          }
        }
      })
      .filter(Boolean)

    ghostDecorationsRef.current = editorInstance.deltaDecorations(ghostDecorationsRef.current || [], decorations)
  }, [editorInstance, implementedNodeIds, nodes, syncMap])

  const isPlainRecord = (value: any) => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
  )

  const sanitizeParamName = (name: string) => {
    const safeName = String(name || 'inputData').replace(/[^a-zA-Z0-9_]/g, '_').replace(/^\d/, '_$&')
    return safeName || 'inputData'
  }

  const getProblemSampleInput = (currentProblem: any) => (
    currentProblem?.examples?.[0]?.input ??
    currentProblem?.test_cases?.[0]?.input ??
    currentProblem?.testCases?.[0]?.input ??
    null
  )

  const getProblemSampleOutput = (currentProblem: any) => (
    currentProblem?.examples?.[0]?.output ??
    currentProblem?.expected_outputs?.[0]?.output ??
    currentProblem?.test_cases?.[0]?.output ??
    null
  )

  const getStarterEntries = (input: any) => {
    if (isPlainRecord(input)) {
      const entries = Object.entries(input).map(([name, value]) => ({
        name: sanitizeParamName(name),
        value
      }))
      return entries.length > 0 ? entries : [{ name: 'inputData', value: input }]
    }

    return [{ name: 'inputData', value: input }]
  }

  const getStarterFunctionName = (currentProblem: any) => {
    const words = String(currentProblem?.title || 'solve')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)

    if (words.length === 0) return 'solve'

    const [firstWord, ...restWords] = words
    const name = [
      firstWord.toLowerCase(),
      ...restWords.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    ].join('')

    return name.replace(/^\d/, '_$&') || 'solve'
  }

  const inferCppType = (value: any): string => {
    if (Array.isArray(value)) {
      const innerType = value.length > 0 ? inferCppType(value[0]) : 'int'
      return `vector<${innerType}>`
    }
    if (typeof value === 'string') return 'string'
    if (typeof value === 'boolean') return 'bool'
    if (typeof value === 'number' && !Number.isInteger(value)) return 'double'
    return 'int'
  }

  const inferCppParam = (value: any, name: string) => {
    const type = inferCppType(value)
    if (type.startsWith('vector<')) return `${type}& ${name}`
    return `${type} ${name}`
  }

  const inferJavaType = (value: any): string => {
    if (Array.isArray(value)) {
      const innerType = value.length > 0 ? inferJavaType(value[0]) : 'int'
      return `${innerType}[]`
    }
    if (typeof value === 'string') return 'String'
    if (typeof value === 'boolean') return 'boolean'
    if (typeof value === 'number' && !Number.isInteger(value)) return 'double'
    return 'int'
  }

  const inferCType = (value: any, name: string) => (
    Array.isArray(value)
      ? `int* ${name}, int ${name}_len`
      : typeof value === 'string'
        ? `char* ${name}`
        : `int ${name}`
  )

  const defaultReturnForType = (type: string, currentLanguage: string) => {
    if (currentLanguage === 'python') return 'None'
    if (currentLanguage === 'javascript') return 'null'
    if (currentLanguage === 'java') {
      if (type.endsWith('[]')) return `new ${type.replace(/\[\]$/, '')}[0]`
      if (type === 'String') return '""'
      if (type === 'boolean') return 'false'
      if (type === 'double') return '0.0'
      return '0'
    }
    if (currentLanguage === 'cpp') {
      if (type.startsWith('vector<')) return '{}'
      if (type === 'string') return '""'
      if (type === 'bool') return 'false'
      if (type === 'double') return '0.0'
      return '0'
    }
    if (type.includes('*')) return 'NULL'
    return '0'
  }

  const isEmptyStarterLikeCode = (currentCode: string) => {
    const withoutBlueprint = stripBlueprintCommentScaffold(currentCode)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/#.*$/gm, '')
      .replace(/\busing\s+namespace\s+std\s*;/g, '')
      .replace(/\bimport\s+java\.util\.\*;\s*/g, '')
      .trim()
    const compact = withoutBlueprint.replace(/\s+/g, '')

    return (
      !compact ||
      /^function[a-zA-Z_]\w*\([^)]*\)\{(?:returnnull;?)?\}$/.test(compact) ||
      /^def[a-zA-Z_]\w*\([^)]*\):pass$/.test(compact) ||
      /^(?:public)?classSolution\{publicstatic[\w<>\[\]]+[a-zA-Z_]\w*\([^)]*\)\{(?:return(?:null|false|0|0\.0|new\w+\[0\]);)?\}\}$/.test(compact) ||
      /^classSolution\{public:(?:int|double|bool|string|vector<.*>)[a-zA-Z_]\w*\([^)]*\)\{(?:return(?:0|0\.0|false|""|\{\});)?\}\};?$/.test(compact) ||
      /^(?:int|double|bool|string|vector<.*>)[a-zA-Z_]\w*\([^)]*\)\{(?:return(?:0|0\.0|false|""|\{\});)?\}$/.test(compact) ||
      /^(?:int|double|char\*|int\*)[a-zA-Z_]\w*\([^)]*\)\{(?:return(?:0|NULL);)?\}$/.test(compact)
    )
  }

  const buildStarterCode = (currentProblem: any, currentLanguage: string) => {
    const sampleInput = getProblemSampleInput(currentProblem)
    const sampleOutput = getProblemSampleOutput(currentProblem)
    const entries = getStarterEntries(sampleInput)
    const paramNames = entries.map((entry) => entry.name)
    const functionName = getStarterFunctionName(currentProblem)

    if (currentLanguage === 'python') {
      return `def ${functionName}(${paramNames.join(', ') || 'input_data'}):\n    pass\n`
    }

    if (currentLanguage === 'java') {
      const returnType = inferJavaType(sampleOutput)
      const params = entries.map((entry) => `${inferJavaType(entry.value)} ${entry.name}`).join(', ') || 'Object inputData'
      return `class Solution {\n    public static ${returnType} ${functionName}(${params}) {\n        \n    }\n}\n`
    }

    if (currentLanguage === 'cpp') {
      const returnType = inferCppType(sampleOutput)
      const params = entries.map((entry) => inferCppParam(entry.value, entry.name)).join(', ') || 'int inputData'
      return `class Solution {\npublic:\n    ${returnType} ${functionName}(${params}) {\n        \n    }\n};\n`
    }

    if (currentLanguage === 'c') {
      const returnsArray = Array.isArray(sampleOutput)
      const returnType = returnsArray ? 'int*' : 'int'
      const params = entries.map((entry) => inferCType(entry.value, entry.name)).join(', ') || 'int inputData'
      return `${returnType} ${functionName}(${params}) {\n    \n}\n`
    }

    return `function ${functionName}(${paramNames.join(', ') || 'inputData'}) {\n  \n}\n`
  }

  const buildEditorHints = (currentProblem: any, currentLanguage: string): EditorHint[] => {
    const title = (currentProblem?.title || '').toLowerCase()
    const functionTemplate = buildStarterCode(currentProblem, currentLanguage)

    const commonHints: EditorHint[] = [
      {
        title: 'Starter Template',
        description: `Insert a ${currentLanguage} solve template.`,
        snippet: functionTemplate
      }
    ]

    if (title.includes('two sum') || title.includes('sum')) {
      commonHints.push({
        title: 'Hash Map Pattern',
        description: 'Use complement lookup to reduce to linear time.',
        snippet:
          currentLanguage === 'python'
            ? 'seen = {}\nfor i, num in enumerate(nums):\n    need = target - num\n    if need in seen:\n        return [seen[need], i]\n    seen[num] = i\n'
            : 'const seen = new Map();\nfor (let i = 0; i < nums.length; i++) {\n  const need = target - nums[i];\n  if (seen.has(need)) return [seen.get(need), i];\n  seen.set(nums[i], i);\n}\n'
      })
    } else if (title.includes('interval')) {
      commonHints.push({
        title: 'Sort + Merge Pattern',
        description: 'Sort by start, then merge overlap windows.',
        snippet:
          currentLanguage === 'python'
            ? 'intervals.sort(key=lambda x: x[0])\nmerged = []\nfor start, end in intervals:\n    if not merged or start > merged[-1][1]:\n        merged.append([start, end])\n    else:\n        merged[-1][1] = max(merged[-1][1], end)\n'
            : 'intervals.sort((a, b) => a[0] - b[0]);\nconst merged = [];\nfor (const [start, end] of intervals) {\n  if (!merged.length || start > merged[merged.length - 1][1]) {\n    merged.push([start, end]);\n  } else {\n    merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);\n  }\n}\n'
      })
    } else if (title.includes('palindrome')) {
      commonHints.push({
        title: 'Two Pointers Pattern',
        description: 'Scan from both ends, skipping non-alphanumeric chars.',
        snippet:
          currentLanguage === 'python'
            ? 'left, right = 0, len(s) - 1\nwhile left < right:\n    while left < right and not s[left].isalnum():\n        left += 1\n    while left < right and not s[right].isalnum():\n        right -= 1\n    if s[left].lower() != s[right].lower():\n        return False\n    left += 1\n    right -= 1\nreturn True\n'
            : 'let left = 0;\nlet right = s.length - 1;\nwhile (left < right) {\n  while (left < right && !/[a-z0-9]/i.test(s[left])) left++;\n  while (left < right && !/[a-z0-9]/i.test(s[right])) right--;\n  if (s[left].toLowerCase() !== s[right].toLowerCase()) return false;\n  left++;\n  right--;\n}\nreturn true;\n'
      })
    }

    return commonHints
  }

  const getDraftStorageKey = () => `thinkflow:draft:problem:${problemId}`

  const parseJsonText = (raw: string) => {
    try {
      return { ok: true, value: JSON.parse(raw) }
    } catch (error: any) {
      return { ok: false, error: error?.message || 'Invalid JSON' }
    }
  }

  const fetchSubmissionHistory = async () => {
    setLoadingHistory(true)
    try {
      const [logicResponse, codeResponse] = await Promise.all([
        api.get('/submissions/logic', { params: { problemId } }),
        api.get('/submissions/code', { params: { problemId } })
      ])
      setLogicHistory(logicResponse.data.submissions || [])
      setCodeHistory(codeResponse.data.submissions || [])
    } catch (error) {
      console.error('Failed to fetch submission history:', error)
    } finally {
      setLoadingHistory(false)
    }
  }

  const clearDraft = () => {
    localStorage.removeItem(getDraftStorageKey())
    setDraftSavedAt('')
    alert('Draft cleared for this problem')
  }

  useEffect(() => {
    fetchSubmissionHistory()
  }, [problemId])

  useEffect(() => {
    if (!problem || draftLoadedRef.current) return
    const rawDraft = localStorage.getItem(getDraftStorageKey())
    if (!rawDraft) {
      const starterCode = buildStarterCode(problem, language)
      starterCodeRef.current = starterCode
      setCode(starterCode)
      draftLoadedRef.current = true
      return
    }

    try {
      const draft = JSON.parse(rawDraft)
      const draftLanguage = typeof draft.language === 'string' ? draft.language : language
      const starterCode = buildStarterCode(problem, draftLanguage)
      const draftCode = typeof draft.code === 'string' ? draft.code : ''
      const draftCodeBody = stripBlueprintCommentScaffold(draftCode)
      starterCodeRef.current = starterCode

      if (draftCodeBody.trim() && !isEmptyStarterLikeCode(draftCode)) {
        setCode(draftCode)
      } else {
        setCode(starterCode)
      }
      if (draft.language && typeof draft.language === 'string') {
        handleLanguageChange(draft.language)
      }
      if (draft.englishLogic && typeof draft.englishLogic === 'string') {
        setEnglishLogic(draft.englishLogic)
      }
      if (Array.isArray(draft.logicSteps) && draft.logicSteps.length > 0) {
        setLogicSteps(draft.logicSteps)
      }
      if (draft.updatedAt) {
        setDraftSavedAt(new Date(draft.updatedAt).toLocaleString())
      }
    } catch (error) {
      console.error('Failed to restore draft:', error)
    } finally {
      draftLoadedRef.current = true
    }
  }, [problem, problemId])

  useEffect(() => {
    if (!problem || !draftLoadedRef.current) return

    const nextStarter = buildStarterCode(problem, language)
    const previousStarter = starterCodeRef.current
    const generatedBlueprint = englishLogic.trim()
      ? buildBlueprintCommentScaffold(englishLogic, language)
      : null

    if (generatedBlueprint) {
      setSyncMap(generatedBlueprint.syncMap)
    }

    setCode((prev) => {
      const body = stripBlueprintCommentScaffold(prev)
      const shouldReplaceBody = (
        !body.trim() ||
        Boolean(previousStarter && body.trim() === previousStarter.trim()) ||
        isEmptyStarterLikeCode(body)
      )

      starterCodeRef.current = nextStarter

      if (!shouldReplaceBody) {
        return prev
      }

      const nextBody = nextStarter.trimEnd()
      const nextCode = generatedBlueprint
        ? `${generatedBlueprint.code}\n\n${nextBody}\n`
        : `${nextBody}\n`

      lastBlueprintRef.current = nextCode
      return nextCode
    })
  }, [language, problem])

  useEffect(() => {
    if (!draftLoadedRef.current || !problem) return
    const payload = {
      code,
      language,
      englishLogic,
      logicSteps,
      updatedAt: new Date().toISOString()
    }
    localStorage.setItem(getDraftStorageKey(), JSON.stringify(payload))
    setDraftSavedAt(new Date(payload.updatedAt).toLocaleString())
  }, [code, language, englishLogic, nodes, problem, problemId])

  const splitEnglishLogic = (text: string) => text
    .split(/\n+|(?:^|\s)(?:first|then|next|after that|finally|lastly|step \d+[:.)])/i)
    .map((part) => part.trim().replace(/^[,.;:\-\s]+/, '').trim())
    .filter(Boolean)

  const inferStepType = (description: string, index: number, total: number) => {
    const lower = description.toLowerCase()
    if (/\b(input|parse|read|receive)\b/.test(lower)) return 'input'
    if (index === total - 1 || /\b(return|output|print|answer)\b/.test(lower)) return 'output'
    if (/\b(if|when|unless|condition|check)\b/.test(lower)) return 'condition'
    if (/\b(loop|iterate|for each|while|traverse)\b/.test(lower)) return 'loop'
    return 'process'
  }

  const buildLogicStepsFromEnglish = (text: string): LogicStep[] => {
    const parts = splitEnglishLogic(text)
    return parts.map((description, index) => ({
      step_number: index + 1,
      description,
      type: inferStepType(description, index, parts.length)
    }))
  }

  const getCommentPrefix = (currentLanguage: string) => (
    currentLanguage === 'python' ? '#' : '//'
  )

  const buildLiveBlueprint = (text: string, currentLanguage: string) => {
    const steps = buildLogicStepsFromEnglish(text)
    const comment = getCommentPrefix(currentLanguage)
    const fallbackSteps = steps.length > 0
      ? steps
      : [
          { step_number: 1, description: 'Describe the input you will read or transform', type: 'input' },
          { step_number: 2, description: 'Describe the main algorithm in plain English', type: 'process' },
          { step_number: 3, description: 'Describe what the solution should return', type: 'output' }
        ]

    const lines = fallbackSteps.map((step) => `${comment} ${step.step_number}. ${step.description}`)

    if (currentLanguage === 'python') {
      return `def solve(input_data):\n    ${lines.join('\n    ')}\n    pass\n`
    }

    if (currentLanguage === 'java') {
      return `public class Solution {\n  public static Object solve(Object inputData) {\n    ${lines.join('\n    ')}\n    return null;\n  }\n}\n`
    }

    if (currentLanguage === 'cpp') {
      return `#include <bits/stdc++.h>\nusing namespace std;\n\nint solve() {\n  ${lines.join('\n  ')}\n  return 0;\n}\n`
    }

    if (currentLanguage === 'c') {
      return `#include <stdio.h>\n\nint solve() {\n  ${lines.join('\n  ')}\n  return 0;\n}\n`
    }

    return `function solve(inputData) {\n  ${lines.join('\n  ')}\n  return null;\n}\n`
  }

  const normalizeParsedNodes = (rawNodes: any[]): LogicNode[] => (
    rawNodes.map((node, index) => ({
      id: Number.isFinite(Number(node.id)) ? Number(node.id) : index + 1,
      text: String(node.text || node.description || node.starter_comment || '').trim(),
      type: node.type || 'Process',
      isValid: node.error ? false : node.isValid ?? null,
      complexity: node.complexity || 'O(?)',
      starterComment: node.starter_comment || node.starterComment || node.text || '',
      error: node.error || null
    })).filter((node) => node.text)
  )

  const getGhostComment = (node: LogicNode, currentLanguage = language) => {
    const prefix = getCommentPrefix(currentLanguage)
    return `${prefix} LOGIC ${node.id}: ${node.starterComment || node.text} [${node.type}, ${node.complexity}]`
  }

  const buildGhostCodeFromNodes = (nextNodes: LogicNode[], currentLanguage = language) => {
    const map: SyncMap = {}
    const lines: string[] = []

    const pushNodeLines = (indent = '') => {
      nextNodes.forEach((node) => {
        const implementationStartLine = lines.length + 1
        lines.push(indent)
        map[node.id] = {
          startLine: implementationStartLine,
          endLine: implementationStartLine,
          commentLine: implementationStartLine,
          implementationStartLine,
          implementationEndLine: implementationStartLine
        }
      })
    }

    if (currentLanguage === 'python') {
      lines.push('def solve(input_data):')
      pushNodeLines('    ')
      lines.push('    return None')
    } else if (currentLanguage === 'java') {
      lines.push('public class Solution {')
      lines.push('  public static Object solve(Object inputData) {')
      pushNodeLines('    ')
      lines.push('    return null;')
      lines.push('  }')
      lines.push('}')
    } else if (currentLanguage === 'cpp') {
      lines.push('#include <bits/stdc++.h>')
      lines.push('using namespace std;')
      lines.push('')
      lines.push('int solve() {')
      pushNodeLines('  ')
      lines.push('  return 0;')
      lines.push('}')
    } else if (currentLanguage === 'c') {
      lines.push('#include <stdio.h>')
      lines.push('')
      lines.push('int solve() {')
      pushNodeLines('  ')
      lines.push('  return 0;')
      lines.push('}')
    } else {
      lines.push('function solve(inputData) {')
      pushNodeLines('  ')
      lines.push('  return null;')
      lines.push('}')
    }

    return { code: `${lines.join('\n')}\n`, syncMap: map }
  }

  const buildBlueprintCommentScaffold = (text: string, currentLanguage = language) => {
    const parsedSteps = buildLogicStepsFromEnglish(text)
    const comment = getCommentPrefix(currentLanguage)
    const map: SyncMap = {}
    const commentLines = parsedSteps.map((step, index) => {
      const lineNumber = index + 1
      map[step.step_number] = {
        startLine: lineNumber,
        endLine: lineNumber,
        commentLine: lineNumber,
        implementationStartLine: lineNumber,
        implementationEndLine: lineNumber
      }

      return `${comment} Step ${lineNumber}: ${step.description}`
    })

    return {
      code: commentLines.join('\n'),
      syncMap: map
    }
  }

  const stripBlueprintCommentScaffold = (currentCode: string) => {
    const lines = currentCode.split('\n')
    let index = 0

    while (/^\s*(\/\/|#)\s*Step\s+\d+:/i.test(lines[index] || '')) {
      index += 1
    }

    if (index > 0 && !String(lines[index] || '').trim()) {
      index += 1
    }

    return lines.slice(index).join('\n').replace(/^\n+/, '')
  }

  const restoreGhostComments = (nextCode: string) => {
    return nextCode
  }

  const getImplementationForNode = (nodeId: number, currentCode = code) => {
    const range = syncMap[nodeId]
    if (!range) return ''
    const lines = currentCode.split('\n')
    const start = Math.max(range.implementationStartLine - 1, 0)
    const laterRanges = Object.values(syncMap)
      .map((item) => item.implementationStartLine - 1)
      .filter((line) => line > start)
      .sort((a, b) => a - b)
    const end = laterRanges[0] ?? Math.min(start + 3, lines.length)
    return lines.slice(start, end).join('\n').trim()
  }

  const detectsNodeDeviation = (node: LogicNode, implementation: string) => {
    const nodeText = `${node.text} ${node.starterComment}`.toLowerCase()
    const codeText = implementation.replace(/\s+/g, '').toLowerCase()
    const asksDescending = /\b(descending|largest|higher|highest|most frequent|larger value|value descending)\b/.test(nodeText)
    const asksAscending = /\b(ascending|smallest|lower|lowest|smaller value|value ascending)\b/.test(nodeText)
    const sortAscending = /\.sort\(\(?a,b\)?=>a-b\)/.test(codeText) || /\.sort\(function\(a,b\)\{returna-b/.test(codeText)
    const sortDescending = /\.sort\(\(?a,b\)?=>b-a\)/.test(codeText) || /\.sort\(function\(a,b\)\{returnb-a/.test(codeText)

    if (asksDescending && sortAscending && !/\|\||frequency|freq|count/.test(codeText)) return true
    if (asksAscending && sortDescending) return true
    return false
  }

  const estimateComplexity = (text: string, currentCode: string) => {
    const source = `${text}\n${currentCode}`.toLowerCase()
    const nestedLoop = /\b(nested loop|loop inside|for each.*for each)\b/.test(source) || /\b(for|while)\b[\s\S]{0,220}\b(for|while)\b/.test(source)
    const hasSort = /\b(sort|sorted|priority queue|heap)\b/.test(source)
    const hasLoop = /\b(loop|iterate|for each|traverse|for\b|while\b)\b/.test(source)
    const hasMap = /\b(map|hash|set|dictionary|frequency|count)\b/.test(source)
    const hasMatrix = /\b(grid|matrix|2d|rows.*columns)\b/.test(source)

    if (nestedLoop || hasMatrix) return { time: 'O(n^2)', space: hasMap ? 'O(n)' : 'O(1)' }
    if (hasSort) return { time: 'O(n log n)', space: hasMap ? 'O(n)' : 'O(log n)' }
    if (hasLoop || hasMap) return { time: 'O(n)', space: hasMap ? 'O(n)' : 'O(1)' }
    return { time: 'O(?)', space: 'O(?)' }
  }

  const getFeedbackForNode = (nodeId: number) => {
    const matches = logicValidation?.feedback_nodes?.filter((node) => node.id === nodeId) || []
    if (matches.length === 0) return null

    const status: LogicFeedbackNode['status'] = matches.some((node) => node.status === 'error')
      ? 'error'
      : matches.some((node) => node.status === 'warning')
        ? 'warning'
        : 'correct'

    return {
      status,
      message: matches.map((node) => node.message).join(' ')
    }
  }

  const getFlowNodeStatus = (step: LogicStep): FlowNodeStatus => {
    const feedback = getFeedbackForNode(step.step_number)
    if (feedback?.status) return feedback.status
    if (step.isValid === false) return 'error'
    if (/\bnested loop|loop inside|for each.*for each\b/i.test(step.description) && /10\^?5|100000|≤\s*10⁵|<=\s*10\^5/i.test(problem?.constraints || '')) return 'error'
    if (/\bsort\b/i.test(step.description) && !/\b(frequency|value|ascending|descending|tie|same|by|based on)\b/i.test(step.description)) return 'warning'
    if (logicValidation?.overall_status === 'valid') return 'correct'
    return 'idle'
  }

  const handleFlowNodeClick = (step: LogicStep) => {
    setFocusedNodeId(step.step_number)
    const range = syncMap[step.step_number]
    if (range && editorInstance) {
      editorInstance.revealLineInCenter(range.commentLine)
      editorInstance.setPosition({ lineNumber: range.implementationStartLine, column: 1 })
      editorInstance.focus()
    }
  }

  const hasBlockingLogicError = () => (
    logicInsights.some((insight) => insight.type === 'error') ||
    Boolean(logicValidation?.feedback_nodes?.some((node) => node.status === 'error'))
  )

  const hasCriticalMismatchError = () => (
    logicInsights.some((insight) => /critical mismatch/i.test(insight.message)) ||
    Boolean(logicValidation?.feedback_nodes?.some((node) => /critical mismatch/i.test(node.message)))
  )

  const getLogicSuggestionMessage = () => {
    if (!logicValidation && !nodes.some((node) => node.isValid === false)) return ''
    if (logicValidation?.overall_status === 'valid' && !nodes.some((node) => node.isValid === false)) return ''

    const suggestion = logicValidation?.feedback_nodes?.find((node) => (
      node.status === 'warning' &&
      /\b(equal|same frequency|tie|tie-breaker|edge case|empty)\b/i.test(node.message)
    ))

    return suggestion?.message || nodes.find((node) => node.isValid === false)?.error || ''
  }

  const syncBlueprintHighlightScroll = () => {
    if (!blueprintTextareaRef.current || !blueprintHighlightRef.current) return
    blueprintHighlightRef.current.scrollTop = blueprintTextareaRef.current.scrollTop
    blueprintHighlightRef.current.scrollLeft = blueprintTextareaRef.current.scrollLeft
  }

  const handleEnglishLogicChange = (value: string) => {
    const nextSteps = buildLogicStepsFromEnglish(value)
    const optimisticNodes = nextSteps.map((step) => ({
      id: step.step_number,
      text: step.description,
      type: step.type ? step.type.charAt(0).toUpperCase() + step.type.slice(1) : 'Process',
      isValid: null,
      complexity: step.complexity || 'O(?)',
      starterComment: step.description,
      error: null
    }))

    setEnglishLogic(value)
    setNodes(optimisticNodes)
    setLogicValidation(null)
    setLogicInsights([])
    setValidatingLogic(Boolean(value.trim()))
  }

  useEffect(() => {
    if (!englishLogic.trim()) {
      setSyncMap({})
      return
    }

    const generated = buildBlueprintCommentScaffold(englishLogic, language)
    setSyncMap(generated.syncMap)
    setCode((prev) => {
      const body = stripBlueprintCommentScaffold(prev)
      const starterBody = buildStarterCode(problem, language)
      const nextBody = body.trim() ? body.trimStart() : starterBody
      const nextCode = `${generated.code}\n\n${nextBody.trimEnd()}\n`

      lastBlueprintRef.current = nextCode
      return nextCode
    })
  }, [englishLogic, language, problem])

  useSyncLogic({
    enabled: !isCompetitionMode,
    logicText: englishLogic,
    problem,
    language,
    parseRequestRef,
    normalizeParsedNodes,
    setNodes,
    setSyncMap,
    setParsingLogic
  })

  useEffect(() => {
    if (isCompetitionMode) return

    const trimmedLogic = englishLogic.trim()
    const requestId = validationRequestRef.current + 1
    validationRequestRef.current = requestId

    if (!trimmedLogic || !problem) {
      setLogicInsights([])
      setLogicValidation(null)
      setValidatingLogic(false)
      return
    }

    setValidatingLogic(true)

    const timer = window.setTimeout(async () => {
      try {
        const response = await api.post('/validateLogicAgainstProblem', {
          userBlueprintText: englishLogic,
          problem: {
            title: problem?.title,
            description: problem?.description,
            constraints: problem?.constraints,
            examples: problem?.examples
          }
        })

        if (validationRequestRef.current !== requestId) return

        const insights = normalizeLogicInsights(response.data)
        setLogicInsights(insights)
        setLogicValidation(buildLogicValidationFromInsights(insights))
      } catch (error) {
        console.error('Logic validation failed:', error)
        if (validationRequestRef.current === requestId) {
          setLogicInsights([])
          setLogicValidation(null)
        }
      } finally {
        if (validationRequestRef.current === requestId) {
          setValidatingLogic(false)
        }
      }
    }, 650)

    return () => window.clearTimeout(timer)
  }, [englishLogic, problem, isCompetitionMode])

  useEffect(() => {
    if (!englishLogic.trim() || typeof window === 'undefined') {
      setComplexityToast('')
      return
    }

    const payload = {
      logic: englishLogic,
      constraints: problem?.constraints || ''
    }

    const runFallback = () => {
      const hasNestedLoop = /\bnested loop|loop inside|for each.*for each\b/i.test(payload.logic)
      const hasLargeConstraint = /10\^?5|100000|≤\s*10⁵|<=\s*10\^5/i.test(payload.constraints)
      setComplexityToast(hasNestedLoop && hasLargeConstraint
        ? 'Complexity Mismatch: nested loop logic may time out for constraints near 10^5.'
        : '')
    }

    if (!window.Worker) {
      runFallback()
      return
    }

    const workerSource = `
      self.onmessage = function(event) {
        const logic = String(event.data.logic || '');
        const constraints = String(event.data.constraints || '');
        const hasNestedLoop = /\\bnested loop|loop inside|for each.*for each\\b/i.test(logic);
        const hasLargeConstraint = /10\\^?5|100000|≤\\s*10⁵|<=\\s*10\\^5/i.test(constraints);
        self.postMessage({
          message: hasNestedLoop && hasLargeConstraint
            ? 'Complexity Mismatch: nested loop logic may time out for constraints near 10^5.'
            : ''
        });
      };
    `
    const blob = new Blob([workerSource], { type: 'application/javascript' })
    const worker = new Worker(URL.createObjectURL(blob))
    worker.onmessage = (event) => {
      setComplexityToast(event.data?.message || '')
    }
    worker.postMessage(payload)

    return () => worker.terminate()
  }, [englishLogic, problem?.constraints])

  const validateCodeSyntax = (codeValue: string) => {
    // Only validate JavaScript code
    if (language !== 'javascript') {
      setSyntaxErrors([])
      return true
    }
    
    try {
      // Try to parse the code to check for syntax errors
      new Function(codeValue)
      setSyntaxErrors([])
      return true
    } catch (error: any) {
      // Extract line number from error message if possible
      const match = error.message.match(/line (\d+)/)
      const lineNumber = match ? parseInt(match[1]) : 1
      
      setSyntaxErrors([{
        message: error.message,
        line: lineNumber,
        severity: 'error'
      }])
      return false
    }
  }

  const handleCodeChange = (value: string | undefined) => {
    const newCode = restoreGhostComments(value || '')
    setCode(newCode)
    const lineCount = newCode.split('\n').length
    const nextSyncMap = Object.fromEntries(
      Object.entries(syncMap).filter(([, range]) => range.implementationStartLine <= lineCount)
    ) as SyncMap
    if (Object.keys(nextSyncMap).length !== Object.keys(syncMap).length) {
      setSyncMap(nextSyncMap)
    }

    const nextImplementedIds = nodes
      .filter((node) => getImplementationForNode(node.id, newCode).length > 0)
      .map((node) => node.id)
    setImplementedNodeIds(nextImplementedIds)

    nodes.forEach((node) => {
      const implementation = getImplementationForNode(node.id, newCode)
      if (!implementation) {
        if (node.error?.startsWith('Code deviation:')) {
          updateNode(node.id, { isValid: null, error: null })
        }
        return
      }

      if (detectsNodeDeviation(node, implementation)) {
        updateNode(node.id, {
          isValid: false,
          error: 'Code deviation: implementation appears to contradict this logic node.'
        })
      } else if (node.error?.startsWith('Code deviation:')) {
        updateNode(node.id, { isValid: true, error: null })
      }
    })
    
    // Debounce syntax validation only for JavaScript
    if (newCode.trim() && language === 'javascript') {
      setTimeout(() => validateCodeSyntax(newCode), 500)
    } else {
      setSyntaxErrors([])
    }
  }

  const handleSubmitCode = async () => {
    if (!code.trim()) {
      alert('Please write some code')
      return
    }

    if (hasCriticalMismatchError()) {
      alert('Fix the Critical Mismatch in the Logic Auditor before submitting code.')
      return
    }

    // Validate syntax before submitting (only for JavaScript)
    if (language === 'javascript' && !validateCodeSyntax(code)) {
      alert('Please fix syntax errors before submitting')
      return
    }

    setSubmitting(true)
    setCodeSubmission(null) // Clear previous results
    
    console.log('Submitting code:', {
      problemId,
      language,
      codeLength: code.length
    })
    
    try {
      const response = await api.post('/submissions/code', {
        problemId,
        code,
        language: language,
        logicSubmissionId: null,
      })
      
      console.log('Submission response:', response.data)
      
      setCodeSubmission(response.data.submission)
      fetchSubmissionHistory()
    } catch (error: any) {
      console.error('Code submission error:', error)
      
      let errorMsg = 'Failed to submit code'
      
      if (error.response?.data?.error) {
        errorMsg = error.response.data.error
      } else if (error.response?.data?.details) {
        errorMsg = error.response.data.details
      } else if (error.response?.data?.message) {
        errorMsg = error.response.data.message
      } else if (error.message) {
        errorMsg = error.message
      }
      
      console.log('Full error details:', error.response?.data)
      setCodeSubmission(error.response?.data?.submission || {
        status: 'error',
        error: errorMsg,
        errorDetails: error.response?.data?.details || error.response?.data?.errorDetails || {
          title: 'Request Error',
          message: errorMsg,
          raw: errorMsg
        },
        results: [],
        message: errorMsg
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRunCustomTest = async () => {
    if (!code.trim()) {
      alert('Please write code before running custom tests')
      return
    }

    const parsedInput = parseJsonText(customInputText)
    if (!parsedInput.ok) {
      alert(`Custom input JSON error: ${parsedInput.error}`)
      return
    }

    const parsedExpected = parseJsonText(customExpectedText)
    if (!parsedExpected.ok) {
      alert(`Expected output JSON error: ${parsedExpected.error}`)
      return
    }

    setRunningCustomTest(true)
    setCustomRunResult(null)
    try {
      const response = await api.post('/submissions/code/custom-test', {
        problemId,
        code,
        language,
        customInput: parsedInput.value,
        expectedOutput: parsedExpected.value
      })
      setCustomRunResult(response.data.result)
    } catch (error: any) {
      setCustomRunResult(error.response?.data?.result || {
        passed: false,
        error: error.response?.data?.error || 'Failed to run custom test',
        errorDetails: error.response?.data?.details || error.response?.data?.errorDetails || null,
        expectedOutput: parsedExpected.value,
        actualOutput: null,
        input: parsedInput.value
      })
    } finally {
      setRunningCustomTest(false)
    }
  }

  const insertHintSnippet = (snippet: string) => {
    if (!snippet) return
    if (!editorInstance) {
      setCode((prev) => `${prev}${prev ? '\n' : ''}${snippet}`)
      return
    }

    const selection = editorInstance.getSelection()
    editorInstance.executeEdits('insert-hint-snippet', [
      {
        range: selection,
        text: snippet,
        forceMoveMarkers: true
      }
    ])
    editorInstance.focus()
    setCode(editorInstance.getValue())
  }

  const handleAnalyzeCode = async () => {
    setAnalyzingCode(true)
    setCodeAnalysis(null)
    try {
      const response = await api.post(`/problems/${problemId}/ai-help`, {
        question: 'Analyze my current code and suggest targeted fixes and edge-case checks.',
        code,
        language,
        logicSteps: isCompetitionMode ? [] : logicSteps.map(({ step_number, ...rest }) => rest)
      })
      setCodeAnalysis(response.data.help)
    } catch (error: any) {
      console.error('Failed to analyze code:', error)
      setCodeAnalysis({
        answer: error.response?.data?.error || 'Unable to analyze code right now.',
        hints: [],
        nextSteps: [],
        warnings: []
      })
    } finally {
      setAnalyzingCode(false)
    }
  }

  const getAISuggestion = async () => {
    setLoadingSuggestion(true)
    setAiSuggestion('')
    
    try {
      // Simulate AI suggestion - In production, this would call an AI API
      const suggestions = generateAISuggestion(problem)
      setAiSuggestion(suggestions)
      const logicDraft = suggestions
        .split('\n')
        .filter((line) => /^\d+\./.test(line.trim()))
        .map((line) => line.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').replace(/:/g, ' -'))
        .join('\n')
      if (logicDraft) {
        handleEnglishLogicChange(logicDraft)
      }
    } catch (error) {
      console.error('Failed to get AI suggestion:', error)
      setAiSuggestion('Unable to generate suggestion at this time. Please try again.')
    } finally {
      setLoadingSuggestion(false)
    }
  }

  const generateAISuggestion = (problem: any) => {
    if (!problem) return 'Loading problem details...'
    
    const difficulty = problem.difficulty?.toLowerCase()
    const title = problem.title?.toLowerCase() || ''
    
    // Generate contextual suggestions based on problem type
    if (title.includes('two sum') || title.includes('sum')) {
      return `**Suggested Approach:**

1. **Input Processing**: Parse the input array and target value
2. **Data Structure Setup**: Create a hash map to store numbers and their indices
3. **Loop Through Array**: Iterate through each number in the array
4. **Check Complement**: For each number, calculate complement (target - current number)
5. **Hash Map Lookup**: Check if complement exists in hash map
6. **Return Result**: If found, return indices; otherwise add current number to hash map`
    }
    
    if (title.includes('reverse')) {
      return `**Suggested Approach:**

1. **Input Validation**: Check if input is valid and not empty
2. **Initialize Pointers**: Set up two pointers at start and end
3. **Swap Elements**: While pointers haven't met, swap elements
4. **Move Pointers**: Move start pointer forward, end pointer backward
5. **Return Result**: Return the reversed array/string`
    }
    
    if (title.includes('palindrome')) {
      return `**Suggested Approach:**

1. **Input Processing**: Clean and normalize the input string
2. **Two-Pointer Setup**: Initialize left pointer at start, right at end
3. **Character Comparison**: Compare characters at both pointers
4. **Move Pointers**: If match, move both pointers inward
5. **Validation Check**: If all characters match, it's a palindrome
6. **Return Result**: Return true or false based on validation`
    }
    
    if (title.includes('interval') || title.includes('merge')) {
      return `**Suggested Approach:**

1. **Input Validation**: Check if intervals array is valid
2. **Sort Intervals**: Sort intervals by start time in ascending order
3. **Initialize Result**: Create empty list for merged intervals
4. **Iterate & Compare**: Loop through sorted intervals
5. **Check Overlap**: If current.start <= last.end, merge them
6. **Add to Result**: Otherwise, add current interval to result
7. **Return Merged**: Return the final merged intervals list`
    }
    
    // Generic suggestion based on difficulty
    if (difficulty === 'easy') {
      return `**Suggested Approach for Easy Problem:**

1. **Understand Input**: Identify what data you're working with
2. **Define Goal**: What output/result do you need?
3. **Simple Iteration**: Often requires one loop through data
4. **Apply Logic**: Check conditions or perform operations
5. **Return Result**: Output the final answer`
    }
    
    if (difficulty === 'medium') {
      return `**Suggested Approach for Medium Problem:**

1. **Input Processing**: Parse and validate input data
2. **Choose Data Structure**: Hash map, set, or array based on needs
3. **Main Algorithm**: Implement core logic (sorting, searching, etc.)
4. **Handle Edge Cases**: Consider empty inputs, single elements
5. **Optimize**: Look for ways to reduce time complexity
6. **Return Result**: Format and return the answer`
    }
    
    if (difficulty === 'hard') {
      return `**Suggested Approach for Hard Problem:**

1. **Problem Analysis**: Break down complex requirements
2. **Algorithm Design**: Choose optimal algorithm (DP, Graph, etc.)
3. **Data Structure Setup**: Multiple structures may be needed
4. **Implement Core Logic**: Build the main solution step by step
5. **Optimization Pass**: Reduce time/space complexity
6. **Edge Case Handling**: Test boundary conditions
7. **Return Solution**: Output the final optimized result`
    }
    
    return `**General Problem-Solving Approach:**

1. **Understand the Problem**: Read requirements carefully
2. **Identify Patterns**: Look for similar problems you've solved
3. **Plan Your Approach**: Think before coding
4. **Break Into Steps**: Divide problem into smaller sub-problems
5. **Implement Logic**: Write clear, logical steps
6. **Test & Verify**: Check with given examples
7. **Optimize**: Improve efficiency if needed`
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'correct':
        return <FaCheckCircle size={24} />
      case 'partially_correct':
        return <FaExclamationTriangle size={24} />
      case 'incorrect':
        return <FaTimesCircle size={24} />
      case 'error':
        return <FaExclamationTriangle size={24} />
      default:
        return null
    }
  }

  const formatExecutionTime = (value: any) => {
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) return '--'
    return `${numericValue}ms`
  }

  const renderCompilerDiagnostic = (diagnostic: any, compact = false) => {
    if (!diagnostic) return null

    const rawText = getDiagnosticRawText(diagnostic)
    const phaseLabel = String(diagnostic.phase || 'runtime').replace(/_/g, ' ')
    const codeFrame = Array.isArray(diagnostic.codeFrame) ? diagnostic.codeFrame : []

    return (
      <div className={`compiler-diagnostic-panel ${compact ? 'compact' : ''}`}>
        <div className="compiler-diagnostic-header">
          <div>
            <span className="compiler-diagnostic-eyebrow">{phaseLabel}</span>
            <h4>{diagnostic.title || 'Execution Error'}</h4>
          </div>
          {diagnostic.lineNumber ? (
            <span className="compiler-diagnostic-location">
              Ln {diagnostic.lineNumber}{diagnostic.columnNumber ? `, Col ${diagnostic.columnNumber}` : ''}
            </span>
          ) : null}
        </div>

        <p className="compiler-diagnostic-message">
          {diagnostic.message || diagnostic.fallbackError || 'The program failed while running.'}
        </p>

        {rawText && rawText !== diagnostic.message ? (
          <pre className="compiler-diagnostic-output">{rawText}</pre>
        ) : null}

        {codeFrame.length > 0 ? (
          <div className="compiler-code-frame">
            {codeFrame.map((frameLine: any) => (
              <div
                key={frameLine.lineNumber}
                className={`compiler-code-frame-line ${frameLine.highlight ? 'active' : ''}`}
              >
                <span>{frameLine.lineNumber}</span>
                <code>{frameLine.content || ' '}</code>
              </div>
            ))}
          </div>
        ) : diagnostic.errorLine ? (
          <div className="compiler-code-frame">
            <div className="compiler-code-frame-line active">
              <span>{diagnostic.lineNumber || '!'}</span>
              <code>{diagnostic.errorLine}</code>
            </div>
          </div>
        ) : null}

        {diagnostic.suggestion ? (
          <div className="compiler-diagnostic-suggestion">
            {diagnostic.suggestion}
          </div>
        ) : null}
      </div>
    )
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading problem...</p>
        </div>
      </ProtectedRoute>
    )
  }

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const complexityEstimate = estimateComplexity(englishLogic, code)
  const logicBlockerActive = hasBlockingLogicError()
  const criticalMismatchActive = hasCriticalMismatchError()
  const logicSuggestionMessage = getLogicSuggestionMessage()
  const submissionDiagnostic = getPrimaryExecutionDiagnostic(codeSubmission)
  const problemPaneVisible = !focusMode && showQuestionPane
  const blueprintPaneVisible = !isCompetitionMode && showBlueprintPane
  const blueprintLines = englishLogic.length > 0 ? englishLogic.split('\n') : ['']
  const logicInsightTypeByLine = logicInsights.reduce<Record<number, LogicInsight['type']>>((acc, insight) => {
    const current = acc[insight.line]
    if (!current || LOGIC_INSIGHT_SEVERITY[insight.type] > LOGIC_INSIGHT_SEVERITY[current]) {
      acc[insight.line] = insight.type
    }
    return acc
  }, {})
  const logicValidationDisplayStatus = validatingLogic
    ? 'idle'
    : logicInsights.some((insight) => insight.type === 'error')
    ? 'incorrect'
    : logicInsights.some((insight) => insight.type === 'warning') || Boolean(complexityToast)
      ? 'warning'
    : englishLogic.trim() && !parsingLogic
      ? 'correct'
      : 'idle'
  const executionTraceAvailable = !isCompetitionMode && logicValidationDisplayStatus === 'correct'
  const executionTraceBlueprintSteps = englishLogic
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const formatExecutionTraceValue = (value: any, fallback: string) => {
    if (value === null || value === undefined) return fallback

    if (typeof value === 'string') {
      const trimmedValue = value.trim()
      if (!trimmedValue) return fallback

      try {
        return JSON.stringify(JSON.parse(trimmedValue), null, 2)
      } catch {
        return trimmedValue
      }
    }

    return JSON.stringify(value, null, 2) || fallback
  }
  const executionTraceSampleInput = getProblemSampleInput(problem)
  const executionTraceSampleOutput = getProblemSampleOutput(problem)
  const executionTraceSampleInputText = executionTraceSampleInput !== null
    ? formatExecutionTraceValue(executionTraceSampleInput, 'No sample input available.')
    : 'No sample input available.'
  const executionTraceSampleOutputText = executionTraceSampleOutput !== null
    ? formatExecutionTraceValue(executionTraceSampleOutput, 'No expected output available.')
    : 'No expected output available.'
  const executionTraceExplanationRows = [
    {
      step: '1',
      stage: 'Input Initialization',
      happens: 'System takes test input and initializes variables.',
      display: 'Displays initial values from the selected sample input.',
      purpose: 'To start execution with defined values.'
    },
    {
      step: '2',
      stage: 'Step Execution',
      happens: 'Each Blueprint step is executed one by one.',
      display: 'Shows the current step and updated variable values.',
      purpose: 'To track how logic progresses.'
    },
    {
      step: '3',
      stage: 'Condition Evaluation',
      happens: 'Conditions from if/else or loops are checked.',
      display: 'Displays condition result as TRUE or FALSE.',
      purpose: 'To understand decision making.'
    },
    {
      step: '4',
      stage: 'Control Flow Movement',
      happens: 'Execution moves based on branch or loop results.',
      display: 'Highlights the path taken, such as enter loop or skip block.',
      purpose: 'To visualize program flow.'
    },
    {
      step: '5',
      stage: 'Iteration Handling',
      happens: 'Loop execution is repeated for each iteration.',
      display: 'Shows iteration-wise variable updates.',
      purpose: 'To analyze repeated execution.'
    },
    {
      step: '6',
      stage: 'Variable State Tracking',
      happens: 'Variable values are updated and tracked after steps.',
      display: 'Displays updated values after each meaningful change.',
      purpose: 'To debug logic errors.'
    },
    {
      step: '7',
      stage: 'Execution Navigation',
      happens: 'Learner can inspect the trace step by step.',
      display: 'Step navigation controls and ordered rows.',
      purpose: 'To analyze execution step-by-step.'
    },
    {
      step: '8',
      stage: 'Final Output Generation',
      happens: 'Final result is computed after execution completes.',
      display: 'Displays final output and expected output.',
      purpose: 'To verify correctness.'
    }
  ]
  const executionTraceExampleRows = [
    {
      step: '1',
      action: 'Load sample input',
      variables: executionTraceSampleInputText,
      output: '-'
    },
    ...executionTraceBlueprintSteps.map((step, index) => ({
      step: String(index + 2),
      action: step,
      variables: /for|while|loop|iterate|each/i.test(step)
        ? 'Iteration state is tracked for this step.'
        : 'Variables update according to this Blueprint step.',
      output: /if|else|condition|when|while|for/i.test(step)
        ? 'Condition / control flow evaluated'
        : '-'
    })),
    {
      step: String(executionTraceBlueprintSteps.length + 2),
      action: 'Final output',
      variables: 'Final variable state',
      output: executionTraceSampleOutputText
    }
  ]
  const logicFailureNodes = logicValidation?.overall_status === 'valid'
    ? nodes.filter((node) => node.isValid === false).map((node) => ({
        id: node.id,
        status: 'error' as const,
        message: node.error || 'Code deviates from this logic node.'
      }))
    : [
        ...(logicValidation?.feedback_nodes?.filter((node) => node.status !== 'correct') || []),
        ...nodes.filter((node) => node.isValid === false && node.error).map((node) => ({
          id: node.id,
          status: 'error' as const,
          message: node.error || 'Code deviates from this logic node.'
        }))
      ]
  const auditProblemText = `${problem?.title || ''} ${problem?.description || ''}`.toLowerCase()
  const auditLogicText = englishLogic.toLowerCase()
  const auditHasError = logicInsights.some((insight) => insight.type === 'error')
  const auditHasWarning = logicInsights.some((insight) => insight.type === 'warning') || Boolean(complexityToast)
  const blueprintPulseStatus = validatingLogic
    ? 'analyzing'
    : !englishLogic.trim()
      ? 'idle'
      : auditHasError
        ? 'error'
        : auditHasWarning
          ? 'warning'
          : 'valid'
  const positiveAuditInsights: LogicInsight[] = [
    ...(/\bdigit product\b|\bproduct of (their )?digits\b/.test(auditProblemText) && /\bdigit product\b|\bproduct of (the )?digits\b|multiply.*digits|digits.*product/.test(auditLogicText)
      ? [{ line: 1, type: 'info' as const, message: 'Digit product calculation identified.' }]
      : []),
    ...(/\bfrequency|most frequent|same frequency|equal frequency\b/.test(auditProblemText) && /\bfrequency|freq|count|map|dictionary\b/.test(auditLogicText)
      ? [{ line: 1, type: 'info' as const, message: 'Frequency counting step identified.' }]
      : []),
    ...(/\bsort|order\b/.test(auditLogicText)
      ? [{ line: 1, type: 'info' as const, message: 'Sorting step identified; comparator is being audited against the problem.' }]
      : [])
  ]
  const hasCriticalAuditorMismatch = logicInsights.some(isCriticalMismatchInsight)
  const auditorInsights: LogicInsight[] = !englishLogic.trim()
    ? [{ line: 1, type: 'warning', message: 'Start with a Blueprint that describes the algorithm for this exact problem.' }]
    : compactAuditorInsights([
        ...(hasCriticalAuditorMismatch ? [] : positiveAuditInsights),
        ...logicInsights,
        ...(complexityToast ? [{ line: 1, type: 'warning' as const, message: complexityToast }] : []),
        ...(!validatingLogic && logicInsights.length === 0 && positiveAuditInsights.length === 0
          ? [{ line: 1, type: 'info' as const, message: 'No requirement mismatch detected yet.' }]
          : [])
      ])
  return (
    <ProtectedRoute>
      <div className={`problem-detail-container problem-theme-${programmingTheme}`}>
        <nav className={`problem-navbar ${isCompetitionMode ? 'competition-problem-navbar' : ''}`}>
          <div className="problem-navbar-content">
            <div className="problem-brand" onClick={() => router.push('/dashboard')}>
              <div className="problem-brand-icon">
                <Image src="/assets/logo.jpeg" alt="ThinkFlow Logo" width={40} height={40} />
              </div>
              <span className="problem-brand-text">ThinkFlow</span>
            </div>
            <div className="problem-navbar-actions">
              <div className="programming-layout-controls" aria-label="Programming layout controls">
                <button
                  type="button"
                  className="programming-control-btn"
                  onClick={() => setProgrammingTheme((current) => current === 'dark' ? 'light' : 'dark')}
                  aria-pressed={programmingTheme === 'light'}
                  title={`Switch to ${programmingTheme === 'dark' ? 'light' : 'dark'} mode`}
                >
                  {programmingTheme === 'dark' ? <FaSun /> : <FaMoon />}
                  {programmingTheme === 'dark' ? 'Light' : 'Dark'}
                </button>
                {executionTraceAvailable ? (
                  <button
                    type="button"
                    className="programming-control-btn execution-trace-trigger active"
                    onClick={() => setShowExecutionTrace(true)}
                    title="Open Execution Trace"
                    aria-label="Open Execution Trace"
                  >
                    <FaInfoCircle />
                    Trace
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`programming-control-btn ${showQuestionPane ? 'active' : ''}`}
                  onClick={() => setShowQuestionPane((current) => !current)}
                  aria-pressed={showQuestionPane}
                  title={showQuestionPane ? 'Hide question pane' : 'Show question pane'}
                >
                  {showQuestionPane ? <FaEye /> : <FaEyeSlash />}
                  Question
                </button>
                {!isCompetitionMode ? (
                  <button
                    type="button"
                    className={`programming-control-btn ${showBlueprintPane ? 'active' : ''}`}
                    onClick={() => setShowBlueprintPane((current) => !current)}
                    aria-pressed={showBlueprintPane}
                    title={showBlueprintPane ? 'Hide English Blueprint pane' : 'Show English Blueprint pane'}
                  >
                    {showBlueprintPane ? <FaEye /> : <FaEyeSlash />}
                    Blueprint
                  </button>
                ) : null}
              </div>
              <button onClick={() => router.push(isCompetitionMode ? '/competitions' : '/problems')} className="problem-back-btn">
                <FaArrowLeft /> {isCompetitionMode ? 'Back to Competitions' : 'Back to Problems'}
              </button>
              <button onClick={handleLogout} className="problem-logout-btn">
                <FaSignOutAlt /> Logout
              </button>
            </div>
          </div>
        </nav>

        {isCompetitionMode ? (
          <div className="competition-workspace-toolbar">
            <div className="competition-workspace-breadcrumb">
              <span className="competition-toolbar-label">Problem List</span>
              <span className="competition-toolbar-separator">/</span>
              <span className="competition-toolbar-title">{problem?.title}</span>
            </div>
            <div className="competition-toolbar-actions">
              <select 
                value={language} 
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="language-selector competition-language-selector"
              >
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="cpp">C++</option>
                <option value="java">Java</option>
                <option value="c">C</option>
              </select>
              <button
                onClick={handleSubmitCode}
                disabled={submitting}
                className="competition-submit-btn"
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        ) : null}

        {showExecutionTrace && executionTraceAvailable ? (
          <div className="execution-trace-backdrop" role="dialog" aria-modal="true" aria-labelledby="execution-trace-title">
            <div className="execution-trace-modal">
              <div className="execution-trace-header">
                <div>
                  <span className="execution-trace-eyebrow">Validated Blueprint</span>
                  <h2 id="execution-trace-title">Execution Trace</h2>
                </div>
                <button
                  type="button"
                  className="execution-trace-close"
                  onClick={() => setShowExecutionTrace(false)}
                  aria-label="Close Execution Trace"
                >
                  ×
                </button>
              </div>

              <p className="execution-trace-summary">
                Execution Trace shows what happens inside your logic when it runs: step order, variable state, condition results, control flow, loop iterations, and final output.
              </p>

              <div className="execution-trace-table-section">
                <h3>Execution Trace - Tabular Explanation</h3>
                <div className="execution-trace-table-wrap">
                  <table className="execution-trace-table">
                    <thead>
                      <tr>
                        <th>Step No.</th>
                        <th>Execution Stage</th>
                        <th>What Happens</th>
                        <th>System Output / Display</th>
                        <th>Purpose</th>
                      </tr>
                    </thead>
                    <tbody>
                      {executionTraceExplanationRows.map((row) => (
                        <tr key={`trace-explain-${row.step}`}>
                          <td>{row.step}</td>
                          <td>{row.stage}</td>
                          <td>{row.happens}</td>
                          <td>{row.display}</td>
                          <td>{row.purpose}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="execution-trace-table-section">
                <h3>Example Table - Sample Execution Trace</h3>
                <p className="execution-trace-table-caption">
                  Problem: {problem?.title || 'Current problem'}
                </p>
                <div className="execution-trace-table-wrap">
                  <table className="execution-trace-table sample">
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Action</th>
                        <th>Variable State</th>
                        <th>Output / Condition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {executionTraceExampleRows.map((row) => (
                        <tr key={`trace-sample-${row.step}-${row.action}`}>
                          <td>{row.step}</td>
                          <td>{row.action}</td>
                          <td>
                            <pre>{row.variables}</pre>
                          </td>
                          <td>
                            <pre>{row.output}</pre>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="execution-trace-note">
                Use this to catch skipped branches, wrong loop exits, incorrect variable updates, and conditions that evaluate the opposite way from what you intended.
              </div>
            </div>
          </div>
        ) : null}

        <div className={`problem-content ${isCompetitionMode ? 'competition-workspace' : ''} ${focusMode ? 'focus-mode' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${!problemPaneVisible ? 'question-hidden' : ''} ${!blueprintPaneVisible ? 'blueprint-hidden' : ''}`}>
          {problemPaneVisible ? (
          <div className={`problem-panel ${isCompetitionMode ? 'competition-problem-panel' : ''}`}>
            {isCompetitionMode ? (
              <div className="competition-tabs">
                <button className="competition-tab active">Description</button>
                <button className="competition-tab">Submissions</button>
              </div>
            ) : null}
            {!isCompetitionMode ? (
              <button
                type="button"
                className="sidebar-collapse-toggle"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
              >
                {sidebarCollapsed ? 'Show Problem' : 'Collapse Problem'}
              </button>
            ) : null}
            <div className="problem-header">
              <div className="problem-title-row">
                <h1 className="problem-title">{problem?.title}</h1>
                <span className={`problem-difficulty ${problem?.difficulty}`}>
                  {problem?.difficulty}
                </span>
              </div>
              {isCompetitionMode ? (
                <div className="competition-problem-meta">
                  <span className="competition-mode-badge">Competition Mode</span>
                  <span className="competition-mode-note">Code directly and submit like a live contest round.</span>
                </div>
              ) : null}
            </div>

            <div className="problem-section problem-description-section">
              <p className="problem-description">{problem?.description}</p>
            </div>

            {problem?.constraints && (
              <div className="problem-section">
                <h3 className="problem-section-title">Constraints</h3>
                <div className="problem-constraints">
                  <ul>
                    {problem.constraints.split('\n').filter((c: string) => c.trim()).map((constraint: string, index: number) => (
                      <li key={index}>{constraint.trim().replace(/^[•\-]\s*/, '')}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {problem?.examples && Array.isArray(problem.examples) && problem.examples.length > 0 && (
              <div className="problem-section">
                <h3 className="problem-section-title">Examples</h3>
                <div className="problem-examples">
                  {problem.examples.map((example: any, index: number) => (
                    <div key={index} className="example-box">
                      <div className="example-label">Example {index + 1}:</div>
                      <div className="example-content">
                        <div><strong>Input:</strong> {JSON.stringify(example.input)}</div>
                        <div><strong>Output:</strong> {JSON.stringify(example.output)}</div>
                        {example.explanation && <div><strong>Explanation:</strong> {example.explanation}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          ) : null}

          <div className={`solution-panel ${isCompetitionMode ? 'competition-solution-panel' : ''}`}>
            <div className="solution-header">
              <h2 className="solution-title">{isCompetitionMode ? 'Code Editor' : 'Logic Engine'}</h2>
              <p className="solution-subtitle">
                {isCompetitionMode
                  ? 'Write, test, and submit your solution in a focused contest workspace.'
                  : 'Use the Blueprint as the source of truth. ThinkFlow syncs nodes into editor ghost hints.'}
              </p>
              <div className="draft-status-row">
                <span className="draft-status-text">
                  Draft autosave: {draftSavedAt ? `saved at ${draftSavedAt}` : 'waiting for your first edit'}
                </span>
                {!isCompetitionMode ? (
                  <button type="button" onClick={() => setFocusMode((prev) => !prev)} className="draft-clear-btn">
                    {focusMode ? 'Exit Focus' : 'Focus Mode'}
                  </button>
                ) : null}
                <button type="button" onClick={clearDraft} className="draft-clear-btn">
                  Clear Draft
                </button>
              </div>
              {!isCompetitionMode ? (
                <button 
                  onClick={getAISuggestion} 
                  disabled={loadingSuggestion}
                  className="btn btn-ai-suggestion"
                >
                  {loadingSuggestion ? (
                    <>
                      <FaRobot /> Thinking...
                    </>
                  ) : (
                    <>
                      <FaLightbulb /> Get AI Suggestion
                    </>
                  )}
                </button>
              ) : null}
            </div>

            {!isCompetitionMode && !focusMode && aiSuggestion && (
              <div className="ai-suggestion-box">
                <div className="ai-suggestion-header">
                  <span className="ai-badge"><FaRobot /> AI Assistant</span>
                </div>
                <div className="ai-suggestion-content">
                  {aiSuggestion.split('\n').map((line, idx) => (
                    <p key={idx}>{line}</p>
                  ))}
                </div>
              </div>
            )}

            {blueprintPaneVisible ? (
              <div className={`english-blueprint-panel audit-${blueprintPulseStatus}`}>
                <div className="english-blueprint-header">
                  <div>
                    <h3 className="problem-section-title">English-to-Code Blueprint</h3>
                    <p className="english-blueprint-subtitle">
                      Write your approach naturally. The editor below mirrors it as a live code skeleton, so you can move from thought to syntax without the old dropdown labels.
                    </p>
                  </div>
                  <div className="complexity-pill">
                    <span>Time {complexityEstimate.time}</span>
                    <span>Space {complexityEstimate.space}</span>
                  </div>
                </div>
                <div className="english-logic-editor-shell">
                  <div
                    ref={blueprintHighlightRef}
                    className="english-logic-highlight-layer"
                    aria-hidden="true"
                  >
                    {blueprintLines.map((line, index) => (
                      <span
                        key={`blueprint-highlight-${index}`}
                        className={`english-logic-highlight-line ${logicInsightTypeByLine[index + 1] || ''}`}
                      >
                        {line || ' '}
                      </span>
                    ))}
                  </div>
                  <textarea
                    ref={blueprintTextareaRef}
                    className={`english-logic-textarea ${logicInsights.length > 0 ? 'has-line-insights' : ''}`}
                    value={englishLogic}
                    onChange={(e) => handleEnglishLogicChange(e.target.value)}
                    onScroll={syncBlueprintHighlightScroll}
                    placeholder="Describe the exact algorithm for this problem. Keep it to one clear step per line."
                  />
                </div>
                <div className="logic-validation-row">
                  <span className={`logic-validation-badge ${logicValidationDisplayStatus}`}>
                    {parsingLogic
                      ? 'Syncing...'
                      : validatingLogic
                        ? 'Analyzing...'
                      : logicValidationDisplayStatus === 'correct'
                        ? 'Correct'
                        : logicValidationDisplayStatus === 'warning'
                          ? 'Needs edge cases'
                        : logicValidationDisplayStatus === 'incorrect'
                          ? 'Incorrect'
                          : 'Not validated yet'}
                  </span>
                  {logicValidation?.source ? (
                    <span className="logic-validation-source">Checked by {logicValidation.source}</span>
                  ) : null}
                  {parsingLogic ? (
                    <span className="logic-validation-source">Parsing Blueprint...</span>
                  ) : null}
                </div>
                <div className="logic-auditor-panel">
                  <div className="logic-auditor-title">Logic Auditor</div>
                  <div className="logic-auditor-list">
                    {auditorInsights.map((insight, index) => (
                      <div className={`logic-auditor-item ${insight.type}`} key={`audit-${index}-${insight.message}`}>
                        <span className="logic-auditor-icon">
                          {insight.type === 'error' ? '❌' : insight.type === 'warning' ? '⚠️' : '✅'}
                        </span>
                        <span>{insight.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {(showCodeEditor || isCompetitionMode) && (
              <div className="code-editor-container">
                <div className="code-editor-header">
                  <span className="code-editor-title">Code Editor</span>
                  <div className="code-editor-controls">
                    {!isCompetitionMode ? (
                      <>
                        <button
                          type="button"
                          onClick={handleAnalyzeCode}
                          disabled={analyzingCode}
                          className="code-analyze-btn"
                        >
                          <FaRobot /> {analyzingCode ? 'Analyzing...' : 'Analyze Code'}
                        </button>
                        <button
                          type="button"
                          onClick={handleSubmitCode}
                          disabled={submitting || criticalMismatchActive}
                          className="code-submit-btn"
                          title={criticalMismatchActive ? 'Resolve the Critical Mismatch in the Logic Auditor first.' : 'Submit code'}
                        >
                          {submitting ? 'Submitting...' : 'Submit Code'}
                        </button>
                        <button
                          type="button"
                          className="custom-json-toggle editor-test-toggle"
                          onClick={() => setShowTestTray((prev) => !prev)}
                        >
                          {showTestTray ? 'Hide Tests' : 'Tests'}
                        </button>
                        <select 
                          value={language} 
                          onChange={(e) => handleLanguageChange(e.target.value)}
                          className="language-selector"
                        >
                          <option value="javascript">JavaScript</option>
                          <option value="python">Python</option>
                          <option value="cpp">C++</option>
                          <option value="java">Java</option>
                          <option value="c">C</option>
                        </select>
                      </>
                    ) : (
                      <span className="competition-editor-status">Auto-save enabled</span>
                    )}
                    {syntaxErrors.length > 0 && (
                      <span className="code-editor-error-badge">
                        <FaExclamationTriangle /> {syntaxErrors.length} error{syntaxErrors.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                {!isCompetitionMode && logicBlockerActive ? (
                  <div className="logic-code-warning">
                    <FaExclamationTriangle />
                    <span>Warning: Your logic has a conflict with the problem requirements. We recommend fixing your Blueprint before coding.</span>
                  </div>
                ) : null}
                {!isCompetitionMode && !focusMode && codeAnalysis && (
                  <div className="code-analysis-panel">
                    <div className="code-analysis-title"><FaRobot /> Code Analysis Suggestions</div>
                    {codeAnalysis.source && (
                      <div className="code-analysis-source">Source: {codeAnalysis.source}</div>
                    )}
                    {codeAnalysis.answer && (
                      <div className="code-analysis-answer">{codeAnalysis.answer}</div>
                    )}
                    {Array.isArray(codeAnalysis.hints) && codeAnalysis.hints.length > 0 && (
                      <div className="code-analysis-block">
                        <div className="code-analysis-block-title">Hints</div>
                        {codeAnalysis.hints.map((hint: string, idx: number) => (
                          <div key={`analysis-hint-${idx}`} className="code-analysis-item">• {hint}</div>
                        ))}
                      </div>
                    )}
                    {Array.isArray(codeAnalysis.nextSteps) && codeAnalysis.nextSteps.length > 0 && (
                      <div className="code-analysis-block">
                        <div className="code-analysis-block-title">Next Steps</div>
                        {codeAnalysis.nextSteps.map((step: string, idx: number) => (
                          <div key={`analysis-step-${idx}`} className="code-analysis-item">• {step}</div>
                        ))}
                      </div>
                    )}
                    {Array.isArray(codeAnalysis.warnings) && codeAnalysis.warnings.length > 0 && (
                      <div className="code-analysis-block">
                        <div className="code-analysis-block-title">Watchouts</div>
                        {codeAnalysis.warnings.map((warning: string, idx: number) => (
                          <div key={`analysis-warning-${idx}`} className="code-analysis-item warning">• {warning}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {!isCompetitionMode && showTestTray ? (
                <div className="custom-test-panel">
                  <div className="custom-test-header">
                    <div>
                      <h4 className="custom-test-title">Custom Test Runner</h4>
                      <p className="custom-test-subtitle">
                        Keep JSON tucked away until you need a specific input/output check.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="custom-json-toggle"
                      onClick={() => {
                        setShowTestTray((prev) => !prev)
                      }}
                    >
                      {showTestTray ? 'Hide Tray' : 'Open Tests'}
                    </button>
                  </div>
                  <div className="custom-test-grid">
                    <div className="custom-test-col">
                      <label className="custom-test-label">Input (JSON)</label>
                      <textarea
                        className="custom-test-textarea"
                        value={customInputText}
                        onChange={(e) => {
                          customInputEditedRef.current = true
                          setCustomInputText(e.target.value)
                        }}
                      />
                    </div>
                    <div className="custom-test-col">
                      <label className="custom-test-label">Expected Output (JSON)</label>
                      <textarea
                        className="custom-test-textarea"
                        value={customExpectedText}
                        onChange={(e) => {
                          customExpectedEditedRef.current = true
                          setCustomExpectedText(e.target.value)
                        }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunCustomTest}
                    disabled={runningCustomTest}
                    className="custom-test-run-btn"
                  >
                    {runningCustomTest ? 'Running Custom Test...' : 'Run Custom Test'}
                  </button>
                  {customRunResult && (
                    <div className={`custom-test-result ${customRunResult.passed ? 'passed' : 'failed'}`}>
                      <div className="custom-test-result-title">
                        {customRunResult.passed ? 'Custom test passed' : 'Custom test failed'}
                      </div>
                      {customRunResult.error ? (
                        FATAL_DIAGNOSTIC_PHASES.has(customRunResult.errorDetails?.phase)
                          ? renderCompilerDiagnostic(customRunResult.errorDetails, true)
                          : <div className="custom-test-result-line">Error: {customRunResult.error}</div>
                      ) : (
                        <>
                          <div className="custom-test-result-line">Expected: {JSON.stringify(customRunResult.expectedOutput)}</div>
                          <div className="custom-test-result-line">Actual: {JSON.stringify(customRunResult.actualOutput)}</div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                ) : null}
                <Editor
                  height="100%"
                  language={language}
                  value={code}
                  onChange={handleCodeChange}
                  onMount={(editor, monaco) => {
                    setEditorInstance(editor)
                    editor.onDidChangeCursorPosition((event: any) => {
                      const line = event.position?.lineNumber || null
                      setActiveLine(line)
                      const matchingEntry = Object.entries(syncMapRef.current).find(([, range]) => (
                        line !== null &&
                        line >= range.implementationStartLine &&
                        line <= range.implementationEndLine + 3
                      ))
                      setFocusedNodeId(matchingEntry ? Number(matchingEntry[0]) : null)
                    })
                    
                    // Only configure JavaScript/TypeScript diagnostics for JavaScript language
                    if (language === 'javascript') {
                      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
                        noSemanticValidation: false,
                        noSyntaxValidation: false,
                      })
                      
                      monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
                        target: monaco.languages.typescript.ScriptTarget.ES2020,
                        allowNonTsExtensions: true,
                        checkJs: true,
                      })
                    } else {
                      // Disable TypeScript/JavaScript validation for other languages
                      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
                        noSemanticValidation: true,
                        noSyntaxValidation: true,
                      })
                      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                        noSemanticValidation: true,
                        noSyntaxValidation: true,
                      })
                    }
                  }}
                  theme={programmingTheme === 'light' ? 'vs' : 'vs-dark'}
                  options={{
                    minimap: { enabled: true },
                    glyphMargin: true,
                    fontSize: 14,
                    fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                    fontLigatures: true,
                    wordWrap: 'on' as const,
                    lineNumbers: 'on' as const,
                    rulers: [80, 120],
                    renderWhitespace: 'selection' as const,
                    bracketPairColorization: { enabled: true },
                    guides: {
                      bracketPairs: true,
                      indentation: true,
                    },
                    suggestOnTriggerCharacters: true,
                    quickSuggestions: {
                      other: true,
                      comments: false,
                      strings: false,
                    },
                    parameterHints: { enabled: true },
                    formatOnPaste: true,
                    formatOnType: true,
                    autoClosingBrackets: 'always' as const,
                    autoClosingQuotes: 'always' as const,
                    scrollBeyondLastLine: false,
                    padding: { top: 16, bottom: 16 },
                    tabSize: 2,
                    insertSpaces: true,
                  }}
                />
                {syntaxErrors.length > 0 && (
                  <div className="code-errors-panel">
                    <div className="code-errors-title"><FaExclamationTriangle /> Syntax Errors:</div>
                    {syntaxErrors.map((err, idx) => (
                      <div key={idx} className="code-error-item">
                        <span className="error-icon"><FaTimesCircle /></span>
                        <span className="error-message">{err.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!focusMode && (codeSubmission || isCompetitionMode) && (
              <div className={`submission-results ${isCompetitionMode ? 'competition-results-panel' : ''}`} style={{ marginTop: '2rem' }}>
                <div className="submission-results-header">
                  <div>
                    <span className="submission-results-eyebrow">Execution Result</span>
                    <h3 className="submission-results-title">Test Cases</h3>
                  </div>
                  <button
                    type="button"
                    className="submission-results-close"
                    onClick={() => setCodeSubmission(null)}
                    aria-label="Close test results"
                  >
                    ×
                  </button>
                </div>
                {isCompetitionMode ? (
                  <div className="competition-results-header">Test Result</div>
                ) : null}
                {codeSubmission ? (
                <>
                <div className={`submission-status ${codeSubmission.status}`}>
                  {getStatusIcon(codeSubmission.status)}
                  <span>
                    {codeSubmission.status === 'correct' && 'All Test Cases Passed!'}
                    {codeSubmission.status === 'partially_correct' && `Partially Correct (${codeSubmission.passedCount}/${codeSubmission.totalCount})`}
                    {codeSubmission.status === 'incorrect' && 'Test Cases Failed'}
                    {codeSubmission.status === 'error' && 'Execution Error'}
                  </span>
                </div>
                {submissionDiagnostic && renderCompilerDiagnostic(submissionDiagnostic)}
                {codeSubmission.score !== undefined && (
                  <div className="submission-score" style={{ marginTop: '1rem', fontSize: '1.1rem', fontWeight: 'bold' }}>
                    Score: {codeSubmission.score}/100
                  </div>
                )}
                {codeSubmission.performance && (
                  <div className="performance-summary">
                    <div className="performance-card">
                      <span className="performance-label">Runtime</span>
                      <strong>{formatExecutionTime(codeSubmission.performance.current?.executionTime)}</strong>
                      {codeSubmission.performance.ranking?.eligible && codeSubmission.performance.ranking?.beatsPercent !== null ? (
                        <small>Beats {codeSubmission.performance.ranking.beatsPercent}% accepted</small>
                      ) : (
                        <small>{codeSubmission.performance.ranking?.message || 'Run accepted code to rank'}</small>
                      )}
                    </div>
                    <div className="performance-card">
                      <span className="performance-label">Time</span>
                      <strong>{codeSubmission.performance.current?.timeComplexity || 'O(?)'}</strong>
                      <small>Inferred from submitted code</small>
                    </div>
                    <div className="performance-card">
                      <span className="performance-label">Space</span>
                      <strong>{codeSubmission.performance.current?.spaceComplexity || 'O(?)'}</strong>
                      <small>{codeSubmission.performance.current?.note || 'Static analysis estimate'}</small>
                    </div>
                    <div className="performance-card performance-rank-card">
                      <span className="performance-label">Rank</span>
                      {codeSubmission.performance.ranking?.eligible ? (
                        <>
                          <strong>
                            #{codeSubmission.performance.ranking.rank || '--'} / {codeSubmission.performance.ranking.totalAccepted || '--'}
                          </strong>
                          <small>
                            {codeSubmission.performance.ranking.betterSubmissions > 0
                              ? `${codeSubmission.performance.ranking.betterSubmissions} better accepted submission${codeSubmission.performance.ranking.betterSubmissions > 1 ? 's' : ''}`
                              : 'Current best tier'}
                          </small>
                        </>
                      ) : (
                        <>
                          <strong>Not ranked</strong>
                          <small>Pass all tests first</small>
                        </>
                      )}
                    </div>
                    {codeSubmission.performance.best && (
                      <div className="performance-best">
                        <span>Best accepted</span>
                        <strong>
                          {codeSubmission.performance.best.timeComplexity} time · {codeSubmission.performance.best.spaceComplexity} space · {formatExecutionTime(codeSubmission.performance.best.executionTime)}
                        </strong>
                        <small>{codeSubmission.performance.best.isYourSubmission ? 'This is your submission.' : 'Someone has a better accepted result.'}</small>
                      </div>
                    )}
                  </div>
                )}
                {codeSubmission.results && codeSubmission.results.length > 0 && (
                  <div className="test-results" style={{ marginTop: '1.5rem' }}>
                    <h4 style={{ marginBottom: '1rem', color: '#a8b2d1' }}>Test Case Results:</h4>
                    {codeSubmission.results.map((result: any, index: number) => (
                      <div 
                        key={index} 
                        className={`test-case-result ${result.passed ? 'passed' : 'failed'}`}
                        style={{
                          border: `2px solid ${result.passed ? '#4caf50' : '#f44336'}`,
                          borderRadius: '10px',
                          padding: '1.25rem',
                          marginBottom: '1rem',
                          backgroundColor: result.passed ? 'rgba(76, 175, 80, 0.08)' : 'rgba(244, 67, 54, 0.08)',
                        }}
                      >
                        <div className="test-result-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {result.passed ? 
                              <FaCheckCircle color="#4caf50" size={20} /> : 
                              <FaTimesCircle color="#f44336" size={20} />
                            }
                            <strong style={{ fontSize: '1.05rem', color: '#e6f1ff' }}>
                              Test Case {index + 1}
                            </strong>
                            <span className={`test-result-badge ${result.passed ? 'passed' : 'failed'}`}>
                              {result.passed ? 'PASSED' : 'FAILED'}
                            </span>
                          </div>
                          {result.executionTime !== undefined && (
                            <span style={{ 
                              fontSize: '0.85rem', 
                              color: '#8892b0',
                              fontFamily: "'Fira Code', monospace"
                            }}>
                              ⚡ {result.executionTime}ms
                            </span>
                          )}
                        </div>
                        
                        <div className="test-result-detail">
                          <span className="test-result-label">Input:</span>
                          <span className="test-result-value">
                            {JSON.stringify(result.input, null, 2)}
                          </span>
                        </div>
                        
                        <div className="test-result-detail">
                          <span className="test-result-label">Expected Output:</span>
                          <span className="test-result-value output-expected">
                            {JSON.stringify(result.expectedOutput, null, 2)}
                          </span>
                        </div>
                        
                        <div className="test-result-detail">
                          <span className="test-result-label">Your Output:</span>
                          <span className={`test-result-value ${result.passed ? 'output-actual' : 'output-wrong'}`}>
                            {result.actualOutput !== null ? JSON.stringify(result.actualOutput, null, 2) : 'null'}
                          </span>
                        </div>
                        
                        {result.error && (
                          FATAL_DIAGNOSTIC_PHASES.has(result.errorDetails?.phase)
                            ? renderCompilerDiagnostic(result.errorDetails, true)
                            : (
                              <div className="error-details-panel">
                                <div className="error-details-title">Error Details</div>
                                <div className="error-details-content">
                                  <div style={{ marginBottom: '0.5rem' }}>
                                    <strong>Message:</strong> {result.error}
                                  </div>
                                  {result.errorDetails?.message && (
                                    <div>{result.errorDetails.message}</div>
                                  )}
                                </div>
                              </div>
                            )
                        )}
                      </div>
                    ))}
                  </div>
                )}
                </>
                ) : isCompetitionMode ? (
                  <div className="competition-results-placeholder">Submit your code to see the latest competition verdict.</div>
                ) : null}
              </div>
            )}

            {!isCompetitionMode && !focusMode ? (
            <div className="history-section">
              <h3 className="problem-section-title">Submission History</h3>
              {loadingHistory ? (
                <p className="history-loading">Loading history...</p>
              ) : (
                <>
                  {!isCompetitionMode ? (
                  <div className="history-block">
                    <h4 className="history-block-title">Logic Attempts</h4>
                    {logicHistory.length === 0 ? (
                      <p className="history-empty">No logic submissions yet.</p>
                    ) : (
                      <div className="history-list">
                        {logicHistory.slice(0, 10).map((entry) => (
                          <div className="history-item" key={`logic-${entry.id}`}>
                            <span>v{entry.version}</span>
                            <span className={`history-status ${entry.status}`}>{entry.status}</span>
                            <span>{entry.score}/100</span>
                            <span>{new Date(entry.created_at).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  ) : null}
                  <div className="history-block">
                    <h4 className="history-block-title">Code Attempts</h4>
                    {codeHistory.length === 0 ? (
                      <p className="history-empty">No code submissions yet.</p>
                    ) : (
                      <div className="history-list">
                        {codeHistory.slice(0, 10).map((entry) => (
                          <div className="history-item" key={`code-${entry.id}`}>
                            <span>{entry.language}</span>
                            <span className={`history-status ${entry.status}`}>{entry.status}</span>
                            <span>{entry.passedCount}/{entry.totalCount}</span>
                            <span>{new Date(entry.created_at).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            ) : null}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
