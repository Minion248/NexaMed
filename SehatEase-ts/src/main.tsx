import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { AuthProvider } from './App'
import './index.css' // This line was causing the error because the file was missing from 'src'

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>
  )
}