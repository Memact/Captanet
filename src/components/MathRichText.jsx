import { Suspense, lazy } from 'react'

const MathRichTextRenderer = lazy(() => import('./MathRichTextRenderer'))

function normalizeText(value) {
  return String(value || '')
}

function PlainTextFallback({ text, className = '', inline = false }) {
  const Tag = inline ? 'span' : 'div'
  const classes = [
    'math-rich-text',
    inline ? 'math-rich-text--inline' : 'math-rich-text--block',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag className={classes}>
      <span className="math-rich-text__text">{normalizeText(text)}</span>
    </Tag>
  )
}

export default function MathRichText(props) {
  return (
    <Suspense fallback={<PlainTextFallback {...props} />}>
      <MathRichTextRenderer {...props} />
    </Suspense>
  )
}
