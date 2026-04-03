import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MathRichText from '../components/MathRichText'
import ConversationThread from '../components/ConversationThread'
import SearchBar from '../components/SearchBar'
import ResultCard from '../components/ResultCard'
import { useBrain } from '../hooks/useBrain'
import { APP_VERSION_LABEL } from '../lib/appMeta'

const EXPERIMENT_NOTICE_KEY = 'memact.experimental_notice.dismissed'
const CHAT_THREADS_KEY = 'memact.chat-threads'

function normalize(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeRichText(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = text
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split(/\n+/)
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
    )
    .filter(Boolean)
  return blocks.join('\n\n').trim()
}

function getExperimentNoticeDismissed() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(EXPERIMENT_NOTICE_KEY) === 'true'
  } catch {
    return false
  }
}

function setExperimentNoticeDismissed(value) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(EXPERIMENT_NOTICE_KEY, value ? 'true' : 'false')
  } catch {}
}

function formatHistoryTime(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
      .format(new Date(value))
      .replace(',', ' \u2022')
  } catch {
    return value
  }
}

function toTitleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatRelationshipScore(value) {
  const score = Number(value || 0)
  if (!Number.isFinite(score) || score <= 0) {
    return ''
  }
  return score.toFixed(2)
}

function openExternal(url) {
  if (!url) return
  window.open(url, '_blank', 'noreferrer')
}

function createThreadId() {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readChatThreads() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(CHAT_THREADS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

function writeChatThreads(threads) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(CHAT_THREADS_KEY, JSON.stringify((threads || []).slice(0, 12)))
  } catch {}
}

function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

const STRUCTURED_POINT_IGNORE = [
  /^summary$/i,
  /^saved snippet$/i,
  /^full extracted text$/i,
  /^captured page view$/i,
  /^captured results$/i,
  /^raw captured text$/i,
  /^show raw captured text$/i,
]

const STRUCTURED_POINT_SYNTHETIC = [
  /^(article|page|document|pdf|website|search results?) about\b/i,
  /^google results page\b/i,
  /^captured (page view|results)\b/i,
  /^full extracted (text|memory)\b/i,
  /^local results?\b/i,
]

const STRUCTURED_POINT_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'no',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])

const STRUCTURED_POINT_ACRONYMS = new Set([
  'AI',
  'AEEE',
  'API',
  'BTECH',
  'CD',
  'CI',
  'CSS',
  'HTML',
  'JEE',
  'NRI',
  'OCI',
  'PDF',
  'PIO',
  'UI',
  'UX',
  'VITE',
])

function enhancedCleanStructuredPoint(value) {
  return normalize(
    String(value || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/(\d)([A-Z])/g, '$1 $2')
      .replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2')
      .replace(/\s*:\s*/g, ': ')
      .replace(/\s*-\s*/g, ' - ')
      .replace(/\s{2,}/g, ' ')
  )
    .replace(/^[\u2022*-]\s*/, '')
    .replace(/^\(?([ivxlcdm]+|\d+)\)?[.)-]?\s+/i, '')
    .replace(/\s*[-–—]\s*/g, ' - ')
}

function repeatedTokenRatio(text) {
  const tokens = cleanStructuredPoint(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2)

  if (tokens.length < 4) {
    return 0
  }

  const counts = new Map()
  let maxCount = 0
  for (const token of tokens) {
    const next = (counts.get(token) || 0) + 1
    counts.set(token, next)
    if (next > maxCount) {
      maxCount = next
    }
  }

  return maxCount / tokens.length
}

function formattingNoiseScore(text) {
  const value = String(text || '')
  if (!value) {
    return 1
  }

  const weirdGlyphs = (value.match(/[□�]/g) || []).length
  const punctuationRuns = (value.match(/[|_/\\]{3,}|[.]{4,}|[-]{4,}/g) || []).length
  const mergedWords = (value.match(/[a-z]{3,}[A-Z][a-z]+|\d{4}[A-Z][a-z]+/g) || []).length
  const repeatedRatio = repeatedTokenRatio(value)

  return weirdGlyphs * 0.3 + punctuationRuns * 0.2 + mergedWords * 0.18 + repeatedRatio
}

function lintStructuredPoint(value) {
  const cleaned = cleanStructuredPoint(value)
  if (!cleaned) {
    return ''
  }

  const noiseScore = formattingNoiseScore(cleaned)
  if (noiseScore >= 0.72) {
    return ''
  }

  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length < 4 && cleaned.length < 24) {
    return ''
  }

  if (/^(github|google|search|drive|introduction)$/i.test(cleaned)) {
    return ''
  }

  return cleaned
}

function mostlyUppercase(text) {
  const letters = String(text || '').match(/[A-Za-z]/g) || []
  if (letters.length < 6) {
    return false
  }

  const uppercase = String(text || '').match(/[A-Z]/g) || []
  return uppercase.length / letters.length >= 0.7
}

function hasVerbLikeWord(text) {
  return /\b(is|are|was|were|be|being|been|has|have|had|can|could|will|would|should|includes?|offers?|supports?|shows?|provides?|explains?|lists?|contains?|covers?|requires?|allows?|helps?|opens?|starts?|ends?|uses?|admits?|applies?|gives?)\b/i.test(
    text
  )
}

function normalizeStructuredToken(token, index) {
  const original = String(token || '')
  const core = original.replace(/^[("'`]+|[)"'`.,!?;:]+$/g, '')
  if (!core) {
    return original
  }

  const uppercaseCore = core.toUpperCase()
  const normalizedCore = uppercaseCore.replace(/[^A-Z0-9]/g, '')

  if (
    STRUCTURED_POINT_ACRONYMS.has(normalizedCore) ||
    (/^[A-Z0-9/+.-]{2,10}$/.test(core) && !STRUCTURED_POINT_STOPWORDS.has(uppercaseCore.toLowerCase()))
  ) {
    return original
  }

  if (/^[A-Z][a-z]/.test(core) && !mostlyUppercase(core)) {
    return original
  }

  let nextCore = core.toLowerCase()
  if (index === 0) {
    nextCore = nextCore.charAt(0).toUpperCase() + nextCore.slice(1)
  }

  return original.replace(core, nextCore)
}

function normalizePhraseCase(value) {
  return normalize(
    String(value || '')
      .split(/\s+/)
      .map((token, index) => normalizeStructuredToken(token, index))
      .join(' ')
  )
}

function syntheticStructuredPoint(text) {
  return STRUCTURED_POINT_SYNTHETIC.some((pattern) => pattern.test(text))
}

function truncatedStructuredPoint(text) {
  return /[:/-]\s*$/.test(text) || /\b(and|or|for|to|of|in|with|about|from|on|at|by)\s*$/i.test(text)
}

function repairShoutPoint(value) {
  const cleaned = normalize(value)
  const match = cleaned.match(/^([A-Z][A-Za-z'’/&() -]{3,40})\s+([A-Z][A-Z0-9/&()'’ -]{6,})[!?.:]*$/)
  if (!match) {
    return cleaned
  }

  const label = normalizePhraseCase(match[1]).replace(/\bUpdates\b/, 'updates')
  const body = normalizePhraseCase(match[2])
  return `${label}: ${body}.`
}

function repairHeadingPoint(value) {
  const base = normalize(value).replace(/[:.!?]+$/, '').trim()
  if (!base) {
    return ''
  }

  const normalizedBase = normalizePhraseCase(base)
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const admissionsMatch = normalizedBase.match(/^(.*?\badmissions?)\s+(OCI\s*\/\s*PIO\s+students?)$/i)
  if (admissionsMatch) {
    return `The page includes ${admissionsMatch[1]} for ${admissionsMatch[2]}.`
  }

  if (/^(what|how|when|where|why|who|which)\b/i.test(normalizedBase)) {
    const lowered = normalizedBase.charAt(0).toLowerCase() + normalizedBase.slice(1)
    return `The page explains ${lowered}.`
  }

  if (normalizedBase.split(/\s+/).length < 2) {
    return ''
  }

  return `The page includes details about ${normalizedBase}.`
}

function cleanStructuredPoint(value) {
  return normalize(
    String(value || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/(\d)([A-Z])/g, '$1 $2')
      .replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2')
      .replace(/\s*:\s*/g, ': ')
      .replace(/\s*-\s*/g, ' - ')
      .replace(/\s{2,}/g, ' ')
  )
    .replace(/^[\u2022*-]\s*/, '')
    .replace(/^\(?([ivxlcdm]+|\d+)\)?[.)-]?\s+/i, '')
    .replace(/\s*[-–—]\s*/g, ' - ')
    .replace(/\bagent based\b/gi, 'agent-based')
    .replace(/\bnon\s*-\s*resident\b/gi, 'non-resident')
}

function enhancedLintStructuredPoint(value, result) {
  let cleaned = enhancedCleanStructuredPoint(value)
  if (!cleaned) {
    return ''
  }

  const noiseScore = formattingNoiseScore(cleaned)
  if (noiseScore >= 0.72) {
    return ''
  }

  cleaned = repairShoutPoint(cleaned)

  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length < 4 && cleaned.length < 24) {
    return ''
  }

  if (syntheticStructuredPoint(cleaned) || /^(github|google|search|drive|introduction)$/i.test(cleaned)) {
    return ''
  }

  const normalizedTitle = normalize(result?.title).toLowerCase()
  const normalizedSummary = normalize(result?.structuredSummary).toLowerCase()
  const lowered = cleaned.toLowerCase()

  if (normalizedTitle && (lowered === normalizedTitle || lowered === `article about ${normalizedTitle}.`)) {
    return ''
  }

  if (normalizedSummary && lowered === normalizedSummary) {
    return ''
  }

  if (mostlyUppercase(cleaned)) {
    cleaned = normalizePhraseCase(cleaned)
  }

  if (/:$/.test(cleaned) || (!hasVerbLikeWord(cleaned) && words.length <= 8)) {
    cleaned = repairHeadingPoint(cleaned)
  }

  cleaned = normalize(cleaned)
  if (!cleaned || syntheticStructuredPoint(cleaned) || truncatedStructuredPoint(cleaned)) {
    return ''
  }

  if (!hasVerbLikeWord(cleaned) && cleaned.split(/\s+/).length < 5) {
    return ''
  }

  cleaned = cleaned.replace(/\s*:\s*(?=[A-Z])/g, ': ')
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()

  if (!/[.!?]$/.test(cleaned)) {
    cleaned = `${cleaned}.`
  }

  return cleaned
}

function splitCandidateSentences(value) {
  const normalized = normalizeRichText(value)
  if (!normalized) {
    return []
  }

  return normalized
    .replace(/\u2022/g, '\n')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9(])/))
    .map(cleanStructuredPoint)
    .filter(Boolean)
}

function usefulStructuredPoint(value, result, seen) {
  const cleaned = enhancedLintStructuredPoint(value, result)
  if (!cleaned) {
    return ''
  }

  if (cleaned.length < 18 || cleaned.length > 220) {
    return ''
  }

  if (/^https?:\/\//i.test(cleaned)) {
    return ''
  }

  if (STRUCTURED_POINT_IGNORE.some((pattern) => pattern.test(cleaned))) {
    return ''
  }

  if (cleaned.toLowerCase() === normalize(result?.title).toLowerCase()) {
    return ''
  }

  const key = cleaned.toLowerCase()
  if (seen.has(key)) {
    return ''
  }

  seen.add(key)
  return cleaned
}

function deriveKeyPoints(result) {
  const seen = new Set()
  const points = []
  const derivativeItems = Array.isArray(result?.derivativeItems) ? result.derivativeItems : []
  const factItems = Array.isArray(result?.factItems) ? result.factItems : []
  const addPoint = (value, label = '') => {
    const point = usefulStructuredPoint(
      label && !/^passage\s+\d+$/i.test(label) ? `${label}: ${value}` : value,
      result,
      seen
    )
    if (point) {
      points.push(point)
    }
  }

  for (const entry of derivativeItems.slice(0, 4)) {
    addPoint(entry.text, entry.label)
    if (points.length >= 5) {
      return points
    }
  }

  for (const item of factItems.slice(0, 4)) {
    addPoint(`${item.label}: ${item.value}`)
    if (points.length >= 5) {
      return points
    }
  }

  const prioritized = splitCandidateSentences(
    [result?.structuredSummary, result?.snippet, result?.fullText].filter(Boolean).join('\n\n')
  ).filter(
    (line) =>
      /:/.test(line) ||
      /^(step|key|important|definition|formula|theorem|result|uses|offers|supports)\b/i.test(line)
  )

  for (const line of prioritized) {
    addPoint(line)
    if (points.length >= 5) {
      return points
    }
  }

  const fallbackLines = splitCandidateSentences(
    [result?.structuredSummary, result?.displayExcerpt, result?.snippet, result?.fullText]
      .filter(Boolean)
      .join('\n\n')
  )
  for (const line of fallbackLines) {
    addPoint(line)
    if (points.length >= 5) {
      break
    }
  }

  return points
}

function buildPointCopyText({ keyPoints, derivativeItems }) {
  const points = Array.isArray(keyPoints) ? keyPoints.filter(Boolean) : []
  if (points.length) {
    return points.map((point, index) => `${index + 1}. ${point}`).join('\n')
  }

  const passages = Array.isArray(derivativeItems) ? derivativeItems.filter((entry) => entry?.text) : []
  return passages
    .slice(0, 5)
    .map((entry, index) =>
      `${index + 1}. ${entry?.label && !/^passage\s+\d+$/i.test(entry.label) ? `${entry.label}: ` : ''}${entry.text}`
    )
    .join('\n')
}

function buildAssistantCopyText({ title, subtitle, pointers }) {
  const parts = [normalize(title), normalizeRichText(subtitle)]
  const bulletPoints = Array.isArray(pointers) ? pointers.filter(Boolean) : []

  if (bulletPoints.length) {
    parts.push(
      bulletPoints
        .map((point, index) => `${index + 1}. ${normalize(point)}`)
        .join('\n')
    )
  }

  return parts.filter(Boolean).join('\n\n').trim()
}

function compactStoredResult(result) {
  return {
    id: result?.id,
    title: result?.title,
    url: result?.url,
    displayUrl: result?.displayUrl,
    domain: result?.domain,
    application: result?.application,
    occurred_at: result?.occurred_at,
    snippet: result?.snippet,
    pageType: result?.pageType,
    pageTypeLabel: result?.pageTypeLabel,
    structuredSummary: result?.structuredSummary,
    displayExcerpt: result?.displayExcerpt,
    contextSubject: result?.contextSubject,
    factItems: Array.isArray(result?.factItems) ? result.factItems : [],
    graphSummary: result?.graphSummary,
    similarity: result?.similarity,
  }
}

function compactStoredWebSource(result) {
  return {
    id: result?.id,
    title: result?.title,
    url: result?.url,
    summary: result?.summary,
    date: result?.date,
  }
}

function compactStoredAnswerMeta(answerMeta) {
  if (!answerMeta) {
    return null
  }

  return {
    overview: answerMeta.overview,
    answer: answerMeta.answer,
    summary: answerMeta.summary,
    pointers: Array.isArray(answerMeta.pointers) ? answerMeta.pointers.slice(0, 5) : [],
    selectedEvidenceIds: Array.isArray(answerMeta.selectedEvidenceIds)
      ? answerMeta.selectedEvidenceIds.slice(0, 6)
      : [],
    insufficientEvidence: Boolean(answerMeta.insufficientEvidence),
  }
}

function createStoredThread(threadId, turns) {
  const firstTurn = turns[0]
  const lastTurn = turns[turns.length - 1]

  return {
    id: threadId,
    title: normalize(firstTurn?.query, 120) || 'New chat',
    updatedAt: new Date().toISOString(),
    turns: turns.map((turn) => ({
      id: turn.id,
      query: turn.query,
      createdAt: turn.createdAt,
      results: Array.isArray(turn.results) ? turn.results.map(compactStoredResult).slice(0, 5) : [],
      webSources: Array.isArray(turn.webSources)
        ? turn.webSources.map(compactStoredWebSource).slice(0, 5)
        : [],
      answerMeta: compactStoredAnswerMeta(turn.answerMeta),
      error: turn.error || '',
    })),
    turnCount: turns.length,
    lastQuery: normalize(lastTurn?.query, 120),
  }
}

function downloadExtensionPackage() {
  if (typeof document === 'undefined') {
    return
  }

  const link = document.createElement('a')
  link.href = '/memact-extension.zip'
  link.download = 'memact-extension.zip'
  link.rel = 'noreferrer'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

async function copyTextValue(value) {
  const text = normalize(value)
  if (!text || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false
  }

  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function GlassDialog({ title, subtitle, children, footer, onClose, headerActions = null }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined
    }

    const { documentElement, body } = document
    const previousActive = document.activeElement

    documentElement.classList.add('has-dialog-open')
    body.classList.add('has-dialog-open')

    const focusTimer = window.requestAnimationFrame(() => {
      panelRef.current?.scrollTo({ top: 0, behavior: 'auto' })
      panelRef.current?.focus({ preventScroll: true })
    })

    return () => {
      window.cancelAnimationFrame(focusTimer)
      documentElement.classList.remove('has-dialog-open')
      body.classList.remove('has-dialog-open')

      if (previousActive && typeof previousActive.focus === 'function') {
        window.requestAnimationFrame(() => {
          previousActive.focus({ preventScroll: true })
        })
      }
    }
  }, [])

  return (
    <div
      className="dialog-overlay"
      role="presentation"
      onMouseDown={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose?.()
        }
      }}
    >
      <div
        className="dialog-shell"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div ref={panelRef} className="dialog-panel" tabIndex={-1}>
          <div className="dialog-copy">
            <div className="dialog-copy-row">
              <div className="dialog-copy-stack">
                <h2 className="dialog-title">{title}</h2>
                {subtitle ? <p className="dialog-body">{subtitle}</p> : null}
              </div>
              {headerActions ? <div className="dialog-toolbar">{headerActions}</div> : null}
            </div>
          </div>
          {children}
          {footer ? <div className="dialog-footer">{footer}</div> : null}
        </div>
      </div>
    </div>
  )
}

function ChatHistoryDialog({ entries, onSelect, onDelete, onClear, onClose }) {
  return (
    <GlassDialog
      title="Chat history"
      subtitle="Your recent Memact conversations are stored locally on this device."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="dialog-secondary-button" onClick={onClear}>
            Clear chat history
          </button>
          <button type="button" className="dialog-primary-button" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="history-scroll">
        {entries.length ? (
          <div className="history-list">
            {entries.map((entry) => (
              <div key={entry.id} className="history-row">
                <button type="button" className="history-select" onClick={() => onSelect(entry)}>
                  <span className="history-copy">
                    <span className="history-query">{entry.title || entry.lastQuery || 'New chat'}</span>
                    <span className="history-time">
                      {entry.updatedAt
                        ? `${formatHistoryTime(entry.updatedAt)} • ${entry.turnCount || 0} turns`
                        : 'Saved locally'}
                    </span>
                  </span>
                </button>
                <button type="button" className="history-delete" onClick={() => onDelete(entry.id)}>
                  x
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="dialog-body">No chats yet.</p>
        )}
      </div>
    </GlassDialog>
  )
}

function PrivacyDialog({ onClose }) {
  return (
    <GlassDialog
      title="Privacy Notice"
      subtitle="Memact keeps your full memory index on this device and retrieves from it locally. Your browsing memories stay on-device unless you explicitly open the original pages yourself."
      onClose={onClose}
      footer={
        <button type="button" className="dialog-primary-button" onClick={onClose}>
          OK
        </button>
      }
    />
  )
}

function DetailValue({ value }) {
  return <MathRichText inline className="answer-detail-value" text={value} />
}

function DetailValueList({ values }) {
  return (
    <div className="detail-chip-list">
      {values.map((value) => (
        <span key={value} className="detail-chip">
          <MathRichText inline text={value} />
        </span>
      ))}
    </div>
  )
}

function DetailCard({ label, value, values = [] }) {
  const items = Array.isArray(values) ? values.filter(Boolean) : []

  return (
    <div className={`answer-detail-card ${items.length ? 'answer-detail-card--list' : ''}`}>
      <span className="answer-detail-label">{label}</span>
      {items.length ? <DetailValueList values={items} /> : <DetailValue value={value} />}
    </div>
  )
}

function ExperimentalNotice({ onClose }) {
  return (
    <div className="experiment-banner" role="status" aria-live="polite">
      <div className="experiment-banner__copy">
        <span className="experiment-banner__eyebrow">EXPERIMENTAL</span>
        <p className="experiment-banner__text">
          Memact is highly experimental. Captures, classifications, and recalled memories can be
          incomplete, cluttered, or wrong. Double-check anything important.
        </p>
      </div>
      <button
        type="button"
        className="experiment-banner__close"
        aria-label="Dismiss experimental notice"
        onClick={onClose}
      >
        x
      </button>
    </div>
  )
}

function ExtensionUpgradeNotice({ currentVersion, expectedVersion, onAction }) {
  return (
    <div className="experimental-notice extension-upgrade-notice" role="status">
      <div className="experimental-notice__copy">
        <div className="experimental-notice__eyebrow">EXTENSION UPDATE</div>
        <div className="experimental-notice__text">
          Your installed Memact extension is older than this website. Update it to restore the newer
          capture pipeline and cleaner memory quality.
        </div>
        <div className="experimental-notice__meta">
          {currentVersion ? `Installed ${currentVersion}` : 'Installed version unknown'} · Expected {expectedVersion}
        </div>
      </div>
      <button type="button" className="experimental-notice__close" onClick={onAction}>
        Update
      </button>
    </div>
  )
}

function InfoDialog({ onClose }) {
  return (
    <GlassDialog
      title="What Memact Does"
      subtitle="Memact remembers what you looked at on this device, then lets you talk to that memory like a conversation."
      onClose={onClose}
      footer={
        <button type="button" className="dialog-primary-button" onClick={onClose}>
          OK
        </button>
      }
    >
      <div className="dialog-stack">
        <p className="dialog-body">
          Memact searches your saved memory locally on this device first.
        </p>
        <p className="dialog-body">
          Memact answers from the on-device model using your saved memories as grounding. If the
          model is still loading or cannot run on this device, Memact should say that plainly.
        </p>
        <p className="dialog-body">
          If Memact does not have enough relevant memory, it should say that clearly instead of
          pretending.
        </p>
      </div>
    </GlassDialog>
  )
}

function ClearMemoriesDialog({ clearing, errorMessage, onConfirm, onClose }) {
  return (
    <GlassDialog
      title="Clear all memories"
      subtitle="This removes all saved browser memories from the local Memact extension on this device. This cannot be undone."
      onClose={clearing ? undefined : onClose}
      footer={
        <>
          <button
            type="button"
            className="dialog-secondary-button"
            onClick={onClose}
            disabled={clearing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="dialog-primary-button dialog-primary-button--danger"
            onClick={onConfirm}
            disabled={clearing}
          >
            {clearing ? 'Clearing...' : 'Clear all memories'}
          </button>
        </>
      }
    >
      <div className="helper-card">
        <span className="helper-title">LOCAL RESET</span>
        <p className="helper-text">
          Memact will wipe the captured events, sessions, embeddings, and saved answers stored by
          the extension. Your browser itself is not uninstalled.
        </p>
      </div>
      {errorMessage ? <p className="dialog-error">{errorMessage}</p> : null}
    </GlassDialog>
  )
}

function BrowserSetupDialog({ browserInfo, mode, extensionDetected, extensionReady, onClose }) {
  const [copiedState, setCopiedState] = useState('')
  const isPhoneMode = browserInfo.mobile
  const isSupportedDesktopBrowser = !isPhoneMode && browserInfo.extensionCapable
  const needsDesktopSetup = mode === 'bridge-required'
  const isDesktopFallback = !isPhoneMode && mode === 'web-fallback'
  const unsupportedDesktop = !isPhoneMode && !browserInfo.extensionCapable
  const extensionsUrl = browserInfo.extensionsUrl || 'edge://extensions/'
  const packageFileLabel = 'memact-extension.zip'
  const packageFolderLabel = 'Extracted folder'
  const packageFolderHint =
    'Choose the folder you extracted from the zip. It should directly contain manifest.json.'
  const setupSteps = [
    `1. Download and extract ${packageFileLabel}.`,
    `2. Open ${extensionsUrl} in ${browserInfo.name}.`,
    '3. Turn on Developer mode.',
    '4. Click Load unpacked.',
    '5. Select the extracted folder.',
    '6. Reload this website.',
  ]
  const setupStepsText = setupSteps.join('\n')

  const title = isPhoneMode
    ? 'Not supported on phone browsers'
    : unsupportedDesktop
      ? 'Browser not supported'
      : extensionDetected
        ? 'Browser connected'
        : 'Install Browser Extension'
  const subtitle = isPhoneMode
    ? 'Memact works on phone browsers for local recall, but automatic browser capture is not available there. Finish extension setup on a desktop Chromium browser.'
    : unsupportedDesktop
      ? `${browserInfo.name} is not supported for the manual Memact extension install flow yet. Use desktop Edge, Chrome, Brave, Opera, or Vivaldi.`
      : extensionDetected
        ? extensionReady
          ? 'The Memact extension is already connected to this page and ready.'
          : 'The Memact extension is detected. Local memory is still preparing.'
        : needsDesktopSetup
          ? `Set up the Memact extension once in ${browserInfo.name}, then Memact can capture and recall browser memories automatically on this device.`
          : 'This browser is ready for the manual Memact extension install flow whenever you want automatic capture.'
  const helperTitle = isPhoneMode
    ? 'PHONE MODE'
    : unsupportedDesktop
      ? 'DESKTOP REQUIRED'
      : extensionDetected
        ? 'CONNECTED'
        : 'MANUAL INSTALL'
  const helperText = isPhoneMode
    ? 'Keep using Memact here for local phone memory recall. For automatic capture, continue on desktop and load the extension manually.'
    : unsupportedDesktop
      ? 'Automatic browser capture currently needs a supported desktop Chromium browser.'
      : extensionDetected
        ? 'Memact can now talk to the browser extension on this page.'
        : 'Download the Memact extension zip, extract it, then choose the extracted folder in Load unpacked.'

  const metaText = extensionDetected
    ? extensionReady
      ? 'Connected to this page. Local memory is ready.'
      : 'Connected to this page. Local memory is still preparing.'
    : isPhoneMode
      ? 'Running locally in phone browser mode.'
      : unsupportedDesktop
        ? 'Manual extension install is not supported in this browser.'
        : 'Manual unpacked extension install is available in this browser.'

  const handleCopy = async (kind) => {
    const ok = await copyTextValue(kind === 'steps' ? setupStepsText : extensionsUrl)
    if (!ok) {
      setCopiedState('')
      return
    }
    setCopiedState(kind)
    window.setTimeout(() => {
      setCopiedState((current) => (current === kind ? '' : current))
    }, 1800)
  }

  return (
    <GlassDialog
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          {isSupportedDesktopBrowser && !extensionDetected ? (
            <button
              type="button"
              className="dialog-secondary-button"
              onClick={downloadExtensionPackage}
            >
              Download extension zip
            </button>
          ) : null}
          {isSupportedDesktopBrowser && !extensionDetected ? (
            <button
              type="button"
              className="dialog-secondary-button"
              onClick={() => handleCopy('steps')}
            >
              {copiedState === 'steps' ? 'Steps copied' : 'Copy install steps'}
            </button>
          ) : null}
          <button type="button" className="dialog-primary-button" onClick={onClose}>
            {isPhoneMode ? 'OK' : 'Close'}
          </button>
        </>
      }
    >
      <div className="helper-card">
        <span className="helper-title">{helperTitle}</span>
        <p className="helper-text">{helperText}</p>
      </div>

      <div className="browser-tile">
        <div className="browser-copy">
          <div className="browser-title-row">
            <span className="browser-name">{browserInfo.name}</span>
            <span className="browser-default-badge">
              {isPhoneMode ? 'Phone browser' : 'Current browser'}
            </span>
            {extensionDetected ? (
              <span className="browser-connected-badge">
                {extensionReady ? 'Connected' : 'Detected'}
              </span>
            ) : null}
          </div>
          <p className="browser-meta">{metaText}</p>
          <p className="browser-url">
            {isSupportedDesktopBrowser ? extensionsUrl : 'Local web memories stay on this device.'}
          </p>
        </div>
        {isSupportedDesktopBrowser && !extensionDetected ? (
          <button
            type="button"
            className="dialog-primary-button"
            onClick={downloadExtensionPackage}
          >
            Download extension zip
          </button>
        ) : null}
      </div>

      {isSupportedDesktopBrowser && !extensionDetected ? (
        <div className="setup-guide">
          <div className="refine-heading">MANUAL LOAD STEPS</div>
          <div className="setup-step-list">
            {setupSteps.map((step) => (
              <div key={step} className="setup-step">
                {step}
              </div>
            ))}
          </div>

          <div className="setup-code-grid">
            <div className="setup-code-card">
              <span className="answer-detail-label">Extensions page</span>
              <span className="setup-code-value">{extensionsUrl}</span>
            </div>
            <div className="setup-code-card">
              <span className="answer-detail-label">Download file</span>
              <span className="setup-code-value">{packageFileLabel}</span>
            </div>
            <div className="setup-code-card">
              <span className="answer-detail-label">Folder to select</span>
              <span className="setup-code-value">{packageFolderLabel}</span>
              <span className="setup-code-hint">{packageFolderHint}</span>
            </div>
          </div>
        </div>
      ) : null}

      {isDesktopFallback ? (
        <div className="helper-card">
          <span className="helper-title">LOCAL WEB MODE</span>
          <p className="helper-text">
            Memact can still run here, but automatic capture only starts after you load the
            extension manually.
          </p>
        </div>
      ) : null}
    </GlassDialog>
  )
}

function getTurnSourceCollections(turn) {
  const answerMeta = turn?.answerMeta || null
  const selectedEvidenceIds = Array.isArray(answerMeta?.selectedEvidenceIds)
    ? answerMeta.selectedEvidenceIds.filter(Boolean)
    : []
  const memorySources = selectedEvidenceIds.length
    ? (Array.isArray(turn?.results) ? turn.results : []).filter((result) =>
        selectedEvidenceIds.includes(result?.id)
      )
    : answerMeta?.insufficientEvidence
      ? []
      : (Array.isArray(turn?.results) ? turn.results : []).slice(0, 5)
  const webSources = Array.isArray(turn?.webSources) ? turn.webSources.filter(Boolean) : []

  return {
    memorySources,
    webSources,
    totalSourceCount: memorySources.length + webSources.length,
  }
}

function SourcesDialog({ turn, onOpen, onSelect, onClose }) {
  if (!turn) {
    return null
  }

  const { memorySources, webSources, totalSourceCount } = getTurnSourceCollections(turn)
  const subtitle = normalize(turn?.query)
    ? `Sources used for "${turn.query}".`
    : 'Sources used for this answer.'

  return (
    <GlassDialog
      title={`Sources (${totalSourceCount})`}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <button type="button" className="dialog-primary-button" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="sources-dialog-scroll">
        <div className="sources-section">
          {memorySources.length ? (
            <div className="sources-section__group">
              <div className="sources-section__heading">From memory</div>
              <div className="evidence-stack">
                {memorySources.map((result) => (
                  <ResultCard
                    key={result.id}
                    result={result}
                    onOpen={(item) => onOpen?.(item.url)}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {webSources.length ? (
            <div className="sources-section__group">
              <div className="sources-section__heading">From the web</div>
              <div className="structured-point-list">
                {webSources.map((result, index) => (
                  <div key={`${result.id || result.url || index}`} className="structured-point-item">
                    <span className="structured-point-index">{index + 1}.</span>
                    <div className="structured-point-copy">
                      <div className="memory-passage-label">{result.title}</div>
                      {result.summary ? <p className="dialog-body">{result.summary}</p> : null}
                      <div className="browser-url">{result.url}</div>
                      {result.url ? (
                        <button
                          type="button"
                          className="dialog-secondary-button"
                          onClick={() => onOpen?.(result.url)}
                        >
                          Open page
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </GlassDialog>
  )
}

function MemoryDetailDialog({ result, onOpen, onClose }) {
  const [rawVisible, setRawVisible] = useState(false)
  const [fullTextVisible, setFullTextVisible] = useState(false)
  const [copiedState, setCopiedState] = useState('')

  useEffect(() => {
    setRawVisible(false)
    setFullTextVisible(false)
    setCopiedState('')
  }, [result?.id])

  if (!result) {
    return null
  }

  const detailItems = [
    result.occurred_at ? { label: 'Captured', value: formatHistoryTime(result.occurred_at) } : null,
    result.application ? { label: 'App', value: toTitleCase(result.application) } : null,
    result.domain ? { label: 'Site', value: result.domain } : null,
    result.interactionType ? { label: 'Activity', value: toTitleCase(result.interactionType) } : null,
    result.duplicateCount > 1 ? { label: 'Similar captures', value: `${result.duplicateCount}` } : null,
  ].filter(Boolean)
  const factItems = Array.isArray(result.factItems) ? result.factItems : []
  const derivativeItems = Array.isArray(result.derivativeItems) ? result.derivativeItems : []
  const extractedContext = [
    result.contextSubject ? { label: 'Subject', value: result.contextSubject } : null,
    result.contextEntities.length ? { label: 'Entities', values: result.contextEntities } : null,
    result.contextTopics.length ? { label: 'Topics', values: result.contextTopics } : null,
  ].filter(Boolean)
  const showExtractedContext = extractedContext.length && result.pageType !== 'search'

  const sessionLabel =
    result.session?.label ||
    result.raw?.session_label ||
    result.raw?.episode_label ||
    ''

  const fullText = String(result.fullText || result.rawFullText || '').trim()
  const rawFullText = String(result.rawFullText || '').trim()
  const snippetText = String(result.snippet || '').trim()
  const displayUrl = String(result.displayUrl || result.url || '').trim()
  const searchResults = Array.isArray(result.searchResults) ? result.searchResults : []
  const connectedEvents = Array.isArray(result.connectedEvents) ? result.connectedEvents : []
  const primaryTextHeading = result.pageType === 'search' ? 'CAPTURED PAGE VIEW' : 'FULL EXTRACTED TEXT'
  const showRawCapturedText = rawFullText && rawFullText !== fullText
  const keyPoints = useMemo(() => deriveKeyPoints(result), [result])
  const copyPayload = useMemo(
    () => buildPointCopyText({ keyPoints, derivativeItems }),
    [derivativeItems, keyPoints]
  )

  const handleCopyMemory = async () => {
    const ok = await copyTextValue(copyPayload)
    if (!ok) {
      return
    }
    setCopiedState('copied')
    window.setTimeout(() => {
      setCopiedState((current) => (current === 'copied' ? '' : current))
    }, 1800)
  }

  return (
    <GlassDialog
      title={result.title || 'Memory'}
      subtitle={sessionLabel ? `From session: ${sessionLabel}` : 'Full saved memory from this capture.'}
      onClose={onClose}
      headerActions={
        <button type="button" className="dialog-utility-button" onClick={handleCopyMemory}>
          {copiedState === 'copied' ? 'Copied' : 'Copy points'}
        </button>
      }
      footer={
        <>
          {result.url ? (
            <button type="button" className="dialog-secondary-button" onClick={() => onOpen?.(result)}>
              Open page
            </button>
          ) : null}
          <button type="button" className="dialog-primary-button" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {detailItems.length ? (
          <div className="answer-detail-grid">
            {detailItems.map((item) => (
              <DetailCard key={`${item.label}-${item.value}`} label={item.label} value={item.value} />
            ))}
          </div>
      ) : null}

      {displayUrl ? <p className="browser-url">{displayUrl}</p> : null}

      {result.structuredSummary ? (
        <div className="memory-detail-body">
          <div className="refine-heading">SUMMARY</div>
          <div className="dialog-body">
            <MathRichText text={result.structuredSummary} />
          </div>
          {result.graphSummary ? (
            <p className="connection-summary">{result.graphSummary}</p>
          ) : null}
        </div>
      ) : null}

      {keyPoints.length ? (
        <div className="memory-detail-body">
          <div className="refine-heading">KEY POINTS</div>
          <div className="structured-point-list">
            {keyPoints.map((point, index) => (
              <div key={`${index + 1}-${point}`} className="structured-point-item">
                <span className="structured-point-index">{index + 1}.</span>
                <div className="structured-point-copy">
                  <MathRichText text={point} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {factItems.length ? (
        <div className="memory-detail-body">
          <div className="refine-heading">FACTS</div>
          <div className="answer-detail-grid">
            {factItems.map((item) => (
              <DetailCard key={`${item.label}-${item.value}`} label={item.label} value={item.value} />
            ))}
          </div>
        </div>
      ) : null}

      {showExtractedContext ? (
        <div className="memory-detail-body">
          <div className="refine-heading">EXTRACTED CONTEXT</div>
          <div className="answer-detail-grid">
            {extractedContext.map((item) => (
              <DetailCard
                key={`${item.label}-${item.value || (item.values || []).join('|')}`}
                label={item.label}
                value={item.value}
                values={item.values}
              />
            ))}
          </div>
        </div>
      ) : null}

      {derivativeItems.length ? (
        <div className="memory-detail-body">
          <div className="refine-heading">MATCHED PASSAGES</div>
          <div className="structured-point-list">
            {derivativeItems.map((entry, index) => (
              <div key={`${entry.label}-${entry.text}-${index}`} className="structured-point-item">
                <span className="structured-point-index">{index + 1}.</span>
                <div className="structured-point-copy">
                  {entry.label && !/^passage\s+\d+$/i.test(entry.label) ? (
                    <div className="memory-passage-label">{entry.label}</div>
                  ) : null}
                  <MathRichText text={entry.text} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {connectedEvents.length ? (
        <div className="memory-detail-body">
          <div className="refine-heading">CONNECTED ACTIVITY</div>
          <div className="connection-list">
            {connectedEvents.map((entry) => (
              <div
                key={`${entry.id || entry.title}-${entry.relationshipType}-${entry.direction}`}
                className="connection-card"
              >
                <div className="connection-card__top">
                  <span className="connection-badge">
                    {entry.relationshipLabel || toTitleCase(entry.relationshipType)}
                  </span>
                  {formatRelationshipScore(entry.relationshipScore) ? (
                    <span className="connection-score">
                      Score {formatRelationshipScore(entry.relationshipScore)}
                    </span>
                  ) : null}
                </div>
                <div className="connection-title">
                  <MathRichText text={entry.title} />
                </div>
                <p className="connection-meta">
                  {[
                    entry.direction === 'before'
                      ? 'Earlier memory'
                      : entry.direction === 'after'
                        ? 'Later memory'
                        : '',
                    entry.application ? toTitleCase(entry.application) : '',
                    entry.domain,
                    entry.occurred_at ? formatHistoryTime(entry.occurred_at) : '',
                  ]
                    .filter(Boolean)
                    .join(' - ')}
                </p>
                {entry.relationshipReason ? (
                  <p className="connection-reason">{entry.relationshipReason}</p>
                ) : null}
                {entry.url ? (
                  <button
                    type="button"
                    className="dialog-secondary-button connection-open-button"
                    onClick={() => openExternal(entry.url)}
                  >
                    Open connected page
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {searchResults.length ? (
        <div className="memory-detail-body">
          <div className="refine-heading">CAPTURED RESULTS</div>
          <div className="memory-result-list">
            {searchResults.map((item, index) => (
              <div key={`${index + 1}-${item}`} className="memory-result-item">
                <span className="memory-result-index">{index + 1}.</span>
                <span className="memory-result-copy">
                  <MathRichText text={item} />
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {snippetText && snippetText !== fullText ? (
        <div className="memory-detail-body">
          <div className="refine-heading">SAVED SNIPPET</div>
          <div className="dialog-body">
            <MathRichText text={snippetText} />
          </div>
        </div>
      ) : null}

      {fullText ? (
        <div className="memory-detail-body">
          <div className="memory-section-header">
            <div className="refine-heading">{primaryTextHeading}</div>
            <button
              type="button"
              className="details-button memory-section-toggle"
              onClick={() => setFullTextVisible((current) => !current)}
            >
              {fullTextVisible ? 'Hide full text' : 'Show full text'}
            </button>
          </div>
          {fullTextVisible ? (
            <MathRichText className="memory-detail-text" text={fullText} />
          ) : (
            <p className="memory-section-hint">
              Expand to inspect the complete captured text for this memory.
            </p>
          )}
        </div>
      ) : (
        <p className="dialog-body">No full extracted text is available for this memory yet.</p>
      )}

      {showRawCapturedText ? (
        <div className="memory-detail-body">
          <button
            type="button"
            className="details-button"
            onClick={() => setRawVisible((current) => !current)}
          >
            {rawVisible ? 'Hide raw captured text' : 'Show raw captured text'}
          </button>

          {rawVisible ? (
            <>
              <div className="refine-heading">RAW CAPTURED TEXT</div>
              <pre className="memory-detail-text memory-detail-text--raw">{rawFullText}</pre>
            </>
          ) : null}
        </div>
      ) : null}
    </GlassDialog>
  )
}


function OverflowMenu({ style, setupLabel, onAction }) {
  return (
    <div className="menu-surface" style={style} role="menu">
      <button type="button" className="menu-item" onClick={() => onAction('info')}>
        What is Memact?
      </button>
      <button type="button" className="menu-item" onClick={() => onAction('setup')}>
        {setupLabel}
      </button>
      <button type="button" className="menu-item" onClick={() => onAction('history')}>
        Chat History
      </button>
      <button type="button" className="menu-item" onClick={() => onAction('privacy')}>
        Privacy Notice
      </button>
      <button type="button" className="menu-item" onClick={() => onAction('export-captanet')}>
        Export Captanet Snapshot
      </button>
      <div className="menu-separator" aria-hidden="true" />
      <button
        type="button"
        className="menu-item menu-item--danger"
        onClick={() => onAction('clear-memories')}
      >
        Clear all memories
      </button>
    </div>
  )
}

function MenuOrbButton({ label, text, onClick, buttonRef, hidden = false }) {
  return (
    <div className={`menu-orb ${hidden ? 'is-hidden' : ''}`}>
      <button ref={buttonRef} type="button" className="menu-button" aria-label={label} onClick={onClick}>
        {text}
      </button>
    </div>
  )
}

export default function Search({ extension }) {
  const [experimentNoticeVisible, setExperimentNoticeVisible] = useState(
    () => !getExperimentNoticeDismissed()
  )
  const [bootComplete, setBootComplete] = useState(false)
  const [resultsMode, setResultsMode] = useState(false)
  const [composerValue, setComposerValue] = useState('')
  const [selectedResult, setSelectedResult] = useState(null)
  const [activeDialog, setActiveDialog] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuRect, setMenuRect] = useState(null)
  const [activeTimeFilter, setActiveTimeFilter] = useState(null)
  const [dockVisible, setDockVisible] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState(() => createThreadId())
  const [chatThreads, setChatThreads] = useState(() => readChatThreads())
  const [setupPromptShown, setSetupPromptShown] = useState(false)
  const [setupDialogAutoOpened, setSetupDialogAutoOpened] = useState(false)
  const [clearingMemories, setClearingMemories] = useState(false)
  const [clearMemoriesError, setClearMemoriesError] = useState('')
  const [sourceDialogTurn, setSourceDialogTurn] = useState(null)
  const [copiedMessageKey, setCopiedMessageKey] = useState('')
  const [voiceAvailable, setVoiceAvailable] = useState(false)
  const [voiceState, setVoiceState] = useState('idle')
  const brain = useBrain(extension)
  const conversationTurns = brain.turns
  const menuButtonRef = useRef(null)
  const menuRef = useRef(null)
  const voiceRecognitionRef = useRef(null)
  const voiceTranscriptRef = useRef('')

  const persistThread = useCallback((threadId, turns) => {
    const storedThread = createStoredThread(threadId, turns)
    setChatThreads((current) => {
      const next = [storedThread, ...current.filter((entry) => entry.id !== threadId)].slice(0, 12)
      writeChatThreads(next)
      return next
    })
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBootComplete(true)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    setVoiceAvailable(Boolean(getSpeechRecognitionConstructor()))
  }, [])

  useEffect(() => {
    return () => {
      if (voiceRecognitionRef.current) {
        voiceRecognitionRef.current.onresult = null
        voiceRecognitionRef.current.onerror = null
        voiceRecognitionRef.current.onend = null
        voiceRecognitionRef.current.abort()
        voiceRecognitionRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!bootComplete || !extension?.requiresBridge || setupPromptShown) {
      return
    }

    const timer = window.setTimeout(() => {
      setActiveDialog('setup')
      setSetupPromptShown(true)
      setSetupDialogAutoOpened(true)
    }, 1800)

    return () => window.clearTimeout(timer)
  }, [bootComplete, extension?.requiresBridge, setupPromptShown])

  useEffect(() => {
    if (activeDialog === 'setup' && setupDialogAutoOpened && !extension?.requiresBridge) {
      setActiveDialog(null)
      setSetupDialogAutoOpened(false)
    }
  }, [activeDialog, extension?.requiresBridge, setupDialogAutoOpened])

  useEffect(() => {
    if (!menuOpen) {
      return undefined
    }

    const handlePointerDown = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(event.target)
      ) {
        setMenuOpen(false)
      }
    }

    const handleResize = () => {
      setMenuOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', handleResize)
    }
  }, [menuOpen])

  const browserInfo = extension?.environment || {
    name: 'Browser',
    mobile: false,
    compactViewport: false,
    setupSupported: false,
    automaticCaptureSupported: false,
  }
  const compactUi = Boolean(browserInfo.mobile || browserInfo.compactViewport)
  const isWebFallback = extension?.mode === 'web-fallback'
  const setupLabel = 'Install Browser Extension'
  const latestTurn = conversationTurns[conversationTurns.length - 1] || null
  const extensionUpgradeVisible = Boolean(
    extension?.bridgeDetected && extension?.extensionOutdated && extension?.extensionVersion
  )

  const showResults = resultsMode && (conversationTurns.length > 0 || brain.isStreaming)
  const screenMode = showResults ? 'results' : 'home'
  const showLoadingBar = !bootComplete || brain.isModelLoading || brain.isStreaming
  const menuStyle = compactUi
    ? {
        left: '12px',
        right: '12px',
        bottom: '12px',
      }
    : menuRect
      ? {
          top: `${Math.round(menuRect.bottom + 8)}px`,
          left: `${Math.round(Math.max(12, menuRect.right - 240))}px`,
        }
      : undefined

  const statusText = useMemo(() => {
    if (!bootComplete) {
      return 'Starting your local memory engine...'
    }
    if (brain.isModelLoading) {
      const percent = Math.round(Number(brain.modelLoadProgress || 0) * 100)
      return brain.loadingText
        ? `${brain.loadingText}${percent > 0 && percent < 100 ? ` ${percent}%` : ''}`
        : 'Loading Memact...'
    }
    if (brain.isStreaming) {
      return brain.loadingText || 'Memact is replying...'
    }
    if (extension?.bridgeDetected && !extension?.ready) {
      return 'Browser connected. Preparing local memory...'
    }
    if (isWebFallback) {
      if (showResults) {
        return latestTurn?.results?.length
          ? `${latestTurn.results.length} relevant memories grounded.`
          : 'No strong memory grounded for that yet.'
      }
      if (extension?.webMemoryCount) {
        return browserInfo.mobile
          ? `${extension.webMemoryCount} phone memories ready locally.`
          : `${extension.webMemoryCount} local web memories ready.`
      }
      return browserInfo.mobile
        ? 'Ready for local phone memories.'
        : 'Ready for local web memories.'
    }
    if (showResults) {
      if (latestTurn?.error) {
        return latestTurn.error
      }
      if (latestTurn?.answerMeta?.insufficientEvidence) {
        return 'Weak memory grounding - answer may be approximate.'
      }
      const totalSourceCount =
        Number(latestTurn?.results?.length || 0) + Number(latestTurn?.webSources?.length || 0)
      return totalSourceCount
        ? `${totalSourceCount} grounded sources in this chat.`
        : 'No strong memory grounded for that yet.'
    }
    return 'Ready to recall.'
  }, [
    brain.isModelLoading,
    brain.isStreaming,
    brain.loadingText,
    brain.modelLoadProgress,
    bootComplete,
    browserInfo.mobile,
    extension?.bridgeDetected,
    extension?.ready,
    extension?.webMemoryCount,
    isWebFallback,
    latestTurn,
    resultsMode,
    showResults,
  ])

  const handleMenuToggle = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setMenuRect(rect)
    setMenuOpen((current) => !current)
  }

  const handleSubmit = async (rawValue) => {
    const query = normalize(rawValue ?? composerValue)
    if (!query) {
      return
    }

    if (extension?.requiresBridge) {
      setSetupDialogAutoOpened(false)
      setActiveDialog('setup')
      return
    }

    setSelectedResult(null)
    setSourceDialogTurn(null)
    setComposerValue('')
    brain.sendQuery(query, {
      sessionId: activeThreadId,
    })
    setResultsMode(true)
  }

  const handleStartNewChat = (clearQuery = true) => {
    setResultsMode(false)
    setSelectedResult(null)
    setSourceDialogTurn(null)
    setActiveTimeFilter(null)
    setActiveThreadId(createThreadId())
    brain.clearConversation(activeThreadId)
    if (clearQuery) {
      setComposerValue('')
    }
  }

  const handleReload = async (turn) => {
    const query = normalize(turn?.query || composerValue)
    if (!query) {
      return
    }
    setSelectedResult(null)
    brain.regenerateTurn(turn, {
      sessionId: activeThreadId,
    })
  }

  const markCopiedMessage = useCallback((messageKey) => {
    setCopiedMessageKey(messageKey)
    window.setTimeout(() => {
      setCopiedMessageKey((current) => (current === messageKey ? '' : current))
    }, 1800)
  }, [])

  const handleCopyUser = async (turn) => {
    const ok = await copyTextValue(turn?.query || '')
    if (!ok) {
      return
    }

    markCopiedMessage(`user:${turn?.id || ''}`)
  }

  const handleEditUser = useCallback(
    (turn) => {
      const targetId = normalize(turn?.id, 120)
      const targetQuery = normalize(turn?.query, 500)
      if (!targetId || !targetQuery) {
        return
      }

      setSelectedResult(null)
      setSourceDialogTurn(null)
      setResultsMode(true)
      brain.setTurns((current) => {
        const targetIndex = current.findIndex((entry) => entry.id === targetId)
        if (targetIndex === -1) {
          return current
        }
        return current.slice(0, targetIndex)
      })
      setComposerValue(targetQuery)

      window.requestAnimationFrame(() => {
        document.querySelector('.composer-dock .search-input, .home-hero .search-input')?.focus()
      })
    },
    [brain, setComposerValue]
  )

  const handleCopyAssistant = async (turn) => {
    const answerMeta = turn?.answerMeta || null
    const copyPayload = buildAssistantCopyText({
      title: answerMeta?.overview || 'Memact reply',
      subtitle: answerMeta?.answer || answerMeta?.summary || turn?.error || '',
      pointers: Array.isArray(answerMeta?.pointers) ? answerMeta.pointers : [],
    })

    const ok = await copyTextValue(copyPayload)
    if (!ok) {
      return
    }

    markCopiedMessage(`assistant:${turn?.id || ''}`)
  }

  const handleVoiceTrigger = () => {
    const Recognition = getSpeechRecognitionConstructor()

    if (voiceRecognitionRef.current) {
      voiceRecognitionRef.current.stop()
      return
    }

    const applyTranscript = (transcript) => {
      const normalizedTranscript = normalize(transcript)
      if (!normalizedTranscript) {
        return
      }
      setComposerValue(normalizedTranscript)
      void handleSubmit(normalizedTranscript)
    }

    if (!Recognition) {
      return
    }

    voiceTranscriptRef.current = ''

    const recognition = new Recognition()
    recognition.lang = 'en-IN'
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((result) => result?.[0]?.transcript || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (!transcript) {
        return
      }

      voiceTranscriptRef.current = transcript
      setComposerValue(transcript)
    }

    recognition.onerror = () => {
      voiceRecognitionRef.current = null
      setVoiceState('idle')
    }

    recognition.onend = () => {
      const finalTranscript = normalize(voiceTranscriptRef.current)
      voiceRecognitionRef.current = null
      setVoiceState('idle')

      if (finalTranscript) {
        applyTranscript(finalTranscript)
      }
    }

    voiceRecognitionRef.current = recognition
    setVoiceState('listening')
    recognition.start()
  }

  const handleMenuAction = async (action) => {
    setMenuOpen(false)

    if (action === 'info') {
      setActiveDialog('info')
      return
    }
    if (action === 'setup') {
      setSetupDialogAutoOpened(false)
      setActiveDialog('setup')
      return
    }
    if (action === 'history') {
      setActiveDialog('history')
      return
    }
    if (action === 'privacy') {
      setActiveDialog('privacy')
      return
    }
    if (action === 'export-captanet') {
      if (!extension?.bridgeDetected || typeof extension.exportCaptanetSnapshot !== 'function') {
        setSetupDialogAutoOpened(false)
        setActiveDialog('setup')
        return
      }
      const response = await extension.exportCaptanetSnapshot()
      if (!response?.ok) {
        console.error('Captanet snapshot export failed:', response?.error || response)
      }
      return
    }
    if (action === 'clear-memories') {
      setClearMemoriesError('')
      setActiveDialog('clear-memories')
    }
  }

  const handleSelectThread = (thread) => {
    if (!thread) {
      return
    }

    setActiveThreadId(thread.id || createThreadId())
    brain.hydrateConversation(Array.isArray(thread.turns) ? thread.turns : [])
    setSourceDialogTurn(null)
    setActiveDialog(null)
    setResultsMode(true)
    setComposerValue('')
  }

  const handleDeleteThread = (threadId) => {
    setChatThreads((current) => {
      const next = current.filter((entry) => entry.id !== threadId)
      writeChatThreads(next)
      return next
    })

    if (threadId === activeThreadId) {
      handleStartNewChat(true)
      setActiveDialog(null)
    }
  }

  const handleClearThreads = () => {
    writeChatThreads([])
    setChatThreads([])
    setActiveDialog(null)
    handleStartNewChat(true)
  }

  const handleClearMemories = async () => {
    if (clearingMemories) {
      return
    }

    if (!extension?.detected || typeof extension.clearAllData !== 'function') {
      setClearMemoriesError('')
      setActiveDialog('setup')
      return
    }

    setClearingMemories(true)
    setClearMemoriesError('')

    try {
      const response = await extension.clearAllData()
      if (!response || response.error || response.ok === false) {
        throw new Error(response?.error || 'Could not clear local memories.')
      }

      setResultsMode(false)
      setSelectedResult(null)
      setComposerValue('')
      brain.clearConversation(activeThreadId)
      setSourceDialogTurn(null)
      setActiveTimeFilter(null)
      setActiveDialog(null)
    } catch (error) {
      setClearMemoriesError(String(error?.message || error || 'Could not clear local memories.'))
    } finally {
      setClearingMemories(false)
    }
  }

  const handleDismissExperimentNotice = () => {
    setExperimentNoticeVisible(false)
    setExperimentNoticeDismissed(true)
  }

  useEffect(() => {
    if (!conversationTurns.length) {
      return
    }
    persistThread(activeThreadId, conversationTurns)
  }, [activeThreadId, conversationTurns, persistThread])

  return (
    <>
      <main
        className={`memact-page ${screenMode === 'results' ? 'is-results' : 'is-home'} ${
          compactUi ? 'is-compact' : ''
        } ${browserInfo.mobile ? 'is-mobile' : ''}`}
      >
        <div className="memact-root">
          {experimentNoticeVisible ? (
            <ExperimentalNotice onClose={handleDismissExperimentNotice} />
          ) : null}
          {extensionUpgradeVisible ? (
            <ExtensionUpgradeNotice
              currentVersion={extension.extensionVersion}
              expectedVersion={extension.expectedExtensionVersion}
              onAction={() => {
                setSetupDialogAutoOpened(false)
                setActiveDialog('setup')
              }}
            />
          ) : null}

          <header className="top-bar">
            <div className="results-header results-header--chat">
              <div className="results-header__left">
                {showResults ? (
                  <div className="new-chat-orb">
                    <button
                      type="button"
                      className="new-chat-button"
                      aria-label="New chat"
                      title="New chat"
                      onClick={() => handleStartNewChat(true)}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <div className="header-side-spacer" aria-hidden="true" />
                )}
              </div>

              <div className="results-header__right">
                <MenuOrbButton
                  label="Menu"
                  text="..."
                  onClick={handleMenuToggle}
                  buttonRef={menuButtonRef}
                />
              </div>
            </div>
          </header>

          <div className={`results-shadow ${showResults ? 'is-visible' : ''}`} aria-hidden="true" />

          <section className="center-stage">
            {!showResults ? (
              <div className="home-hero">
                <h1 className="hero-title">memact</h1>
                <SearchBar
                  value={composerValue}
                  onChange={(nextValue) => {
                    setComposerValue(nextValue)
                    if (nextValue.trim() && activeTimeFilter) {
                      setActiveTimeFilter(null)
                    }
                  }}
                  onSubmit={handleSubmit}
                  onSuggestionClick={() => {}}
                  loading={brain.isStreaming}
                  disabled={brain.isStreaming}
                  suggestions={[]}
                  timeFilters={[]}
                  activeTimeFilter={activeTimeFilter}
                  onTimeFilter={(value) => {
                    setActiveTimeFilter((current) => (current === value ? null : value))
                  }}
                  onDockVisibilityChange={setDockVisible}
                  onVoiceTrigger={handleVoiceTrigger}
                  voiceEnabled={voiceAvailable}
                  voiceState={voiceState}
                />
              </div>
            ) : null}

            {showResults ? (
              <section className="results-panel results-panel--thread">
                <ConversationThread
                  turns={conversationTurns}
                  isStreaming={brain.isStreaming}
                  copiedMessageKey={copiedMessageKey}
                  onCopyUser={handleCopyUser}
                  onCopyAssistant={handleCopyAssistant}
                  onEditUser={handleEditUser}
                  onRegenerate={handleReload}
                  onStop={brain.stopTurn}
                  onViewSources={(turn) => setSourceDialogTurn(turn)}
                />
              </section>
            ) : null}

            {showResults ? (
              <div className="composer-dock">
                <SearchBar
                  value={composerValue}
                  onChange={(nextValue) => {
                    setComposerValue(nextValue)
                    if (nextValue.trim() && activeTimeFilter) {
                      setActiveTimeFilter(null)
                    }
                  }}
                  onSubmit={handleSubmit}
                  onSuggestionClick={() => {}}
                  loading={brain.isStreaming}
                  disabled={brain.isStreaming}
                  suggestions={[]}
                  timeFilters={[]}
                  activeTimeFilter={activeTimeFilter}
                  onTimeFilter={(value) => {
                    setActiveTimeFilter((current) => (current === value ? null : value))
                  }}
                  onDockVisibilityChange={setDockVisible}
                  onVoiceTrigger={handleVoiceTrigger}
                  voiceEnabled={voiceAvailable}
                  voiceState={voiceState}
                  dockPlacement="up"
                />
              </div>
            ) : null}
          </section>

          <footer className={`status-text ${dockVisible ? 'is-hidden' : ''}`}>
            <span>{statusText}</span>
            <span className="status-text__version">{APP_VERSION_LABEL}</span>
          </footer>

          <div
            className={`loading-bar ${showLoadingBar ? 'is-visible' : ''}`}
            aria-hidden="true"
          >
            <div
              className="loading-bar__chunk"
              style={{
                transform: `scaleX(${Math.max(
                  0.04,
                  Math.min(
                    1,
                    brain.isModelLoading ? Number(brain.modelLoadProgress || 0) : brain.isStreaming ? 0.92 : 1
                  )
                )})`,
              }}
            />
          </div>
        </div>
      </main>

      {menuOpen ? (
        <div ref={menuRef}>
          <OverflowMenu style={menuStyle} setupLabel={setupLabel} onAction={handleMenuAction} />
        </div>
      ) : null}

      {activeDialog === 'history' ? (
        <ChatHistoryDialog
          entries={chatThreads}
          onSelect={handleSelectThread}
          onDelete={handleDeleteThread}
          onClear={handleClearThreads}
          onClose={() => setActiveDialog(null)}
        />
      ) : null}
      {activeDialog === 'info' ? <InfoDialog onClose={() => setActiveDialog(null)} /> : null}

      {activeDialog === 'privacy' ? (
        <PrivacyDialog onClose={() => setActiveDialog(null)} />
      ) : null}
      {activeDialog === 'clear-memories' ? (
        <ClearMemoriesDialog
          clearing={clearingMemories}
          errorMessage={clearMemoriesError}
          onConfirm={handleClearMemories}
          onClose={() => {
            if (!clearingMemories) {
              setClearMemoriesError('')
              setActiveDialog(null)
            }
          }}
        />
      ) : null}
      {sourceDialogTurn ? (
        <SourcesDialog
          turn={sourceDialogTurn}
          onOpen={(item) => {
            setSourceDialogTurn(null)
            openExternal(typeof item === 'string' ? item : item?.url)
          }}
          onSelect={(result) => {
            setSourceDialogTurn(null)
            setSelectedResult(result)
          }}
          onClose={() => setSourceDialogTurn(null)}
        />
      ) : null}
      {selectedResult ? (
        <MemoryDetailDialog
          result={selectedResult}
          onOpen={(item) => openExternal(item.url)}
          onClose={() => setSelectedResult(null)}
        />
      ) : null}
      {activeDialog === 'setup' ? (
        <BrowserSetupDialog
          browserInfo={browserInfo}
          mode={extension?.mode}
          extensionDetected={extension?.bridgeDetected}
          extensionReady={extension?.ready}
          onClose={() => {
            setSetupDialogAutoOpened(false)
            setActiveDialog(null)
          }}
        />
      ) : null}
    </>
  )
}
