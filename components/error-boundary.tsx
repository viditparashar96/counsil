'use client';

import React from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
  componentStack?: string;
}

// Production-ready error fallback component
function ErrorFallback({ error, resetErrorBoundary, componentStack }: ErrorFallbackProps) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Log error to monitoring service in production
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      // Here you would integrate with your error monitoring service
      // e.g., Sentry, LogRocket, Bugsnag, etc.
      console.error('Production Error:', {
        message: error.message,
        stack: error.stack,
        componentStack,
        timestamp: new Date().toISOString(),
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      });
    }
  }, [error, componentStack]);

  return (
    <div className="min-h-[200px] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-red-500 text-4xl">⚠️</div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Something went wrong
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          We apologize for the inconvenience. Please try refreshing the page or contact support if the problem persists.
        </p>
        
        {isDevelopment && (
          <details className="mt-4 text-left bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <summary className="cursor-pointer font-medium text-red-800 dark:text-red-200">
              Error Details (Development)
            </summary>
            <pre className="mt-2 text-xs text-red-700 dark:text-red-300 overflow-auto">
              {error.message}
              {'\n\n'}
              {error.stack}
              {componentStack && '\n\nComponent Stack:'}
              {componentStack}
            </pre>
          </details>
        )}

        <div className="flex gap-2 justify-center">
          <Button 
            onClick={resetErrorBoundary}
            variant="outline"
            size="sm"
          >
            Try Again
          </Button>
          <Button 
            onClick={() => window.location.reload()}
            variant="default"
            size="sm"
          >
            Reload Page
          </Button>
        </div>
      </div>
    </div>
  );
}

// React Error Boundary Class Component
export class ProductionErrorBoundary extends React.Component<
  React.PropsWithChildren<{
    fallback?: React.ComponentType<ErrorFallbackProps>;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  }>,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error information
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || ErrorFallback;
      
      return (
        <FallbackComponent
          error={this.state.error!}
          resetErrorBoundary={this.resetErrorBoundary}
          componentStack={this.state.errorInfo?.componentStack}
        />
      );
    }

    return this.props.children;
  }
}

// Query Error Boundary that integrates with TanStack Query
export function QueryErrorBoundary({ children }: React.PropsWithChildren) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ProductionErrorBoundary
          fallback={({ error, resetErrorBoundary }) => (
            <ErrorFallback
              error={error}
              resetErrorBoundary={() => {
                reset(); // Reset TanStack Query error state
                resetErrorBoundary(); // Reset React error boundary
              }}
            />
          )}
        >
          {children}
        </ProductionErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

// Async error boundary hook for handling async errors in components
export function useAsyncErrorBoundary() {
  const [error, setError] = React.useState<Error | null>(null);

  const captureAsyncError = React.useCallback((error: Error) => {
    setError(error);
  }, []);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return { captureAsyncError };
}

// Production-ready error boundary wrapper for the entire app
export function AppErrorBoundary({ children }: React.PropsWithChildren) {
  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    // In production, send error to monitoring service
    if (process.env.NODE_ENV === 'production') {
      // Example integration points:
      // - Sentry: Sentry.captureException(error)
      // - LogRocket: LogRocket.captureException(error)
      // - Custom API: sendErrorToAPI({ error, errorInfo })
      console.error('Application Error:', {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
      });
    }
  };

  return (
    <ProductionErrorBoundary onError={handleError}>
      <QueryErrorBoundary>
        {children}
      </QueryErrorBoundary>
    </ProductionErrorBoundary>
  );
}