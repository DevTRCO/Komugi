import { useChatStore } from '../stores/chatStore'
import { useSendMessage } from '@/features/ai'

/**
 * Orchestrates message editing: abort stream → truncate → resend.
 * Keeps store pure (ARCH-1) by coordinating side effects here.
 */
export function useEditMessage() {
  const { resend, abort } = useSendMessage()

  function editAndResend(messageId: string, newContent: string): void {
    const { isGenerating, truncateAndReplace } = useChatStore.getState()

    // RISK-3: abort in-flight stream before truncating
    if (isGenerating) {
      abort()
    }

    truncateAndReplace(messageId, newContent)
    resend()
  }

  return { editAndResend }
}
