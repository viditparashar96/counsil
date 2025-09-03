'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type UseSpeechToTextOptions = {
  lang?: string;
  interimResults?: boolean;
  continuous?: boolean;
  maxAlternatives?: number;
  onResult?: (text: string, isFinal: boolean) => void;
  onError?: (error: SpeechRecognitionErrorEvent | Error) => void;
  onStart?: () => void;
  onEnd?: () => void;
  // Resiliency options
  retryOnNetworkError?: boolean;
  maxNetworkRetries?: number; // default: 1
};

// Minimal typings to avoid TS complaints across browsers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecognition = any;

export function useSpeechToText(options: UseSpeechToTextOptions = {}) {
  const {
    lang = 'en-US',
    interimResults = true,
    continuous = true,
    maxAlternatives = 1,
    onResult,
    onError,
    onStart,
    onEnd,
  } = options;

  const recognitionRef = useRef<AnyRecognition | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const networkRetryRef = useRef(0);

  const isSecure = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return window.isSecureContext || isLocalhost;
  }, []);

  // Lazily resolve the constructor from window
  const RecognitionCtor = useMemo(() => {
    if (typeof window === 'undefined') return null;
    // @ts-expect-error: webkit prefix for Chromium-based browsers
    return (
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      // @ts-expect-error webkit vendor prefix
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition ||
      null
    );
  }, []);

  useEffect(() => {
    setIsSupported(Boolean(RecognitionCtor));
  }, [RecognitionCtor]);

  const start = useCallback(() => {
    if (!RecognitionCtor) return;
    if (!isSecure) {
      // Web Speech requires secure context except for localhost
      onError?.(new Error('Speech recognition requires HTTPS or localhost.'));
      return;
    }
    try {
      // If an instance exists, ensure it is stopped before starting again
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }

      const recognition: AnyRecognition = new (RecognitionCtor as unknown as new () => AnyRecognition)();
      recognition.lang = lang;
      recognition.interimResults = interimResults;
      recognition.continuous = continuous;
      recognition.maxAlternatives = maxAlternatives;

      recognition.onstart = () => {
        setIsListening(true);
        setPermissionError(null);
        setErrorCode(null);
        networkRetryRef.current = 0;
        onStart?.();
      };

      recognition.onend = () => {
        setIsListening(false);
        onEnd?.();
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // Common error codes: 'no-speech', 'audio-capture', 'not-allowed'
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setPermissionError('Microphone permission denied.');
        }
        setErrorCode(event.error || null);

        // One-shot retry for transient network / no-speech
        const allowRetry = options.retryOnNetworkError ?? true;
        const maxRetries = options.maxNetworkRetries ?? 1;
        if (
          allowRetry &&
          (event.error === 'network' || event.error === 'no-speech') &&
          networkRetryRef.current < maxRetries
        ) {
          networkRetryRef.current += 1;
          try {
            recognition.stop();
          } catch {}
          // Small delay before restarting to avoid immediate repeat failure
          setTimeout(() => {
            start();
          }, 400);
          return;
        }
        onError?.(event);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        // Build the cumulative transcript from all results to avoid duplication issues
        let transcript = '';
        let isFinal = false;
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          transcript += result[0].transcript;
          if (result.isFinal) isFinal = true;
        }
        onResult?.(transcript, isFinal);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      onError?.(err as Error);
    }
  }, [RecognitionCtor, continuous, interimResults, lang, maxAlternatives, onEnd, onError, onResult, onStart]);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop?.();
    } catch {}
  }, []);

  const abort = useCallback(() => {
    try {
      recognitionRef.current?.abort?.();
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    if (!isListening) start();
    else stop();
  }, [isListening, start, stop]);

  return {
    isSupported,
    isListening,
    permissionError,
    errorCode,
    start,
    stop,
    abort,
    toggle,
  } as const;
}
