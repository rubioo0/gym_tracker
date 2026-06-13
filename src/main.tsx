import { Component, StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(_: Error) {
    return { hasError: true }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100dvh', padding: '2rem',
          textAlign: 'center', gap: '1.25rem', fontFamily: 'system-ui,sans-serif',
        }}>
          <div style={{ fontSize: '2.5rem' }}>😕</div>
          <h1 style={{ fontSize: '1.4rem', margin: 0, color: '#1f1f24' }}>Щось пішло не так</h1>
          <p style={{ color: '#5a6272', margin: 0 }}>Сталась несподівана помилка. Оновіть сторінку.</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#0b5bd3', color: '#fff', border: 'none',
              borderRadius: '8px', padding: '0.75rem 1.5rem',
              fontSize: '1rem', cursor: 'pointer',
            }}
          >
            Оновити сторінку
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
