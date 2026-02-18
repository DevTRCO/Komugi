import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import { Copy, Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Components } from 'react-markdown'

interface MarkdownRendererProps {
  content: string
}

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children)
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can fail if window doesn't have focus
    }
  }

  return (
    <div className="group/code relative">
      <pre>
        <code>{children}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 rounded bg-muted/80 p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/code:opacity-100"
        aria-label="Copy code"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  )
}

/** Recursively extract text content from React nodes (handles rehype-highlight spans) */
function extractCodeText(node: React.ReactNode): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractCodeText).join('')

  const elem = node as React.ReactElement<{ children?: React.ReactNode }>
  if (elem?.props?.children) return extractCodeText(elem.props.children)
  return ''
}

const markdownComponents: Partial<Components> = {
  pre({ children }) {
    return <CodeBlock>{extractCodeText(children)}</CodeBlock>
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="cursor-pointer"
      >
        {children}
      </a>
    )
  },
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
