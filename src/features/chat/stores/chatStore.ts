import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { useSettingsStore } from '@/features/settings/stores/settingsStore'
import type { DifficultyLevel } from '@/lib/schemas'

export type { DifficultyLevel }

export interface ScreenshotAttachment {
  imageBase64: string
  width: number
  height: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  screenshotBase64?: string
  screenshotWidth?: number
  screenshotHeight?: number
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

interface ChatState {
  sessions: readonly ChatSession[]
  activeSessionId: string | null
  isGenerating: boolean
  streamingContent: string
  lastError: string | null
  pendingScreenshot: ScreenshotAttachment | null
  screenshotDecisionPending: boolean

  startSession: (screenshot: {
    imageBase64: string
    width: number
    height: number
  }) => void
  switchSession: (sessionId: string) => void
  deleteSession: (sessionId: string) => void
  addUserMessage: (content: string, screenshot?: ScreenshotAttachment) => void
  appendStreamingContent: (chunk: string) => void
  finalizeStreaming: () => void
  setIsGenerating: (generating: boolean) => void
  setLastError: (error: string | null) => void
  endSession: () => void
  restoreSession: (session: ChatSession) => void
  setPendingScreenshot: (screenshot: ScreenshotAttachment) => void
  clearPendingScreenshot: () => void
  setScreenshotDecisionPending: (pending: boolean) => void
}

function getActiveSession(state: ChatState): ChatSession | null {
  if (!state.activeSessionId) return null
  return state.sessions.find(s => s.id === state.activeSessionId) ?? null
}

const MAX_SESSIONS = 20

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function updateSession(
  sessions: readonly ChatSession[],
  sessionId: string,
  updater: (session: ChatSession) => ChatSession
): readonly ChatSession[] {
  return sessions.map(s => (s.id === sessionId ? updater(s) : s))
}

export const useChatStore = create<ChatState>()(
  devtools(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      isGenerating: false,
      streamingContent: '',
      lastError: null,
      pendingScreenshot: null,
      screenshotDecisionPending: false,

      startSession: screenshot => {
        const newSession: ChatSession = {
          id: generateId(),
          screenshotBase64: screenshot.imageBase64,
          screenshotWidth: screenshot.width,
          screenshotHeight: screenshot.height,
          messages: [],
          createdAt: Date.now(),
          difficulty: useSettingsStore.getState().difficulty,
        }

        const { sessions } = get()
        const updated = [newSession, ...sessions].slice(0, MAX_SESSIONS)

        set(
          {
            sessions: updated,
            activeSessionId: newSession.id,
            lastError: null,
            streamingContent: '',
            isGenerating: false,
          },
          undefined,
          'startSession'
        )
      },

      switchSession: sessionId => {
        const { sessions, isGenerating } = get()
        if (isGenerating) return
        if (!sessions.some(s => s.id === sessionId)) return

        set(
          {
            activeSessionId: sessionId,
            lastError: null,
            streamingContent: '',
            pendingScreenshot: null,
            screenshotDecisionPending: false,
          },
          undefined,
          'switchSession'
        )
      },

      deleteSession: sessionId => {
        const { sessions, activeSessionId } = get()
        const filtered = sessions.filter(s => s.id !== sessionId)
        const newActiveId =
          sessionId === activeSessionId
            ? (filtered[0]?.id ?? null)
            : activeSessionId

        set(
          {
            sessions: filtered,
            activeSessionId: newActiveId,
            streamingContent:
              sessionId === activeSessionId ? '' : get().streamingContent,
            isGenerating:
              sessionId === activeSessionId ? false : get().isGenerating,
          },
          undefined,
          'deleteSession'
        )
      },

      addUserMessage: (content, screenshot) => {
        const state = get()
        const session = getActiveSession(state)
        if (!session) return

        const message: ChatMessage = {
          id: generateId(),
          role: 'user',
          content,
          timestamp: Date.now(),
          ...(screenshot && {
            screenshotBase64: screenshot.imageBase64,
            screenshotWidth: screenshot.width,
            screenshotHeight: screenshot.height,
          }),
        }
        set(
          {
            sessions: updateSession(state.sessions, session.id, s => ({
              ...s,
              messages: [...s.messages, message],
            })),
            lastError: null,
            pendingScreenshot: null,
            screenshotDecisionPending: false,
          },
          undefined,
          'addUserMessage'
        )
      },

      appendStreamingContent: chunk =>
        set(
          state => ({ streamingContent: state.streamingContent + chunk }),
          undefined,
          'appendStreamingContent'
        ),

      finalizeStreaming: () => {
        const state = get()
        const session = getActiveSession(state)
        if (!session || !state.streamingContent) return

        const message: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: state.streamingContent,
          timestamp: Date.now(),
        }
        set(
          {
            sessions: updateSession(state.sessions, session.id, s => ({
              ...s,
              messages: [...s.messages, message],
            })),
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

      endSession: () => {
        const { activeSessionId, sessions } = get()
        if (!activeSessionId) return
        const filtered = sessions.filter(s => s.id !== activeSessionId)
        set(
          {
            sessions: filtered,
            activeSessionId: filtered[0]?.id ?? null,
            streamingContent: '',
            isGenerating: false,
            lastError: null,
          },
          undefined,
          'endSession'
        )
      },

      restoreSession: session => {
        const { sessions, isGenerating } = get()
        if (isGenerating) return

        if (sessions.some(s => s.id === session.id)) {
          set(
            {
              activeSessionId: session.id,
              lastError: null,
              streamingContent: '',
            },
            undefined,
            'restoreSession/switch'
          )
          return
        }

        const updated = [session, ...sessions].slice(0, MAX_SESSIONS)
        set(
          {
            sessions: updated,
            activeSessionId: session.id,
            lastError: null,
            streamingContent: '',
            isGenerating: false,
          },
          undefined,
          'restoreSession'
        )
      },

      setPendingScreenshot: screenshot =>
        set(
          { pendingScreenshot: screenshot, screenshotDecisionPending: true },
          undefined,
          'setPendingScreenshot'
        ),

      clearPendingScreenshot: () =>
        set(
          { pendingScreenshot: null, screenshotDecisionPending: false },
          undefined,
          'clearPendingScreenshot'
        ),

      setScreenshotDecisionPending: pending =>
        set(
          { screenshotDecisionPending: pending },
          undefined,
          'setScreenshotDecisionPending'
        ),
    }),
    { name: 'chat-store' }
  )
)

// Selectors

export function selectActiveSession(state: ChatState): ChatSession | null {
  return getActiveSession(state)
}

const MAX_SCREENSHOTS_PER_SESSION = 8

export function selectCanAddScreenshot(state: ChatState): boolean {
  const session = getActiveSession(state)
  if (!session) return false
  const messageScreenshots = session.messages.filter(
    m => m.screenshotBase64
  ).length
  return 1 + messageScreenshots < MAX_SCREENSHOTS_PER_SESSION
}
