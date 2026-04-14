import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — Catches render errors and shows a friendly recovery UI.
 * Wraps any page/component to prevent full-app crashes.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary__icon">⚠️</div>
          <h3 className="error-boundary__title">
            {this.props.fallbackTitle || 'Đã xảy ra lỗi'}
          </h3>
          <p className="error-boundary__message">
            {this.state.error?.message || 'Không thể hiển thị nội dung này. Vui lòng thử lại.'}
          </p>
          <button className="btn btn--primary" onClick={this.handleRetry}>
            🔄 Thử lại
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
