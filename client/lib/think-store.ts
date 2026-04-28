'use client'

import { useSyncExternalStore } from 'react'
import type { LogicNode } from '@/context/logic-workspace.context'

type ThinkState = {
  logicNodes: LogicNode[]
  activeLine: number | null
}

type ThinkStore = ThinkState & {
  setLogicNodes: (nodes: LogicNode[]) => void
  setActiveLine: (line: number | null) => void
}

let state: ThinkState = {
  logicNodes: [],
  activeLine: null
}

const listeners = new Set<() => void>()

const setState = (patch: Partial<ThinkState>) => {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

export const useThinkStore = <T,>(selector: (store: ThinkStore) => T) => {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => selector({
      ...state,
      setLogicNodes: (nodes) => setState({ logicNodes: nodes }),
      setActiveLine: (line) => setState({ activeLine: line })
    }),
    () => selector({
      ...state,
      setLogicNodes: (nodes) => setState({ logicNodes: nodes }),
      setActiveLine: (line) => setState({ activeLine: line })
    })
  )
}

