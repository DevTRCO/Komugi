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

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const preRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = async () => {
    const text = preRef.current?.textContent ?? ''
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can fail if window doesn't have focus
    }
  }

  return (
    <div className="group/code relative">
      <div className="sticky top-2 z-10 pointer-events-none flex h-0 justify-end">
        <button
          onClick={handleCopy}
          className="pointer-events-auto mr-2 mt-0 rounded bg-muted/80 p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/code:opacity-100"
          aria-label="Copy code"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre ref={preRef}>{children}</pre>
    </div>
  )
}

function sanitizeUri(uri: string): string {
  const trimmed = uri.trim().toLowerCase()
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('data:text/html')
  ) {
    return ''
  }
  return uri
}

const markdownComponents: Partial<Components> = {
  pre({ children }) {
    return <CodeBlock>{children}</CodeBlock>
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
        urlTransform={sanitizeUri}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
