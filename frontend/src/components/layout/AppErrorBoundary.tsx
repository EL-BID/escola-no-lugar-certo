import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
  copied: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  private copyTimeoutId: number | null = null;

  state: AppErrorBoundaryState = {
    hasError: false,
    message: '',
    copied: false,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Erro inesperado na interface.',
      copied: false,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AppErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetStateAndReload = () => {
    try {
      localStorage.removeItem('edu-brazil-dashboard');
      localStorage.removeItem('edu-brazil-dashboard-v2');
    } catch {
      // Ignore storage access failures and still force a reload.
    }

    window.location.reload();
  };

  handleCopyDetails = async () => {
    const { message } = this.state;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = message;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'absolute';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      this.setState({ copied: true });
      if (this.copyTimeoutId !== null) {
        window.clearTimeout(this.copyTimeoutId);
      }
      this.copyTimeoutId = window.setTimeout(() => {
        this.setState({ copied: false });
      }, 1500);
    } catch {
      this.setState({ copied: false });
    }
  };

  componentWillUnmount() {
    if (this.copyTimeoutId !== null) {
      window.clearTimeout(this.copyTimeoutId);
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-xl border bg-card p-6 shadow-lg space-y-4">
          <h2 className="text-lg font-semibold text-foreground">A interface encontrou um erro</h2>
          <p className="text-sm text-muted-foreground">
            O aplicativo foi protegido para evitar a tela em branco. Tente recarregar a página.
          </p>
          <details className="rounded-md border border-border/70 bg-muted/20">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground">
              Ver detalhes técnicos
            </summary>
            <div className="space-y-2 border-t border-border/60 px-3 py-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  Essas informações ajudam no diagnóstico do erro.
                </p>
                <button
                  type="button"
                  onClick={this.handleCopyDetails}
                  className="inline-flex items-center justify-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
                >
                  {this.state.copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <pre className="max-h-40 overflow-auto rounded-md bg-slate-950 px-3 py-2 text-xs text-slate-100">
                <code className="whitespace-pre-wrap break-words">
                  {this.state.message}
                </code>
              </pre>
            </div>
          </details>
          <div>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Recarregar aplicação
            </button>
          </div>
          <div>
            <button
              type="button"
              onClick={this.handleResetStateAndReload}
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Limpar estado salvo e recarregar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
