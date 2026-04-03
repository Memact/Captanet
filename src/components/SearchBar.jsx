import { useEffect, useMemo, useRef, useState } from 'react'

function isPrintableKey(event) {
  return (
    event.key.length === 1 &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey
  )
}

export default function SearchBar({
  value,
  onChange,
  onSubmit,
  onSuggestionClick,
  onVoiceTrigger,
  placeholder = 'Message',
  loading = false,
  disabled = false,
  suggestions = [],
  timeFilters = [],
  activeTimeFilter = null,
  onTimeFilter,
  onFocusChange,
  onDockVisibilityChange,
  voiceEnabled = false,
  voiceState = 'idle',
  dockPlacement = 'down',
}) {
  const [focused, setFocused] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [typedBeforeSelection, setTypedBeforeSelection] = useState('')
  const blurTimerRef = useRef(null)
  const dockPointerDownRef = useRef(false)
  const inputRef = useRef(null)
  const shellRef = useRef(null)
  const [dockStyle, setDockStyle] = useState(null)

  const visibleSuggestions = useMemo(() => suggestions.slice(0, 12), [suggestions])
  const chipsVisible = focused && !value.trim() && timeFilters.length > 0
  const dockVisible = focused && (chipsVisible || visibleSuggestions.length > 0)
  const selectedSuggestion =
    selectedIndex >= 0 && selectedIndex < visibleSuggestions.length
      ? visibleSuggestions[selectedIndex]
      : null
  const previewActive = Boolean(selectedSuggestion)
  const inputValue = previewActive ? selectedSuggestion.completion : value
  const showEnterAction = Boolean(value.trim())

  useEffect(() => {
    onFocusChange?.(focused)
  }, [focused, onFocusChange])

  useEffect(() => {
    onDockVisibilityChange?.(dockVisible)
  }, [dockVisible, onDockVisibilityChange])

  useEffect(() => {
    if (!dockVisible) {
      setDockStyle(null)
      return undefined
    }

    const updateDockStyle = () => {
      if (!shellRef.current || typeof window === 'undefined') {
        return
      }

      const rect = shellRef.current.getBoundingClientRect()
      const viewportHeight =
        window.visualViewport?.height ||
        window.innerHeight ||
        document.documentElement.clientHeight ||
        0
      const viewportOffsetTop = window.visualViewport?.offsetTop || 0
      const bottomPadding = 16
      if (dockPlacement === 'up') {
        const availableHeight = Math.max(
          96,
          Math.floor(rect.top - viewportOffsetTop - bottomPadding)
        )

        setDockStyle({
          position: 'fixed',
          top: `${Math.round(rect.top - availableHeight + 1)}px`,
          left: `${Math.round(rect.left)}px`,
          width: `${Math.round(rect.width)}px`,
          maxHeight: `${availableHeight}px`,
        })
        return
      }

      const availableHeight = Math.max(
        96,
        Math.floor(viewportHeight + viewportOffsetTop - rect.bottom - bottomPadding)
      )

      setDockStyle({
        position: 'fixed',
        top: `${Math.round(rect.bottom - 1)}px`,
        left: `${Math.round(rect.left)}px`,
        width: `${Math.round(rect.width)}px`,
        maxHeight: `${availableHeight}px`,
      })
    }

    updateDockStyle()

    const visualViewport = window.visualViewport
    window.addEventListener('resize', updateDockStyle)
    window.addEventListener('scroll', updateDockStyle, true)
    visualViewport?.addEventListener('resize', updateDockStyle)
    visualViewport?.addEventListener('scroll', updateDockStyle)

    return () => {
      window.removeEventListener('resize', updateDockStyle)
      window.removeEventListener('scroll', updateDockStyle, true)
      visualViewport?.removeEventListener('resize', updateDockStyle)
      visualViewport?.removeEventListener('scroll', updateDockStyle)
    }
  }, [dockPlacement, dockVisible, visibleSuggestions.length, timeFilters.length])

  useEffect(() => {
    if (!focused) {
      setSelectedIndex(-1)
    }
  }, [focused])

  useEffect(() => {
    if (!previewActive) {
      return
    }

    if (
      selectedIndex >= visibleSuggestions.length ||
      visibleSuggestions[selectedIndex]?.completion !== selectedSuggestion?.completion
    ) {
      setSelectedIndex(-1)
    }
  }, [previewActive, selectedIndex, selectedSuggestion?.completion, visibleSuggestions])

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) {
        window.clearTimeout(blurTimerRef.current)
      }
    }
  }, [])

  const clearPreview = () => {
    setSelectedIndex(-1)
  }

  const maintainInputFocus = () => {
    if (blurTimerRef.current) {
      window.clearTimeout(blurTimerRef.current)
      blurTimerRef.current = null
    }
    setFocused(true)
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
  }

  const makeSearchPassive = () => {
    if (blurTimerRef.current) {
      window.clearTimeout(blurTimerRef.current)
      blurTimerRef.current = null
    }
    dockPointerDownRef.current = false
    clearPreview()
    setFocused(false)
    window.requestAnimationFrame(() => {
      inputRef.current?.blur()
    })
  }

  const selectSuggestion = (index) => {
    if (!visibleSuggestions.length) {
      return
    }

    if (selectedIndex === -1) {
      setTypedBeforeSelection(value)
    }

    const bounded = Math.max(0, Math.min(index, visibleSuggestions.length - 1))
    setSelectedIndex(bounded)
  }

  const commitSuggestion = (suggestion, { keepFocused = true } = {}) => {
    if (!suggestion) {
      return
    }
    clearPreview()
    setTypedBeforeSelection(suggestion.completion)
    onChange?.(suggestion.completion)
    if (keepFocused) {
      maintainInputFocus()
    }
  }

  const submitSuggestion = (suggestion, { passiveAfterSubmit = false } = {}) => {
    if (!suggestion) {
      return
    }
    commitSuggestion(suggestion, { keepFocused: !passiveAfterSubmit })
    if (passiveAfterSubmit) {
      makeSearchPassive()
    }
    onSuggestionClick?.(suggestion.completion)
  }

  const handleBlur = () => {
    blurTimerRef.current = window.setTimeout(() => {
      if (dockPointerDownRef.current) {
        dockPointerDownRef.current = false
        inputRef.current?.focus()
        return
      }
      setFocused(false)
      clearPreview()
    }, 140)
  }

  const handleFocus = () => {
    if (blurTimerRef.current) {
      window.clearTimeout(blurTimerRef.current)
      blurTimerRef.current = null
    }
    setFocused(true)
    if (selectedIndex === -1) {
      setTypedBeforeSelection(value)
    }
  }

  return (
    <section className={`search-cluster ${dockVisible ? 'is-attached' : ''} ${dockPlacement === 'up' ? 'is-docked-up' : ''}`}>
      <form
        ref={shellRef}
        className={`search-shell ${focused || value.trim() ? 'is-active' : ''} ${dockVisible ? 'is-attached' : ''} ${dockPlacement === 'up' ? 'is-docked-up' : ''}`}
        onSubmit={(event) => {
          event.preventDefault()
          if (selectedSuggestion) {
            submitSuggestion(selectedSuggestion, { passiveAfterSubmit: true })
            return
          }
          onSubmit?.(value)
          makeSearchPassive()
        }}
      >
        <input
          ref={inputRef}
          className={`search-input ${!value ? 'is-empty' : ''} ${previewActive ? 'is-preview' : ''}`}
          value={inputValue}
          onChange={(event) => {
            clearPreview()
            onChange?.(event.target.value)
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={(event) => {
            if (previewActive && isPrintableKey(event)) {
              event.preventDefault()
              clearPreview()
              onChange?.(`${typedBeforeSelection}${event.key}`)
              return
            }

            if (previewActive && event.key === 'Backspace') {
              event.preventDefault()
              clearPreview()
              onChange?.(typedBeforeSelection.slice(0, -1))
              return
            }

            if (previewActive && event.key === 'Delete') {
              event.preventDefault()
              clearPreview()
              onChange?.(typedBeforeSelection)
              return
            }

            if (event.key === 'ArrowDown') {
              event.preventDefault()
              if (selectedIndex === -1) {
                setTypedBeforeSelection(value)
                selectSuggestion(0)
                return
              }
              selectSuggestion((selectedIndex + 1) % visibleSuggestions.length)
              return
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault()
              if (selectedIndex === -1) {
                setTypedBeforeSelection(value)
                selectSuggestion(visibleSuggestions.length - 1)
                return
              }
              selectSuggestion((selectedIndex - 1 + visibleSuggestions.length) % visibleSuggestions.length)
              return
            }

            if (event.key === 'Escape') {
              clearPreview()
              setFocused(false)
              event.currentTarget.blur()
              return
            }

            if (event.key === 'Tab' && selectedSuggestion) {
              event.preventDefault()
              commitSuggestion(selectedSuggestion)
              return
            }

            if (event.key === 'Enter' && selectedSuggestion) {
              event.preventDefault()
              submitSuggestion(selectedSuggestion, { passiveAfterSubmit: true })
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="send"
          aria-label="Recall"
          disabled={disabled}
        />

        <button
          className={`search-button ${
            showEnterAction
              ? 'is-enter'
              : voiceState === 'processing'
                ? 'is-voice is-processing'
                : voiceState === 'listening'
                  ? 'is-voice is-listening'
                  : 'is-voice'
          }`}
          type={showEnterAction ? 'submit' : 'button'}
          aria-label={
            showEnterAction
              ? 'Send recall'
              : voiceState === 'processing'
                ? 'Transcribing voice input'
                : voiceState === 'listening'
                ? 'Stop voice input'
                : 'Start voice input'
          }
          disabled={
            disabled ||
            loading ||
            (!showEnterAction && (!voiceEnabled || voiceState === 'processing'))
          }
          onClick={
            showEnterAction
              ? undefined
              : (event) => {
                  event.preventDefault()
                  onVoiceTrigger?.()
                }
          }
        />
      </form>

      {dockVisible ? (
        <div
          className={`suggestion-dock ${dockVisible ? 'is-attached' : ''} ${dockPlacement === 'up' ? 'is-attached-top' : ''}`}
          style={dockStyle || undefined}
          onPointerDownCapture={() => {
            dockPointerDownRef.current = true
          }}
          onPointerUpCapture={() => {
            window.setTimeout(() => {
              dockPointerDownRef.current = false
            }, 0)
          }}
        >
          {chipsVisible ? (
            <div className="time-chip-row" role="group" aria-label="Time filters">
              {timeFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={`time-filter-chip ${activeTimeFilter === filter.value ? 'is-active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onTimeFilter?.(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          ) : null}

          {visibleSuggestions.length ? (
            <>
              {!chipsVisible ? <div className="suggestion-heading">SUGGESTED QUESTIONS</div> : null}

              <div
                className="suggestion-list"
                onWheel={(event) => {
                  event.stopPropagation()
                }}
              >
                {visibleSuggestions.map((suggestion, index) => (
                <button
                    key={suggestion.id}
                    type="button"
                    className={`suggestion-card ${selectedIndex === index ? 'is-active' : ''}`}
                    onPointerDown={(event) => event.preventDefault()}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => selectSuggestion(index)}
                    onMouseLeave={clearPreview}
                    onClick={() => submitSuggestion(suggestion, { passiveAfterSubmit: true })}
                  >
                    <span className="suggestion-meta">{suggestion.category}</span>
                    <span className="suggestion-title">{suggestion.title}</span>
                    <span className="suggestion-subtitle">{suggestion.subtitle}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
