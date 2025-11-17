import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import UplineHierarchyPage from './pages/UplineHierarchyPage'
import VisualHierarchyPage from './pages/VisualHierarchyPage'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.location.pathname.toLowerCase().includes('visual') || window.location.pathname.toLowerCase().includes('hierarchy-visual') ? (
      <VisualHierarchyPage />
    ) : window.location.pathname.toLowerCase().includes('upline') ? (
      <UplineHierarchyPage />
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
