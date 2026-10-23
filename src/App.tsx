import { useEffect, useState } from 'react'
import { Digest } from './components/Digest'
import { Review } from './components/Review'
import { ProblemsList } from './components/ProblemsList'
import { Workspace } from './components/Workspace'

function useHashPath() {
  const [path, setPath] = useState(() => window.location.hash.slice(1) || '/')
  useEffect(() => {
    const onChange = () => setPath(window.location.hash.slice(1) || '/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return path
}

// Routes: #/, #/p/:problemId, #/p/:problemId/digest, #/p/:problemId/review
export function App() {
  const match = useHashPath().match(/^\/p\/([^/]+)(\/digest|\/review)?\/?$/)
  if (!match) return <ProblemsList />
  if (match[2] === '/digest') return <Digest id={match[1]} />
  if (match[2] === '/review') return <Review id={match[1]} />
  return <Workspace id={match[1]} />
}
