import { useEffect } from 'react'
import Search from './pages/Search'
import { useExtension } from './hooks/useExtension'

export default function App() {
  const extension = useExtension()

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const api = {
      getEvents: (options = {}) => extension.getCaptanetEvents(options),
      getSessions: (options = {}) => extension.getCaptanetSessions(options),
      getActivities: (options = {}) => extension.getCaptanetActivities(options),
      getSnapshot: (options = {}) => extension.getCaptanetSnapshot(options),
      exportSnapshot: (options = {}) => extension.exportCaptanetSnapshot(options),
    }

    window.captanet = api
    window.memactCaptanet = api

    return () => {
      if (window.captanet === api) {
        delete window.captanet
      }
      if (window.memactCaptanet === api) {
        delete window.memactCaptanet
      }
    }
  }, [extension])

  return <Search extension={extension} />
}
