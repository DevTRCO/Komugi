import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface ChatSession {
  id: string
  screenshotBase64: string
  screenshotWidth: number
  screenshotHeight: number
  messages: readonly ChatMessage[]
  createdAt: number
  difficulty: DifficultyLevel
}

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced'

interface ChatState {
  /** Current active session (null if no screenshot taken yet) */
  currentSession: ChatSession | null
  /** Whether the AI is currently generating a response */
  isGenerating: boolean
  /** Streaming partial response from AI */
  streamingContent: string
  /** Error from last AI call */
  lastError: string | null

  startSession: (screenshot: {
    imageBase64: string
    width: number
    height: number
  }) => void
  addUserMessage: (content: string) => void
  addAssistantMessage: (content: string) => void
  appendStreamingContent: (chunk: string) => void
  finalizeStreaming: () => void
  setIsGenerating: (generating: boolean) => void
  setLastError: (error: string | null) => void
  endSession: () => void
}

const MAX_MESSAGES_PER_SESSION = 30

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const useChatStore = create<ChatState>()(
  devtools(
    (set, get) => ({
      currentSession: null,
      isGenerating: false,
      streamingContent: '',
      lastError: null,

      startSession: screenshot => {
        const session: ChatSession = {
          id: generateId(),
          screenshotBase64: screenshot.imageBase64,
          screenshotWidth: screenshot.width,
          screenshotHeight: screenshot.height,
          messages: [],
          createdAt: Date.now(),
          difficulty: 'intermediate',
        }
        set(
          { currentSession: session, lastError: null, streamingContent: '' },
          undefined,
          'startSession'
        )
      },

      addUserMessage: content => {
        const session = get().currentSession
        if (!session) return
        if (session.messages.length >= MAX_MESSAGES_PER_SESSION) return

        const message: ChatMessage = {
          id: generateId(),
          role: 'user',
          content,
          timestamp: Date.now(),
        }
        set(
          {
            currentSession: {
              ...session,
              messages: [...session.messages, message],
            },
            lastError: null,
          },
          undefined,
          'addUserMessage'
        )
      },

      addAssistantMessage: content => {
        const session = get().currentSession
        if (!session) return

        const message: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content,
          timestamp: Date.now(),
        }
        set(
          {
            currentSession: {
              ...session,
              messages: [...session.messages, message],
            },
          },
          undefined,
          'addAssistantMessage'
        )
      },

      appendStreamingContent: chunk =>
        set(
          state => ({ streamingContent: state.streamingContent + chunk }),
          undefined,
          'appendStreamingContent'
        ),

      finalizeStreaming: () => {
        const { streamingContent, currentSession } = get()
        if (!currentSession || !streamingContent) return

        const message: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: streamingContent,
          timestamp: Date.now(),
        }
        set(
          {
            currentSession: {
              ...currentSession,
              messages: [...currentSession.messages, message],
            },
            streamingContent: '',
            isGenerating: false,
          },
          undefined,
          'finalizeStreaming'
        )
      },

      setIsGenerating: generating =>
        set({ isGenerating: generating }, undefined, 'setIsGenerating'),

      setLastError: error =>
        set(
          { lastError: error, isGenerating: false },
          undefined,
          'setLastError'
        ),

      endSession: () =>
        set(
          {
            currentSession: null,
            streamingContent: '',
            isGenerating: false,
            lastError: null,
          },
          undefined,
          'endSession'
        ),
    }),
    { name: 'chat-store' }
  )
)
