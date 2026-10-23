import { useEffect } from 'react'
import { useStore } from '../store'
import { registerReviewTools, type ModelContext } from '../lib/webmcp'

export function WebMcpBridge() {
  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: ModelContext }).modelContext
    if (!modelContext) return

    const controller = new AbortController()
    const ready = useStore.persist.hasHydrated()
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          let unsubscribe = () => {}
          unsubscribe = useStore.persist.onFinishHydration(() => {
            unsubscribe()
            resolve()
          })
        })
    void ready.then(() => registerReviewTools(modelContext, useStore, controller.signal)).catch(() => controller.abort())
    return () => controller.abort()
  }, [])

  return null
}
