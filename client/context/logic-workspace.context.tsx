'use client'

import { createContext, ReactNode, useContext, useMemo, useState } from 'react'

export interface LogicNode {
  id: number
  text: string
  type: 'Input' | 'Process' | 'Condition' | 'Loop' | 'Output' | string
  isValid: boolean | null
  complexity: string
  starterComment: string
  error?: string | null
}

export interface SyncRange {
  startLine: number
  endLine: number
  commentLine: number
  implementationStartLine: number
  implementationEndLine: number
}

type SyncMap = Record<number, SyncRange>

interface LogicWorkspaceContextValue {
  nodes: LogicNode[]
  setNodes: (nodes: LogicNode[]) => void
  updateNode: (id: number, patch: Partial<LogicNode>) => void
  code: string
  setCode: (code: string | ((prev: string) => string)) => void
  syncMap: SyncMap
  setSyncMap: (syncMap: SyncMap) => void
  activeLine: number | null
  setActiveLine: (line: number | null) => void
  focusedNodeId: number | null
  setFocusedNodeId: (id: number | null) => void
  implementedNodeIds: number[]
  setImplementedNodeIds: (ids: number[]) => void
}

const LogicWorkspaceContext = createContext<LogicWorkspaceContextValue | null>(null)

export const LogicWorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const [nodes, setNodes] = useState<LogicNode[]>([])
  const [code, setCode] = useState('')
  const [syncMap, setSyncMap] = useState<SyncMap>({})
  const [activeLine, setActiveLine] = useState<number | null>(null)
  const [focusedNodeId, setFocusedNodeId] = useState<number | null>(null)
  const [implementedNodeIds, setImplementedNodeIds] = useState<number[]>([])

  const value = useMemo<LogicWorkspaceContextValue>(() => ({
    nodes,
    setNodes,
    updateNode: (id, patch) => {
      setNodes((prev) => prev.map((node) => (
        node.id === id ? { ...node, ...patch } : node
      )))
    },
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
  }), [activeLine, code, focusedNodeId, implementedNodeIds, nodes, syncMap])

  return (
    <LogicWorkspaceContext.Provider value={value}>
      {children}
    </LogicWorkspaceContext.Provider>
  )
}

export const useLogicWorkspace = () => {
  const context = useContext(LogicWorkspaceContext)
  if (!context) {
    throw new Error('useLogicWorkspace must be used inside LogicWorkspaceProvider')
  }
  return context
}

export type { SyncMap }
