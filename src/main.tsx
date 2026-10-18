import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles/app.css';

// Если интерфейс или 3D-сцена падают, показываем текст ошибки вместо белого экрана.
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('3D Home Academy error:', error, info.componentStack);
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#111', maxWidth: 720 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500 }}>Не удалось открыть демо</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>
          Обычно это значит, что браузер или устройство не поддерживает 3D (WebGL). Попробуйте другой браузер
          или обновите страницу.
        </p>
        <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', background: '#f4f5f7', padding: 12, borderRadius: 8 }}>
          {error.message}
        </pre>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
