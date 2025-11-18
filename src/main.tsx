import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import UplineHierarchyPage from './pages/UplineHierarchyPage'
import VisualHierarchyPage from './pages/VisualHierarchyPage'
import './index.css'

const pathname = window.location.pathname.toLowerCase()

const SHOW_UPLINE_PAGE = false
const SHOW_SURELC_DEMO_PAGE = false

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {SHOW_UPLINE_PAGE && pathname.includes('upline') ? (
      <UplineHierarchyPage />
    ) : SHOW_SURELC_DEMO_PAGE && pathname.includes('surelc-demo') ? (
      <App />
    ) : (
      <VisualHierarchyPage />
    )}
  </React.StrictMode>,
)
