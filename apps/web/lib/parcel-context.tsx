'use client'

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import type { ParcelState, ParcelAction, SortableColumn } from './types'

const MAX_COMPARE = 4

const initialState: ParcelState = {
  parcels: [],
  hoveredBBL: null,
  sortColumn: null,
  sortDirection: 'asc',
  selectedBBL: null,
  compareBBLs: [],
  viewMode: 'table',
}

function parcelReducer(state: ParcelState, action: ParcelAction): ParcelState {
  switch (action.type) {
    case 'PIN_PARCEL':
      // Prevent duplicate pins
      if (state.parcels.some(p => p.bbl === action.parcel.bbl)) return state
      return { ...state, parcels: [...state.parcels, action.parcel] }

    case 'UPDATE_PROGRESS':
      return {
        ...state,
        parcels: state.parcels.map(p =>
          p.bbl === action.bbl
            ? { ...p, status: 'loading', agentProgress: action.progress, error: undefined }
            : p
        ),
      }

    case 'PARCEL_READY':
      return {
        ...state,
        parcels: state.parcels.map(p =>
          p.bbl === action.bbl ? { ...p, status: 'ready', data: action.data, agentProgress: undefined } : p
        ),
      }

    case 'PARCEL_ERROR':
      return {
        ...state,
        parcels: state.parcels.map(p =>
          p.bbl === action.bbl ? { ...p, status: 'error', error: action.error, agentProgress: undefined } : p
        ),
      }

    case 'REMOVE_PARCEL': {
      const newParcels = state.parcels.filter(p => p.bbl !== action.bbl)
      const newCompareBBLs = state.compareBBLs.filter(b => b !== action.bbl)
      return {
        ...state,
        parcels: newParcels,
        compareBBLs: newCompareBBLs,
        // If we removed the selected parcel, go back to table
        selectedBBL: state.selectedBBL === action.bbl ? null : state.selectedBBL,
        viewMode: state.selectedBBL === action.bbl ? 'table' : state.viewMode,
      }
    }

    case 'SET_HOVERED':
      return { ...state, hoveredBBL: action.bbl }

    case 'SET_SORT': {
      const isSameColumn = state.sortColumn === action.column
      return {
        ...state,
        sortColumn: action.column,
        sortDirection: isSameColumn && state.sortDirection === 'asc' ? 'desc' : 'asc',
      }
    }

    case 'SELECT_PARCEL':
      return { ...state, selectedBBL: action.bbl, viewMode: 'report' }

    case 'DESELECT_PARCEL':
      return { ...state, selectedBBL: null, viewMode: 'table' }

    case 'TOGGLE_COMPARE': {
      const exists = state.compareBBLs.includes(action.bbl)
      if (exists) {
        return { ...state, compareBBLs: state.compareBBLs.filter(b => b !== action.bbl) }
      }
      if (state.compareBBLs.length >= MAX_COMPARE) return state
      return { ...state, compareBBLs: [...state.compareBBLs, action.bbl] }
    }

    case 'CLEAR_COMPARE':
      return { ...state, compareBBLs: [], viewMode: 'table' }

    case 'START_COMPARE':
      if (state.compareBBLs.length < 2) return state
      return { ...state, viewMode: 'compare', selectedBBL: null }

    case 'SET_VIEW':
      return { ...state, viewMode: action.mode }

    case 'CLEAR_ALL':
      return initialState

    default:
      return state
  }
}

const ParcelContext = createContext<ParcelState>(initialState)
const ParcelDispatchContext = createContext<Dispatch<ParcelAction>>(() => {})

export function ParcelProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(parcelReducer, initialState)
  return (
    <ParcelContext.Provider value={state}>
      <ParcelDispatchContext.Provider value={dispatch}>
        {children}
      </ParcelDispatchContext.Provider>
    </ParcelContext.Provider>
  )
}

export function useParcelState() {
  return useContext(ParcelContext)
}

export function useParcelDispatch() {
  return useContext(ParcelDispatchContext)
}
