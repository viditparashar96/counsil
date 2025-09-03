/**
 * Production-ready error handling to prevent memory leaks and improve stability
 */

// Set up global error handlers to prevent memory leaks
export function setupProductionErrorHandling() {
  // Increase the default max listeners to prevent warnings
  process.setMaxListeners(0); // 0 = unlimited, but be careful in production
  
  // Better approach: Set a reasonable limit
  const MAX_LISTENERS = 50;
  process.setMaxListeners(MAX_LISTENERS);

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Uncaught Exception:', error);
    } else {
      // In production, log to monitoring service and gracefully exit
      try {
        // Send to error monitoring service
        // e.g., Sentry.captureException(error);
        console.error('Production uncaught exception:', error.message);
      } catch (loggingError) {
        // Ignore logging errors to prevent cascade
      }
      
      // In a real production app, you might want to gracefully shutdown
      // process.exit(1);
    }
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    } else {
      // In production, log and continue
      try {
        // Send to error monitoring service
        console.error('Production unhandled rejection:', reason);
      } catch (loggingError) {
        // Ignore logging errors
      }
    }
  });

  // Handle warnings (like the MaxListenersExceededWarning)
  process.on('warning', (warning) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Process Warning:', warning);
    } else {
      // In production, only log serious warnings
      if (warning.name === 'MaxListenersExceededWarning') {
        // This is usually not critical, just increase the limit
        const emitter = (warning as any).emitter;
        if (emitter && typeof emitter.setMaxListeners === 'function') {
          emitter.setMaxListeners(MAX_LISTENERS);
        }
      } else {
        try {
          console.warn('Production warning:', warning.message);
        } catch (e) {
          // Ignore logging errors
        }
      }
    }
  });

  // Memory monitoring in production
  if (process.env.NODE_ENV === 'production') {
    const MEMORY_CHECK_INTERVAL = 30000; // 30 seconds
    const MEMORY_THRESHOLD = 0.85; // 85% of heap limit
    
    setInterval(() => {
      try {
        const memoryUsage = process.memoryUsage();
        const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
        const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
        
        // Check if memory usage is too high
        if (heapUsedMB / heapTotalMB > MEMORY_THRESHOLD) {
          console.warn(`High memory usage: ${heapUsedMB.toFixed(2)}MB / ${heapTotalMB.toFixed(2)}MB`);
          
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }
        }
      } catch (error) {
        // Ignore memory monitoring errors
      }
    }, MEMORY_CHECK_INTERVAL);
  }
}

// Error boundary utility for async operations
export class AsyncErrorBoundary {
  private static instance: AsyncErrorBoundary;
  private errorHandlers: Set<(error: Error) => void> = new Set();

  static getInstance(): AsyncErrorBoundary {
    if (!AsyncErrorBoundary.instance) {
      AsyncErrorBoundary.instance = new AsyncErrorBoundary();
    }
    return AsyncErrorBoundary.instance;
  }

  addErrorHandler(handler: (error: Error) => void): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  captureAsyncError(error: Error, context?: string): void {
    if (process.env.NODE_ENV === 'development') {
      console.error(`Async error${context ? ` in ${context}` : ''}:`, error);
    }

    // Notify all registered handlers
    this.errorHandlers.forEach(handler => {
      try {
        handler(error);
      } catch (handlerError) {
        // Prevent handler errors from cascading
        if (process.env.NODE_ENV === 'development') {
          console.error('Error handler failed:', handlerError);
        }
      }
    });
  }

  wrapAsync<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context?: string
  ): T {
    return (async (...args: Parameters<T>) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.captureAsyncError(error as Error, context);
        throw error;
      }
    }) as T;
  }
}

// Utility to wrap promises with error boundary
export function wrapPromise<T>(
  promise: Promise<T>,
  context?: string
): Promise<T> {
  const errorBoundary = AsyncErrorBoundary.getInstance();
  
  return promise.catch(error => {
    errorBoundary.captureAsyncError(error, context);
    throw error;
  });
}

// Rate limiter for error logging to prevent spam
export class ErrorLogRateLimiter {
  private static instance: ErrorLogRateLimiter;
  private logCounts: Map<string, { count: number; lastReset: number }> = new Map();
  private readonly maxLogsPerMinute = 10;
  private readonly resetInterval = 60000; // 1 minute

  static getInstance(): ErrorLogRateLimiter {
    if (!ErrorLogRateLimiter.instance) {
      ErrorLogRateLimiter.instance = new ErrorLogRateLimiter();
    }
    return ErrorLogRateLimiter.instance;
  }

  shouldLog(errorKey: string): boolean {
    const now = Date.now();
    const record = this.logCounts.get(errorKey);

    if (!record || now - record.lastReset > this.resetInterval) {
      this.logCounts.set(errorKey, { count: 1, lastReset: now });
      return true;
    }

    if (record.count < this.maxLogsPerMinute) {
      record.count++;
      return true;
    }

    return false;
  }

  logError(error: Error, context?: string): boolean {
    const errorKey = `${error.name}:${error.message}:${context || 'unknown'}`;
    
    if (this.shouldLog(errorKey)) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`Rate-limited error${context ? ` in ${context}` : ''}:`, error);
      }
      return true;
    }

    return false;
  }
}