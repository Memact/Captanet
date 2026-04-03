import { useEffect, useMemo, useRef } from 'react'
import MathRichText from './MathRichText'

function normalize(value) {
  return String(value || '').trim()
}

export default function ConversationThread({
  turns = [],
  isStreaming = false,
  copiedMessageKey = '',
  onCopyUser,
  onCopyAssistant,
  onEditUser,
  onRegenerate,
  onStop,
  onViewSources,
}) {
  const threadRef = useRef(null)
  const bottomRef = useRef(null)
  const autoScrollRef = useRef(true)

  const turnSignature = useMemo(
    () =>
      turns
        .map((turn) => `${turn.id}:${turn.pending ? 'pending' : 'done'}:${normalize(turn?.answerMeta?.answer).length}`)
        .join('|'),
    [turns]
  )

  useEffect(() => {
    const node = threadRef.current
    if (!node) {
      return undefined
    }

    const handleScroll = () => {
      const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight
      autoScrollRef.current = distanceFromBottom < 24
    }

    node.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => {
      node.removeEventListener('scroll', handleScroll)
    }
  }, [])

  useEffect(() => {
    if (!autoScrollRef.current) {
      return
    }

    const node = bottomRef.current
    if (!node) {
      return
    }

    node.scrollIntoView({
      block: 'end',
      behavior: isStreaming ? 'smooth' : 'auto',
    })
  }, [isStreaming, turnSignature])

  return (
    <div ref={threadRef} className="conversation-thread">
      <div className="conversation-thread__stack">
        {turns.map((turn) => {
          const answerText = normalize(turn?.answerMeta?.answer)
          const replySummary = normalize(turn?.answerMeta?.summary)
          const pointers = Array.isArray(turn?.answerMeta?.pointers)
            ? turn.answerMeta.pointers.filter(Boolean)
            : []
          const memorySourceCount = Array.isArray(turn?.results) ? turn.results.length : 0
          const webSourceCount = Array.isArray(turn?.webSources) ? turn.webSources.length : 0
          const totalSourceCount = memorySourceCount + webSourceCount

          return (
            <div key={turn.id} className="thread-pair">
              <article className="thread-turn thread-turn--user">
                <div className="thread-turn__eyebrow">You</div>
                <div className="thread-turn__bubble">
                  <MathRichText text={turn.query || 'Message'} />
                </div>
                <div className="thread-turn__actions thread-turn__actions--user">
                  <button
                    type="button"
                    className={`dialog-utility-button thread-action-button thread-action-button--copy ${
                      copiedMessageKey === `user:${turn.id}` ? 'is-copied' : ''
                    }`}
                    onClick={() => onCopyUser?.(turn)}
                    aria-label={copiedMessageKey === `user:${turn.id}` ? 'Copied' : 'Copy message'}
                    title={copiedMessageKey === `user:${turn.id}` ? 'Copied' : 'Copy'}
                  >
                    <span className="thread-action-button__icon" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="dialog-utility-button thread-action-button thread-action-button--edit"
                    onClick={() => onEditUser?.(turn)}
                    aria-label="Edit message"
                    title="Edit"
                  >
                    <span className="thread-action-button__icon" aria-hidden="true" />
                  </button>
                </div>
              </article>

              <article
                className={`thread-turn thread-turn--assistant ${
                  turn.pending ? 'thread-turn--pending' : ''
                } ${turn.error ? 'thread-turn--error' : ''}`}
              >
                <div className="thread-turn__header">
                  <div className="thread-turn__eyebrow">Memact</div>
                </div>

                <div className="thread-turn__bubble thread-turn__bubble--assistant">
                  {turn.error ? (
                    <div className="thread-error-copy">
                      <p className="thread-error-text">{turn.error}</p>
                    </div>
                  ) : turn.pending && !answerText ? (
                    <div className="thread-waiting">
                      <span className="thread-waiting__dot" />
                      <span className="thread-waiting__dot" />
                      <span className="thread-waiting__dot" />
                    </div>
                  ) : turn.pending ? (
                    <div className="thread-streaming-copy">
                      <pre className="thread-streaming-text">{answerText}</pre>
                      <span className="thread-streaming-cursor" aria-hidden="true">
                        |
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="thread-answer-copy">
                        <MathRichText text={answerText} />
                      </div>
                      {replySummary ? <p className="thread-answer-summary">{replySummary}</p> : null}
                      {pointers.length ? (
                        <div className="answer-pointer-list">
                          {pointers.map((point, index) => (
                            <div key={`${turn.id}-${index}`} className="answer-pointer-item">
                              <span className="answer-pointer-dot" aria-hidden="true" />
                              <span className="answer-pointer-copy">
                                <MathRichText text={point} />
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}

                  {totalSourceCount && !turn.pending && !turn.error ? (
                    <button
                      type="button"
                      className="results-panel__overview-toggle"
                      onClick={() => onViewSources?.(turn)}
                    >
                      {`View sources (${totalSourceCount})`}
                    </button>
                  ) : null}
                </div>
                {turn.pending && !turn.error ? (
                  <div className="thread-turn__actions thread-turn__actions--assistant">
                    <button
                      type="button"
                      className="dialog-utility-button thread-action-button thread-action-button--stop"
                      onClick={() => onStop?.(turn)}
                      aria-label="Stop reply"
                      title="Stop"
                    >
                      <span className="thread-action-button__icon" aria-hidden="true" />
                    </button>
                  </div>
                ) : turn.error ? (
                  <div className="thread-turn__actions thread-turn__actions--assistant">
                    <button
                      type="button"
                      className={`dialog-utility-button thread-action-button thread-action-button--copy ${
                        copiedMessageKey === `assistant:${turn.id}` ? 'is-copied' : ''
                      }`}
                      onClick={() => onCopyAssistant?.(turn)}
                      aria-label={copiedMessageKey === `assistant:${turn.id}` ? 'Copied' : 'Copy reply'}
                      title={copiedMessageKey === `assistant:${turn.id}` ? 'Copied' : 'Copy'}
                    >
                      <span className="thread-action-button__icon" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="dialog-utility-button thread-action-button thread-action-button--regenerate"
                      onClick={() => onRegenerate?.(turn)}
                      aria-label="Retry reply"
                      title="Retry"
                    >
                      <span className="thread-action-button__icon" aria-hidden="true" />
                    </button>
                  </div>
                ) : !turn.pending ? (
                  <div className="thread-turn__actions thread-turn__actions--assistant">
                    <button
                      type="button"
                      className={`dialog-utility-button thread-action-button thread-action-button--copy ${
                        copiedMessageKey === `assistant:${turn.id}` ? 'is-copied' : ''
                      }`}
                      onClick={() => onCopyAssistant?.(turn)}
                      aria-label={copiedMessageKey === `assistant:${turn.id}` ? 'Copied' : 'Copy reply'}
                      title={copiedMessageKey === `assistant:${turn.id}` ? 'Copied' : 'Copy'}
                    >
                      <span className="thread-action-button__icon" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="dialog-utility-button thread-action-button thread-action-button--regenerate"
                      onClick={() => onRegenerate?.(turn)}
                      aria-label="Regenerate reply"
                      title="Regenerate"
                    >
                      <span className="thread-action-button__icon" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </article>
            </div>
          )
        })}
        <div ref={bottomRef} className="conversation-thread__anchor" aria-hidden="true" />
      </div>
    </div>
  )
}
