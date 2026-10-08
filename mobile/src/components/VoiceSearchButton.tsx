/**
 * The microphone next to the search box: speech to text, on the phone.
 *
 * Recognition runs through the OS recogniser (SFSpeechRecognizer on iOS,
 * SpeechRecognizer on Android) and asks for on-device recognition wherever the
 * phone supports it, so what someone says is not shipped to a third party and
 * costs nothing per query. The transcript goes into the same smart-search path
 * as typed text; this component only turns speech into a string.
 *
 * expo-speech-recognition is a native module that Expo Go does not contain.
 * Importing it there throws at load time, which would take the whole Search
 * screen down with it, so the package is required behind a guard and the
 * button simply is not rendered when the module is missing. Voice search needs
 * a development build.
 */

import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { requireOptionalNativeModule } from "expo";

import Button from "./Button";
import { TOUCH_TARGET } from "../theme";

type SpeechPackage = typeof import("expo-speech-recognition");

/**
 * Loaded once, at import. The native-module probe comes first because it
 * returns null instead of throwing; the try/catch covers anything else a
 * half-linked build can do. Web has no native module to probe - the package's
 * web build wraps the browser's SpeechRecognition instead.
 */
const speech: SpeechPackage | null = (() => {
  try {
    if (
      Platform.OS !== "web" &&
      requireOptionalNativeModule("ExpoSpeechRecognition") === null
    ) {
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-speech-recognition") as SpeechPackage;
  } catch {
    return null;
  }
})();

interface Props {
  /** BCP-47 tag for the recogniser, e.g. "en-CA" or "fr-CA". */
  lang: string;
  /** Interim words while the person is still talking. */
  onPartial: (text: string) => void;
  /** The finished transcript, once, when listening stops. Never empty. */
  onFinal: (text: string) => void;
  onListeningChange: (listening: boolean) => void;
  /** A short sentence for the screen to show, or null to clear it. */
  onMessage: (message: string | null) => void;
}

/** Renders nothing where speech recognition is not available. */
export default function VoiceSearchButton(props: Props): React.JSX.Element | null {
  if (speech === null) return null;
  return <Microphone pkg={speech} {...props} />;
}

function Microphone({
  pkg,
  lang,
  onPartial,
  onFinal,
  onListeningChange,
  onMessage,
}: Props & { pkg: SpeechPackage }): React.JSX.Element | null {
  const { ExpoSpeechRecognitionModule: Speech, useSpeechRecognitionEvent } = pkg;

  const [listening, setListening] = useState(false);
  // A build can include the module on a phone with no recogniser at all - an
  // Android without Google's speech service, for one. Checked once.
  const [available] = useState(() => {
    try {
      return Speech.isRecognitionAvailable();
    } catch {
      return false;
    }
  });
  // The latest transcript, handed over on "end" rather than on each final
  // result, so one utterance becomes exactly one search.
  const transcript = useRef("");
  const listeningRef = useRef(false);

  const setBoth = (value: boolean): void => {
    listeningRef.current = value;
    setListening(value);
    onListeningChange(value);
  };

  useSpeechRecognitionEvent("start", () => setBoth(true));

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript ?? "";
    transcript.current = text;
    if (!event.isFinal) onPartial(text);
  });

  useSpeechRecognitionEvent("error", (event) => {
    transcript.current = "";
    onMessage(messageFor(event.error));
  });

  useSpeechRecognitionEvent("end", () => {
    setBoth(false);
    const text = transcript.current.trim();
    transcript.current = "";
    if (text !== "") onFinal(text);
  });

  // Leaving the screen mid-sentence should not leave the microphone open.
  useEffect(
    () => () => {
      if (listeningRef.current) {
        try {
          Speech.abort();
        } catch {
          // Already stopped.
        }
      }
    },
    [Speech],
  );

  const toggle = async (): Promise<void> => {
    if (listening) {
      Speech.stop();
      return;
    }
    onMessage(null);
    try {
      // Asks on first use only; after that it resolves with the stored answer.
      const permission = await Speech.requestPermissionsAsync();
      if (!permission.granted) {
        onMessage(
          permission.canAskAgain
            ? "Voice search needs the microphone. Allow it and try again, or type instead."
            : "Microphone access is blocked for this app. Turn it on in Settings, or type instead.",
        );
        return;
      }
      transcript.current = "";
      Speech.start({
        lang,
        interimResults: true,
        continuous: false,
        // Private and free where the phone can do it; the OS service otherwise.
        requiresOnDeviceRecognition: Speech.supportsOnDeviceRecognition(),
      });
    } catch {
      onMessage("Voice search could not start. Try again, or type instead.");
    }
  };

  if (!available) return null;

  return (
    <Button
      variant={listening ? "primary" : "secondary"}
      onPress={() => void toggle()}
      style={styles.mic}
      accessibilityLabel={listening ? "Stop listening" : "Search by voice"}
    >
      {listening ? "■" : "🎙️"}
    </Button>
  );
}

/** "aborted" is us stopping it; everything else gets one plain sentence. */
function messageFor(code: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "no-speech":
    case "speech-timeout":
      return "Didn't catch that. Tap the microphone and try again.";
    case "not-allowed":
    case "service-not-allowed":
      return "Voice search is not allowed on this device. Check microphone and speech recognition in Settings.";
    case "language-not-supported":
      return "Voice search does not support this language on this phone yet. Type instead.";
    case "network":
      return "Voice search needs a connection on this phone. Type instead.";
    default:
      return "Voice search didn't work. Try again, or type instead.";
  }
}

const styles = StyleSheet.create({
  // Square, the same height as the field beside it.
  mic: { width: TOUCH_TARGET, paddingHorizontal: 0 },
});
