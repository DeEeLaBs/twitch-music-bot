import React from 'react';

type AppErrorBoundaryProps = { children?: React.ReactNode };
type AppErrorBoundaryState = { error: string };

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  declare props: Readonly<AppErrorBoundaryProps>;
  state: AppErrorBoundaryState = { error: '' };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.error) {
      const en = document.documentElement.lang === 'en';
      return (
        <main className="min-h-screen bg-neutral-950 text-neutral-100 grid place-items-center p-8">
          <div className="max-w-xl bg-neutral-900 border border-red-500/30 rounded-2xl p-6 space-y-3">
            <h1 className="text-xl font-bold">{en ? 'Interface error' : 'Oberflächenfehler'}</h1>
            <p className="text-sm text-neutral-300">{en ? 'The bot interface could not display this section. The bot service continues to run independently.' : 'Die Bot-Oberfläche konnte einen Bereich nicht darstellen. Der Bot-Dienst läuft davon unabhängig weiter.'}</p>
            <pre className="text-xs whitespace-pre-wrap text-red-300">{this.state.error}</pre>
            <button className="primary-button" onClick={() => location.reload()}>{en ? 'Reload interface' : 'Oberfläche neu laden'}</button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
// 
