"use client";

/**
 * Voice search through the browser's Web Speech API.
 *
 * Chrome, Edge and Safari have it (Chrome and Safari prefixed as
 * webkitSpeechRecognition); Firefox does not, and there `supported` stays
 * false so the microphone button is not shown at all. It also stays false
 * during the server render and first paint, so the markup matches.
 *
 * One utterance per press: the first final result is handed to `onResult`
 * and listening stops. Errors come back as i18n keys, like useLocate's.
 * "no-speech" and a deliberate stop are not errors - listening just ends.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// lib.dom has the result types but not the recognizer or its events.
interface RecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface RecognitionErrorEvent extends Event {
  readonly error: string;
}

interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceError = "voice.denied" | "voice.noMic" | "voice.failed";

export function useVoiceSearch(
  lang: "en" | "fr",
  onResult: (transcript: string) => void,
): {
  supported: boolean;
  listening: boolean;
  error: VoiceError | null;
  /** Start listening, or stop if already listening. */
  toggle: () => void;
} {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<VoiceError | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  useEffect(() => {
    setSupported(recognitionConstructor() !== null);
    return () => recognition.current?.abort();
  }, []);

  const toggle = useCallback(() => {
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    const Ctor = recognitionConstructor();
    if (Ctor === null) return;
    setError(null);

    const rec = new Ctor();
    rec.lang = lang === "fr" ? "fr-CA" : "en-CA";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const transcript = result[0]?.transcript.trim() ?? "";
        rec.stop();
        if (transcript !== "") resultRef.current(transcript);
        return;
      }
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") setError("voice.denied");
      else if (event.error === "audio-capture") setError("voice.noMic");
      else if (event.error !== "no-speech" && event.error !== "aborted") setError("voice.failed");
    };
    rec.onend = () => {
      if (recognition.current === rec) recognition.current = null;
      setListening(false);
    };

    recognition.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      // start() throws if a recognizer is somehow already running.
      recognition.current = null;
      setError("voice.failed");
    }
  }, [lang]);

  return { supported, listening, error, toggle };
}
