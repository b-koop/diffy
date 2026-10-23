import { createRoot } from 'react-dom/client'
import { App } from './App'
import { WebMcpBridge } from './components/WebMcpBridge'
import './index.css'

createRoot(document.getElementById('root')!).render(<><App /><WebMcpBridge /></>)
