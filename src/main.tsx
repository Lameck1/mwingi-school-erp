import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Note: ToastProvider is inside App.tsx (single instance). Do not wrap here again.
ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
