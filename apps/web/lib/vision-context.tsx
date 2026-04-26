'use client'

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import type { VisionEntry, VisionAction, ComparativeReport, ComparativeStatus } from './types'

interface VisionState {
  visionByBBL: Record<string, VisionEntry>
  comparativeReport: ComparativeReport | null
  comparativeStatus: ComparativeStatus
}

const initialState: VisionState = {
  visionByBBL: {},
  comparativeReport: null,
  comparativeStatus: 'idle',
}

function visionReducer(state: VisionState, action: VisionAction): VisionState {
  switch (action.type) {
    case 'VISION_START':
      return {
        ...state,
        visionByBBL: {
          ...state.visionByBBL,
          [action.bbl]: { status: 'loading', data: null, error: null },
        },
      }

    case 'VISION_READY':
      return {
        ...state,
        visionByBBL: {
          ...state.visionByBBL,
          [action.bbl]: { status: 'ready', data: action.data, error: null },
        },
      }

    case 'VISION_ERROR':
      return {
        ...state,
        visionByBBL: {
          ...state.visionByBBL,
          [action.bbl]: { status: 'error', data: null, error: action.error },
        },
      }

    case 'VISION_CLEAR': {
      const { [action.bbl]: _, ...rest } = state.visionByBBL
      return { ...state, visionByBBL: rest }
    }

    case 'COMPARE_START':
      return {
        ...state,
        comparativeStatus: 'loading',
        comparativeReport: null,
      }

    case 'COMPARE_READY':
      return {
        ...state,
        comparativeStatus: 'ready',
        comparativeReport: action.report,
      }

    case 'COMPARE_ERROR':
      return {
        ...state,
        comparativeStatus: 'error',
        comparativeReport: null,
      }

    case 'COMPARE_CLEAR':
      return {
        ...state,
        comparativeStatus: 'idle',
        comparativeReport: null,
      }

    default:
      return state
  }
}

const VisionContext = createContext<VisionState>(initialState)
const VisionDispatchContext = createContext<Dispatch<VisionAction>>(() => {})

export function VisionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(visionReducer, initialState)
  return (
    <VisionContext.Provider value={state}>
      <VisionDispatchContext.Provider value={dispatch}>
        {children}
      </VisionDispatchContext.Provider>
    </VisionContext.Provider>
  )
}

export function useVisionState() {
  return useContext(VisionContext)
}

export function useVisionDispatch() {
  return useContext(VisionDispatchContext)
}
