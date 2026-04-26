'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { searchAddress } from '@/lib/api/geosearch'
import { fetchAgentData } from '@/lib/api/agent-client'
import { useParcelState, useParcelDispatch } from '@/lib/parcel-context'
import type { GeoSearchResult } from '@/lib/types'

export function AddressSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [alreadyPinned, setAlreadyPinned] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [searchError, setSearchError] = useState<string | null>(null)
  const timerRef = useRef<NodeJS.Timeout>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const state = useParcelState()
  const dispatch = useParcelDispatch()

  function handleChange(value: string) {
    setQuery(value)
    setAlreadyPinned(false)
    setSearchError(null)
    setActiveIndex(-1)
    clearTimeout(timerRef.current)
    if (value.trim().length < 3) {
      setResults([])
      setIsOpen(false)
      return
    }
    timerRef.current = setTimeout(() => {
      searchAddress(value)
        .then((r) => {
          setResults(r.slice(0, 5))
          setIsOpen(true)
          setSearchError(r.length > 0 ? null : 'No LA address found')
        })
        .catch((err) => {
          console.error('Search error:', err)
          setResults([])
          setSearchError('Search unavailable')
          setIsOpen(true)
        })
    }, 300)
  }

  function handleSelect(result: GeoSearchResult) {
    if (state.parcels.some((p) => p.bbl === result.bbl)) {
      setAlreadyPinned(true)
      setTimeout(() => setAlreadyPinned(false), 2000)
      setQuery('')
      setResults([])
      setIsOpen(false)
      return
    }

    const [lng, lat] = result.coordinates

    dispatch({
      type: 'PIN_PARCEL',
      parcel: {
        bbl: result.bbl,
        address: result.label,
        borough: result.borough,
        lat,
        lng,
        status: 'loading',
      },
    })

    setQuery('')
    setResults([])
    setIsOpen(false)

    dispatch({ type: 'UPDATE_PROGRESS', bbl: result.bbl, progress: 'Fetching LA parcel data...' })
    fetchAgentData({ bbl: result.bbl, lat, lng, address: result.label })
      .then((data) => dispatch({ type: 'PARCEL_READY', bbl: result.bbl, data }))
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Parcel analysis failed'
        dispatch({ type: 'PARCEL_ERROR', bbl: result.bbl, error: message })
      })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setIsOpen(false)
      setActiveIndex(-1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = activeIndex >= 0 ? results[activeIndex] : results[0]
      if (target) handleSelect(target)
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Search LA address..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          className="flex-1 h-9 rounded-lg bg-neutral-950 border border-neutral-700 px-3 text-sm text-white placeholder:text-neutral-400 font-mono outline-none focus:border-neutral-500 transition-colors"
        />
        <Button
          size="sm"
          disabled={!results[0]}
          onClick={() => {
            const target = results[0]
            if (target) handleSelect(target)
          }}
          className="gap-1.5 font-mono shrink-0"
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>

      {alreadyPinned && (
        <div className="absolute left-0 right-0 bg-neutral-950 border-neutral-700 mt-1 rounded-lg border px-3 py-2 font-mono text-xs text-neutral-400 shadow-xl z-10">
          Already pinned
        </div>
      )}

      {isOpen && searchError && (
        <div className="absolute left-0 right-0 bg-neutral-950 border-neutral-700 mt-1 rounded-lg border px-3 py-2 font-mono text-xs text-neutral-400 shadow-xl z-10">
          {searchError}
        </div>
      )}

      <div
        className={`absolute left-0 right-0 bg-neutral-950 border-neutral-700 mt-1 max-h-[240px] overflow-y-auto rounded-lg border shadow-xl z-10 ${
          isOpen && results.length > 0 ? 'block' : 'hidden'
        }`}
        role="listbox"
      >
        {results.map((result, i) => (
          <button
            key={result.bbl}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            className={`block w-full cursor-pointer px-3 py-2 text-left font-mono text-sm hover:bg-white/10 ${
              i === activeIndex ? 'bg-white/10' : ''
            }`}
            onClick={() => handleSelect(result)}
          >
            <span className="text-white">{result.name}</span>
            <span className="ml-2 text-neutral-400">{result.borough}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
