'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import ProtectedRoute from '@/components/ProtectedRoute'
import { getCurrentUser, logout } from '@/lib/auth'
import api from '@/lib/api'
import { FaSignOutAlt, FaCheckCircle, FaTimesCircle, FaExclamationTriangle, FaArrowLeft, FaPlus, FaTrash, FaLightbulb, FaRobot } from 'react-icons/fa'
import dynamic from 'next/dynamic'
import './problem-detail.css'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

interface LogicStep {
  step_number: number
  description: string
  type?: string
}

interface EditorHint {
  title: string
  description: string
  snippet: string
}

export default function ProblemDetailPage() {
  const params = useParams()
  const router = useRouter()
  const problemId = params.id as string

  const [problem, setProblem] = useState<any>(null)
  const [logicSteps, setLogicSteps] = useState<LogicStep[]>([])
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('javascript')
  const [submission, setSubmission] = useState<any>(null)
  const [codeSubmission, setCodeSubmission] = useState<any>(null)
  const [executionSteps, setExecutionSteps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showCodeEditor, setShowCodeEditor] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [loadingSuggestion, setLoadingSuggestion] = useState(false)
  const [editorInstance, setEditorInstance] = useState<any>(null)
  const [syntaxErrors, setSyntaxErrors] = useState<any[]>([])
  const [showAIHelpPanel, setShowAIHelpPanel] = useState(false)
  const [aiHelpQuestion, setAiHelpQuestion] = useState('')
  const [aiHelpResponse, setAiHelpResponse] = useState<any>(null)
  const [loadingAIHelp, setLoadingAIHelp] = useState(false)
  const [editorHints, setEditorHints] = useState<EditorHint[]>([])
  const [logicHistory, setLogicHistory] = useState<any[]>([])
  const [codeHistory, setCodeHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [customInputText, setCustomInputText] = useState('{\n  "nums": [2, 7, 11, 15],\n  "target": 9\n}')
  const [customExpectedText, setCustomExpectedText] = useState('[0, 1]')
  const [customRunResult, setCustomRunResult] = useState<any>(null)
  const [runningCustomTest, setRunningCustomTest] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<string>('')
  const completionProviderRef = useRef<any>(null)
  const draftLoadedRef = useRef(false)

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
  }, [problemId])

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
    const fetchProblem = async () => {
      try {
        const response = await api.get(`/problems/${problemId}`)
        const fetchedProblem = response.data.problem
        setProblem(fetchedProblem)
        
        // Initialize logic steps based on problem difficulty
        const initialStepsCount = getInitialStepsCount(fetchedProblem?.difficulty)
        const initialSteps = Array.from({ length: initialStepsCount }, (_, i) => ({
          step_number: i + 1,
          description: '',
          type: i === 0 ? 'input' : i === initialStepsCount - 1 ? 'output' : 'process'
        }))
        setLogicSteps(initialSteps)
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

  const getInitialStepsCount = (difficulty: string) => {
    switch (difficulty?.toLowerCase()) {
      case 'easy':
        return 3
      case 'medium':
        return 5
      case 'hard':
        return 7
      default:
        return 4
    }
  }

  const buildEditorHints = (currentProblem: any, currentLanguage: string): EditorHint[] => {
    const title = (currentProblem?.title || '').toLowerCase()
    const functionTemplate =
      currentLanguage === 'python'
        ? 'def solve(input_data):\n    # 1) Parse input\n    # 2) Apply algorithm\n    # 3) Return output\n    return None\n'
        : currentLanguage === 'java'
          ? 'public class Solution {\n  public static Object solve(Object inputData) {\n    // 1) Parse input\n    // 2) Apply algorithm\n    // 3) Return output\n    return null;\n  }\n}\n'
          : currentLanguage === 'cpp'
            ? '#include <bits/stdc++.h>\nusing namespace std;\n\nint solve(vector<int>& nums) {\n  // 1) Parse input\n  // 2) Apply algorithm\n  // 3) Return output\n  return 0;\n}\n'
            : currentLanguage === 'c'
              ? '#include <stdio.h>\n\nint solve(int* nums, int n) {\n  // 1) Parse input\n  // 2) Apply algorithm\n  // 3) Return output\n  return 0;\n}\n'
              : 'function solve(inputData) {\n  // 1) Parse input\n  // 2) Apply algorithm\n  // 3) Return output\n  return null;\n}\n'

    const complexityComment =
      currentLanguage === 'python'
        ? '# Time: O(...)\n# Space: O(...)\n'
        : '// Time: O(...)\n// Space: O(...)\n'

    const commonHints: EditorHint[] = [
      {
        title: 'Starter Template',
        description: `Insert a ${currentLanguage} solve template.`,
        snippet: functionTemplate
      },
      {
        title: 'Complexity Note',
        description: 'Add time/space complexity placeholders.',
        snippet: complexityComment
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
      draftLoadedRef.current = true
      return
    }

    try {
      const draft = JSON.parse(rawDraft)
      if (draft.code && typeof draft.code === 'string') {
        setCode(draft.code)
      }
      if (draft.language && typeof draft.language === 'string') {
        setLanguage(draft.language)
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
    if (!draftLoadedRef.current || !problem) return
    const payload = {
      code,
      language,
      logicSteps,
      updatedAt: new Date().toISOString()
    }
    localStorage.setItem(getDraftStorageKey(), JSON.stringify(payload))
    setDraftSavedAt(new Date(payload.updatedAt).toLocaleString())
  }, [code, language, logicSteps, problem, problemId])

  const addLogicStep = () => {
    setLogicSteps([
      ...logicSteps,
      { step_number: logicSteps.length + 1, description: '', type: 'process' },
    ])
  }

  const removeLogicStep = (index: number) => {
    setLogicSteps(logicSteps.filter((_, i) => i !== index).map((step, i) => ({
      ...step,
      step_number: i + 1,
    })))
  }

  const updateLogicStep = (index: number, field: string, value: string) => {
    const updated = [...logicSteps]
    updated[index] = { ...updated[index], [field]: value }
    setLogicSteps(updated)
  }

  const handleSubmitLogic = async () => {
    if (logicSteps.some(step => !step.description.trim())) {
      alert('Please fill in all logic steps')
      return
    }

    setSubmitting(true)
    try {
      const response = await api.post('/submissions/logic', {
        problemId,
        logicSteps: logicSteps.map(({ step_number, ...rest }) => rest),
      })
      setSubmission(response.data.submission)
      setExecutionSteps(response.data.executionSteps || [])
      fetchSubmissionHistory()
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to submit logic')
    } finally {
      setSubmitting(false)
    }
  }

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
    const newCode = value || ''
    setCode(newCode)
    
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
        logicSubmissionId: submission?.id,
      })
      
      console.log('Submission response:', response.data)
      
      setCodeSubmission(response.data.submission)
      fetchSubmissionHistory()
      
      // Show success/failure message
      if (response.data.submission.status === 'correct') {
        alert('✓ All test cases passed!')
      } else if (response.data.submission.status === 'partially_correct') {
        alert(`⚠ ${response.data.submission.passedCount}/${response.data.submission.totalCount} test cases passed`)
      } else {
        alert('✗ Test cases failed. Check the results below for details.')
      }
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
      
      alert('✗ ' + errorMsg)
      console.log('Full error details:', error.response?.data)
      
      // If there's a detailed error, show it in the UI
      if (error.response?.data) {
        setCodeSubmission({
          status: 'error',
          error: errorMsg,
          results: [],
          message: errorMsg
        })
      }
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
      setCustomRunResult({
        passed: false,
        error: error.response?.data?.error || 'Failed to run custom test',
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

  const handleAskAIHelp = async () => {
    setLoadingAIHelp(true)
    setAiHelpResponse(null)
    try {
      const response = await api.post(`/problems/${problemId}/ai-help`, {
        question: aiHelpQuestion.trim() || 'Review my current code and suggest next steps',
        code,
        language,
        logicSteps: logicSteps.map(({ step_number, ...rest }) => rest)
      })
      setAiHelpResponse(response.data.help)
    } catch (error: any) {
      console.error('Failed to get AI help:', error)
      setAiHelpResponse({
        answer: error.response?.data?.error || 'Unable to fetch AI help right now.',
        hints: [],
        nextSteps: [],
        warnings: []
      })
    } finally {
      setLoadingAIHelp(false)
    }
  }

  const getAISuggestion = async () => {
    setLoadingSuggestion(true)
    setAiSuggestion('')
    
    try {
      // Simulate AI suggestion - In production, this would call an AI API
      const suggestions = generateAISuggestion(problem)
      setAiSuggestion(suggestions)
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
      default:
        return null
    }
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

  return (
    <ProtectedRoute>
      <div className="problem-detail-container">
        <nav className="problem-navbar">
          <div className="problem-navbar-content">
            <div className="problem-brand" onClick={() => router.push('/dashboard')}>
              <div className="problem-brand-icon">
                <Image src="/assets/logo.jpeg" alt="ThinkFlow Logo" width={40} height={40} />
              </div>
              <span className="problem-brand-text">ThinkFlow</span>
            </div>
            <div className="problem-navbar-actions">
              <button onClick={() => router.push('/problems')} className="problem-back-btn">
                <FaArrowLeft /> Back to Problems
              </button>
              <button onClick={handleLogout} className="problem-logout-btn">
                <FaSignOutAlt /> Logout
              </button>
            </div>
          </div>
        </nav>

        <div className="problem-content">
          <div className="problem-panel">
            <div className="problem-header">
              <div className="problem-title-row">
                <h1 className="problem-title">{problem?.title}</h1>
                <span className={`problem-difficulty ${problem?.difficulty}`}>
                  {problem?.difficulty}
                </span>
              </div>
            </div>

            <div className="problem-section">
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

          <div className="solution-panel">
            <div className="solution-header">
              <h2 className="solution-title">Solution Logic</h2>
              <p className="solution-subtitle">Break down your solution into structured steps. Be specific about what each step does.</p>
              <div className="draft-status-row">
                <span className="draft-status-text">
                  Draft autosave: {draftSavedAt ? `saved at ${draftSavedAt}` : 'waiting for your first edit'}
                </span>
                <button type="button" onClick={clearDraft} className="draft-clear-btn">
                  Clear Draft
                </button>
              </div>
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
            </div>

            {aiSuggestion && (
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

            <div className="logic-steps-container">
              {logicSteps.map((step, index) => (
                <div key={index} className="logic-step">
                  <div className="logic-step-header">
                    <span className="logic-step-number">Step {step.step_number}</span>
                    {logicSteps.length > 1 && (
                      <button
                        onClick={() => removeLogicStep(index)}
                        className="logic-step-remove"
                      >
                        <FaTrash size={12} /> Remove
                      </button>
                    )}
                  </div>
                  <select
                    className="logic-step-select"
                    value={step.type || 'process'}
                    onChange={(e) => updateLogicStep(index, 'type', e.target.value)}
                  >
                    <option value="input">Input Processing</option>
                    <option value="process">Processing</option>
                    <option value="condition">Conditional Logic</option>
                    <option value="loop">Loop/Iteration</option>
                    <option value="output">Output</option>
                  </select>
                  <textarea
                    className="logic-step-textarea"
                    value={step.description}
                    onChange={(e) => updateLogicStep(index, 'description', e.target.value)}
                    placeholder="Describe what this step does..."
                  />
                </div>
              ))}
            </div>

            <div className="action-buttons">
              <button onClick={addLogicStep} className="btn btn-secondary">
                <FaPlus /> Add Step
              </button>
              <button onClick={getAISuggestion} disabled={loadingSuggestion} className="btn btn-ai">
                <FaLightbulb /> {loadingSuggestion ? 'Loading...' : 'Need Help?'}
              </button>
              <button
                onClick={handleSubmitLogic}
                disabled={submitting}
                className="btn btn-primary"
              >
                {submitting ? 'Submitting...' : 'Submit Logic for Evaluation'}
              </button>
            </div>

            {submission && (
              <div className="submission-results">
                <div className={`submission-status ${submission.status}`}>
                  {getStatusIcon(submission.status)}
                  <span>
                    {submission.status === 'correct' && 'Correct Solution!'}
                    {submission.status === 'partially_correct' && 'Partially Correct'}
                    {submission.status === 'incorrect' && 'Incorrect Solution'}
                  </span>
                </div>
                {submission.feedback && (
                  <div className="submission-feedback">{submission.feedback}</div>
                )}
              </div>
            )}

            {showCodeEditor && (
              <div className="code-editor-container">
                <div className="code-editor-header">
                  <span className="code-editor-title">Code Editor</span>
                  <div className="code-editor-controls">
                    <button
                      onClick={() => setShowAIHelpPanel((prev) => !prev)}
                      className="code-ai-help-btn"
                    >
                      <FaRobot /> {showAIHelpPanel ? 'Hide AI Help' : 'AI Help'}
                    </button>
                    <select 
                      value={language} 
                      onChange={(e) => setLanguage(e.target.value)}
                      className="language-selector"
                    >
                      <option value="javascript">JavaScript</option>
                      <option value="python">Python</option>
                      <option value="cpp">C++</option>
                      <option value="java">Java</option>
                      <option value="c">C</option>
                    </select>
                    {syntaxErrors.length > 0 && (
                      <span className="code-editor-error-badge">
                        <FaExclamationTriangle /> {syntaxErrors.length} error{syntaxErrors.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="code-hints-panel">
                  <div className="code-hints-title"><FaLightbulb /> Smart Hints</div>
                  <div className="code-hints-list">
                    {editorHints.map((hint, index) => (
                      <div className="code-hint-card" key={`${hint.title}-${index}`}>
                        <div className="code-hint-copy">
                          <div className="code-hint-label">{hint.title}</div>
                          <div className="code-hint-description">{hint.description}</div>
                        </div>
                        <button
                          type="button"
                          className="code-hint-insert-btn"
                          onClick={() => insertHintSnippet(hint.snippet)}
                        >
                          Insert
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                {showAIHelpPanel && (
                  <div className="ai-help-panel">
                    <div className="ai-help-title"><FaRobot /> AI Help Assistant</div>
                    <p className="ai-help-subtitle">
                      Ask for debugging guidance, optimization ideas, or edge-case checks based on your current code.
                    </p>
                    <textarea
                      className="ai-help-input"
                      value={aiHelpQuestion}
                      onChange={(e) => setAiHelpQuestion(e.target.value)}
                      placeholder="Example: Why does my loop miss edge cases for empty arrays?"
                    />
                    <button
                      className="ai-help-ask-btn"
                      onClick={handleAskAIHelp}
                      disabled={loadingAIHelp}
                    >
                      <FaRobot /> {loadingAIHelp ? 'Analyzing...' : 'Ask AI Help'}
                    </button>
                    {aiHelpResponse && (
                      <div className="ai-help-response">
                        <div className="ai-help-answer">{aiHelpResponse.answer}</div>
                        {Array.isArray(aiHelpResponse.hints) && aiHelpResponse.hints.length > 0 && (
                          <div className="ai-help-list-block">
                            <div className="ai-help-list-title">Hints</div>
                            {aiHelpResponse.hints.map((hint: string, idx: number) => (
                              <div key={`hint-${idx}`} className="ai-help-item">• {hint}</div>
                            ))}
                          </div>
                        )}
                        {Array.isArray(aiHelpResponse.nextSteps) && aiHelpResponse.nextSteps.length > 0 && (
                          <div className="ai-help-list-block">
                            <div className="ai-help-list-title">Next Steps</div>
                            {aiHelpResponse.nextSteps.map((step: string, idx: number) => (
                              <div key={`step-${idx}`} className="ai-help-item">• {step}</div>
                            ))}
                          </div>
                        )}
                        {Array.isArray(aiHelpResponse.warnings) && aiHelpResponse.warnings.length > 0 && (
                          <div className="ai-help-list-block">
                            <div className="ai-help-list-title">Watchouts</div>
                            {aiHelpResponse.warnings.map((warning: string, idx: number) => (
                              <div key={`warning-${idx}`} className="ai-help-item warning">• {warning}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="custom-test-panel">
                  <h4 className="custom-test-title">Custom Test Runner</h4>
                  <p className="custom-test-subtitle">
                    Validate your code on your own input/output before submitting official test cases.
                  </p>
                  <div className="custom-test-grid">
                    <div className="custom-test-col">
                      <label className="custom-test-label">Input (JSON)</label>
                      <textarea
                        className="custom-test-textarea"
                        value={customInputText}
                        onChange={(e) => setCustomInputText(e.target.value)}
                      />
                    </div>
                    <div className="custom-test-col">
                      <label className="custom-test-label">Expected Output (JSON)</label>
                      <textarea
                        className="custom-test-textarea"
                        value={customExpectedText}
                        onChange={(e) => setCustomExpectedText(e.target.value)}
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
                        <div className="custom-test-result-line">Error: {customRunResult.error}</div>
                      ) : (
                        <>
                          <div className="custom-test-result-line">Expected: {JSON.stringify(customRunResult.expectedOutput)}</div>
                          <div className="custom-test-result-line">Actual: {JSON.stringify(customRunResult.actualOutput)}</div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <Editor
                  height="500px"
                  language={language}
                  value={code}
                  onChange={handleCodeChange}
                  onMount={(editor, monaco) => {
                    setEditorInstance(editor)
                    
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
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: true },
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

            <div className="action-buttons" style={{ marginTop: '2rem' }}>
              <button
                onClick={() => setShowCodeEditor(!showCodeEditor)}
                className="btn btn-secondary"
              >
                {showCodeEditor ? 'Hide' : 'Show'} Code Editor
              </button>
              {showCodeEditor && (
                <button
                  onClick={handleSubmitCode}
                  disabled={submitting}
                  className="btn btn-primary"
                >
                  {submitting ? 'Submitting...' : 'Submit Code'}
                </button>
              )}
            </div>

            {codeSubmission && (
              <div className="submission-results" style={{ marginTop: '2rem' }}>
                <div className={`submission-status ${codeSubmission.status}`}>
                  {getStatusIcon(codeSubmission.status)}
                  <span>
                    {codeSubmission.status === 'correct' && 'All Test Cases Passed!'}
                    {codeSubmission.status === 'partially_correct' && `Partially Correct (${codeSubmission.passedCount}/${codeSubmission.totalCount})`}
                    {codeSubmission.status === 'incorrect' && 'Test Cases Failed'}
                    {codeSubmission.status === 'error' && 'Execution Error'}
                  </span>
                </div>
                {codeSubmission.score !== undefined && (
                  <div className="submission-score" style={{ marginTop: '1rem', fontSize: '1.1rem', fontWeight: 'bold' }}>
                    Score: {codeSubmission.score}/100
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
                          <div className="error-details-panel">
                            <div className="error-details-title">❌ Error Details:</div>
                            <div className="error-details-content">
                              <div style={{ marginBottom: '0.5rem' }}>
                                <strong>Message:</strong> {result.error}
                              </div>
                              {result.errorDetails && (
                                <>
                                  {result.errorDetails.lineNumber && (
                                    <div style={{ marginBottom: '0.5rem' }}>
                                      <strong>Line:</strong> {result.errorDetails.lineNumber}
                                      {result.errorDetails.columnNumber && `, Column: ${result.errorDetails.columnNumber}`}
                                    </div>
                                  )}
                                  {result.errorDetails.errorLine && (
                                    <div style={{ 
                                      marginTop: '0.75rem',
                                      padding: '0.75rem',
                                      background: 'rgba(0, 0, 0, 0.3)',
                                      borderRadius: '6px',
                                      borderLeft: '3px solid #ff7675'
                                    }}>
                                      <div style={{ fontSize: '0.8rem', color: '#8892b0', marginBottom: '0.25rem' }}>
                                        Problematic code:
                                      </div>
                                      <code style={{ color: '#ff7675' }}>
                                        {result.errorDetails.errorLine}
                                      </code>
                                    </div>
                                  )}
                                  {result.errorDetails.suggestion && (
                                    <div className="error-suggestion">
                                      {result.errorDetails.suggestion}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {executionSteps.length > 0 && (
              <div className="execution-steps">
                <h3 className="problem-section-title">Step-by-Step Execution</h3>
                {executionSteps.map((step, index) => (
                  <div key={index} className="execution-step">
                    <div className="execution-step-number">Step {step.stepNumber}</div>
                    <div className="execution-step-content">
                      <div>{step.stepDescription}</div>
                      {step.variablesState && Object.keys(step.variablesState).length > 0 && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                          Variables: {JSON.stringify(step.variablesState)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="history-section">
              <h3 className="problem-section-title">Submission History</h3>
              {loadingHistory ? (
                <p className="history-loading">Loading history...</p>
              ) : (
                <>
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
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
