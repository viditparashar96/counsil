'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * Production-ready performance optimizations for the chat application
 */

// Debounce hook for search and other rapid inputs
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay]);

  return debouncedValue;
}

// Throttle hook for scroll events and other high-frequency events
export function useThrottle<T>(value: T, delay: number): T {
  const [throttledValue, setThrottledValue] = React.useState<T>(value);
  const lastExecuted = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const now = Date.now();
    
    if (now - lastExecuted.current >= delay) {
      setThrottledValue(value);
      lastExecuted.current = now;
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        setThrottledValue(value);
        lastExecuted.current = Date.now();
      }, delay - (now - lastExecuted.current));
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay]);

  return throttledValue;
}

// Intersection Observer hook for lazy loading and infinite scroll
export function useIntersectionObserver(
  options: IntersectionObserverInit = {}
) {
  const elementRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = React.useState(false);
  const [entry, setEntry] = React.useState<IntersectionObserverEntry | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        setEntry(entry);
      },
      {
        threshold: 0.1,
        rootMargin: '10px',
        ...options,
      }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [options]);

  return { elementRef, isVisible, entry };
}

// Virtual scrolling hook for large lists
export function useVirtualScroll<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 5,
}: {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}) {
  const [scrollTop, setScrollTop] = React.useState(0);

  const visibleRange = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const end = Math.min(items.length, start + visibleCount + overscan * 2);
    
    return { start, end };
  }, [scrollTop, itemHeight, containerHeight, items.length, overscan]);

  const visibleItems = useMemo(
    () => items.slice(visibleRange.start, visibleRange.end),
    [items, visibleRange]
  );

  const totalHeight = items.length * itemHeight;
  const offsetY = visibleRange.start * itemHeight;

  const handleScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  return {
    visibleItems,
    totalHeight,
    offsetY,
    handleScroll,
    visibleRange,
  };
}

// Memory usage optimization hook
export function useMemoryOptimization() {
  const performanceRef = useRef({
    memoryWarnings: 0,
    lastCleanup: Date.now(),
  });

  const checkMemoryUsage = useCallback(() => {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const usedPercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
      
      if (usedPercent > 80) {
        performanceRef.current.memoryWarnings++;
        console.warn(`High memory usage detected: ${usedPercent.toFixed(1)}%`);
        
        // Suggest garbage collection if available
        if ('gc' in global) {
          (global as any).gc();
        }
        
        return true;
      }
    }
    return false;
  }, []);

  const requestCleanup = useCallback(() => {
    const now = Date.now();
    const timeSinceLastCleanup = now - performanceRef.current.lastCleanup;
    
    // Only cleanup every 30 seconds to avoid performance hits
    if (timeSinceLastCleanup > 30000) {
      performanceRef.current.lastCleanup = now;
      
      // Force garbage collection in development
      if (process.env.NODE_ENV === 'development' && 'gc' in global) {
        (global as any).gc();
      }
      
      return true;
    }
    
    return false;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      checkMemoryUsage();
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [checkMemoryUsage]);

  return { checkMemoryUsage, requestCleanup };
}

// Network status hook for offline/online handling
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = React.useState(() => 
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [connectionType, setConnectionType] = React.useState<string>('unknown');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check connection type if available
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      setConnectionType(connection.effectiveType || 'unknown');
      
      const handleConnectionChange = () => {
        setConnectionType(connection.effectiveType || 'unknown');
      };
      
      connection.addEventListener('change', handleConnectionChange);
      
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        connection.removeEventListener('change', handleConnectionChange);
      };
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, connectionType };
}

// Prefetch hook for optimizing data loading
export function usePrefetch() {
  const prefetchedUrls = useRef(new Set<string>());

  const prefetchRoute = useCallback((href: string) => {
    if (prefetchedUrls.current.has(href)) return;
    
    prefetchedUrls.current.add(href);
    
    // Use Next.js router prefetch if available
    if (typeof window !== 'undefined' && 'next' in window) {
      const { router } = window as any;
      router?.prefetch(href);
    } else {
      // Fallback to link prefetch
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      document.head.appendChild(link);
    }
  }, []);

  const prefetchImage = useCallback((src: string) => {
    if (prefetchedUrls.current.has(src)) return;
    
    prefetchedUrls.current.add(src);
    
    const img = new Image();
    img.src = src;
  }, []);

  return { prefetchRoute, prefetchImage };
}

// Bundle all performance optimizations
export function useProductionOptimizations() {
  const memory = useMemoryOptimization();
  const network = useNetworkStatus();
  const prefetch = usePrefetch();

  return {
    memory,
    network,
    prefetch,
  };
}

// Re-export React for the hooks that need it
import React from 'react';