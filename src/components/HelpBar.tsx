
'use client';

import {
  useState,
  useEffect,
  useRef,
} from 'react';

import {
  Mic,
  Send,
  Terminal,
  Cpu,
  AlertTriangle,
  Loader2,
  MapPin,
  Navigation,
  X,
  RotateCcw,
  ShieldCheck,
  Clock3,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

type Coordinates = {
  lat: number;
  lng: number;
};

type ChatLog = {
  role: 'user' | 'ai' | 'error';
  text: string;
  brain?: string;
  circuitTripped?: string | null;
};

// ============================================================
// SESSION MANAGEMENT
// ============================================================

function getOrCreateSessionId(): string {
  const storageKey = 'chayra-session-id';

  try {
    const existing =
      window.sessionStorage.getItem(storageKey);

    if (
      typeof existing === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        existing,
      )
    ) {
      return existing;
    }
  } catch {
    // Session storage may be blocked by browser settings.
  }

  const sessionId = window.crypto.randomUUID();

  try {
    window.sessionStorage.setItem(
      storageKey,
      sessionId,
    );
  } catch {
    // A fresh UUID still isolates this request
    // when persistent tab storage is unavailable.
  }

  return sessionId;
}

// ============================================================
// VALIDATION
// ============================================================

function isValidCoordinates(
  value: any,
): value is Coordinates {
  return Boolean(
    value &&
    typeof value.lat === 'number' &&
    typeof value.lng === 'number' &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    value.lng >= -180 &&
    value.lng <= 180,
  );
}

function getApiErrorMessage(
  data: any,
  status: number,
): string {
  if (
    typeof data?.message === 'string' &&
    data.message.trim()
  ) {
    return data.message;
  }

  if (status === 401) {
    return 'Your session could not be authorized.';
  }

  if (status === 413) {
    return 'Your message is too long. Please shorten it.';
  }

  if (status >= 500) {
    return 'ChayRa server is temporarily unavailable. Please retry.';
  }

  return 'The request could not be completed.';
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function HelpBar() {

  const [input, setInput] =
    useState('');

  const [isProcessing, setIsProcessing] =
    useState(false);

  const [isListening, setIsListening] =
    useState(false);

  const [chatLog, setChatLog] =
    useState<ChatLog | null>(null);

  const [latency, setLatency] =
    useState<number | null>(null);

  const [showLocationPrompt, setShowLocationPrompt] =
    useState(false);

  const [userCoords, setUserCoords] =
    useState<Coordinates | null>(null);

  const [isPinDropMode, setIsPinDropMode] =
    useState(false);

  const recognitionRef =
    useRef<any>(null);

  // ==========================================================
  // 1. SYSTEM RESET EVENT
  // ==========================================================

  useEffect(() => {

    const handleSystemReset = () => {
      setUserCoords(null);
      setIsPinDropMode(false);
      setShowLocationPrompt(false);
      setLatency(null);
    };

    window.addEventListener(
      'SYSTEM_RESET',
      handleSystemReset,
    );

    return () => {
      window.removeEventListener(
        'SYSTEM_RESET',
        handleSystemReset,
      );
    };

  }, []);

  // ==========================================================
  // 2. VOICE RECOGNITION CLEANUP
  // ==========================================================

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Recognition may already be stopped.
      }
    };
  }, []);

  // ==========================================================
  // 3. MAP RESET
  // ==========================================================

  const triggerReset = () => {
    window.dispatchEvent(
      new CustomEvent('SYSTEM_RESET'),
    );
  };

  // ==========================================================
  // 4. VOICE INPUT
  // ==========================================================

  const toggleRecording = () => {

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      alert(
        'Voice input is not supported in this browser. Please use Chrome or Edge.',
      );

      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    try {
      const recognition =
        new SpeechRecognitionAPI();

      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        setChatLog(null);
      };

      recognition.onresult = (event: any) => {
        const transcript =
          event.results?.[0]?.[0]?.transcript?.trim() || '';

        if (transcript) {
          setInput(transcript);
        }
      };

      recognition.onerror = (event: any) => {

        console.error(
          '[Voice]: Speech recognition failed.',
          event,
        );

        setChatLog({
          role: 'error',
          text:
            `Voice recognition failed: ${event?.error || 'unknown error'}`,
        });
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;

      recognition.start();

    } catch (error) {

      console.error(
        '[Voice]: Could not initialize speech recognition.',
        error,
      );

      setIsListening(false);

      setChatLog({
        role: 'error',
        text: 'Voice input could not be initialized.',
      });
    }
  };

  // ==========================================================
  // 5. LOCATION ACQUISITION
  // ==========================================================

  const fetchLiveLocation = () => {

    if (!navigator.geolocation) {
      alert(
        'Geolocation is not supported by your browser.',
      );

      return;
    }

    navigator.geolocation.getCurrentPosition(

      (position) => {

        const coords: Coordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        if (!isValidCoordinates(coords)) {
          setChatLog({
            role: 'error',
            text: 'Browser returned invalid GPS coordinates.',
          });

          return;
        }

        setUserCoords(coords);

        setShowLocationPrompt(false);

        window.dispatchEvent(
          new CustomEvent(
            'UPDATE_USER_PIN',
            {
              detail: coords,
            },
          ),
        );

        const message = input.trim();

        if (message) {
          void executeRescueProtocol(
            coords,
            message,
          );
        }
      },

      (error) => {

        console.error(
          '[Location]: Geolocation failed.',
          error,
        );

        const messages: Record<number, string> = {
          1: 'Location permission denied. Please use Drop a Pin.',
          2: 'Your location could not be determined. Please use Drop a Pin.',
          3: 'Location request timed out. Please retry or use Drop a Pin.',
        };

        setChatLog({
          role: 'error',
          text:
            messages[error.code] ||
            'Location access failed. Please use Drop a Pin.',
        });
      },

      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 30_000,
      },
    );
  };

  // ==========================================================
  // 6. MANUAL MAP PIN
  // ==========================================================

  const enablePinDrop = () => {

    setShowLocationPrompt(false);

    setIsPinDropMode(true);

    window.dispatchEvent(
      new CustomEvent('ENABLE_PIN_DROP'),
    );

    setChatLog({
      role: 'ai',
      text:
        'TACTICAL MAP ACTIVE: Click anywhere on the map to drop your location pin.',
    });
  };

  // ==========================================================
  // 7. MAIN USER SUBMISSION
  // ==========================================================

  const handleInitialSend = () => {

    const message = input.trim();

    if (!message || isProcessing || isListening) {
      return;
    }

    if (!userCoords) {
      setShowLocationPrompt(true);
      return;
    }

    void executeRescueProtocol(
      userCoords,
      message,
    );
  };

  // ==========================================================
  // 8. CENTRAL SWARM API CONNECTION
  // ==========================================================

  async function executeRescueProtocol(
    coords: Coordinates,
    submittedMessage: string,
  ): Promise<void> {

    const message = submittedMessage.trim();

    if (!message || isProcessing) {
      return;
    }

    if (!isValidCoordinates(coords)) {
      setChatLog({
        role: 'error',
        text: 'Valid GPS coordinates are required.',
      });

      return;
    }

    setIsProcessing(true);

    setShowLocationPrompt(false);

    setIsPinDropMode(false);

    setLatency(null);

    setChatLog({
      role: 'user',
      text:
        `${message} [COORDS: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}]`,
    });

    const startTime = performance.now();

    try {

      // Each browser tab gets its own stable UUID.
      const sessionId =
        getOrCreateSessionId();

      const response = await fetch(
        '/api/swarm',
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            message,
            coords,
            sessionId,
          }),

          cache: 'no-store',
        },
      );

      let data: any;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          'Server returned an invalid response. Please retry.',
        );
      }

      const elapsed =
        Math.round(performance.now() - startTime);

      setLatency(elapsed);

      // ------------------------------------------------------
      // API FAILURE
      // ------------------------------------------------------

      if (!response.ok || data?.type === 'error') {
        throw new Error(
          getApiErrorMessage(
            data,
            response.status,
          ),
        );
      }

      // ------------------------------------------------------
      // MINDGUARD RESPONSE
      // ------------------------------------------------------

      if (data?.type === 'spam') {

        setChatLog({
          role: 'ai',
          text:
            `[MINDGUARD REJECTED]: ${data.message || 'Request rejected.'}`,
          brain: 'Basic Input Validation',
          circuitTripped: null,
        });

        setInput('');

        return;
      }

      if (data?.type !== 'success') {
        throw new Error(
          'Unexpected server response.',
        );
      }

      // ------------------------------------------------------
      // NORMALIZE BACKEND RESULTS
      // ------------------------------------------------------

      const medicalData =
        Array.isArray(data.medical)
          ? data.medical.filter(
              (item: unknown) =>
                typeof item === 'string',
            )
          : [
              'Medical triage is temporarily unavailable.',
            ];

      const navigationText =
        data.navigation?.text ||
        data.navigationText ||
        'Navigation result unavailable.';

      const navigationCoords =
        data.navigation?.destCoords ??
        data.destCoords ??
        null;

      const navigationIsReal =
        data.navigation?.isRealData === true ||
        data.isRealData === true;

      const vaultResult =
        typeof data.vault === 'string'
          ? data.vault
          : 'Identity standby. Rescue beacon was not generated.';

      const evidenceResult =
        data.evidence &&
        typeof data.evidence === 'object'
          ? data.evidence
          : null;

      const officialAlerts =
        Array.isArray(data.officialAlerts)
          ? data.officialAlerts
          : [];

      const outbreakReports =
        Array.isArray(data.outbreakReports)
          ? data.outbreakReports
          : [];

      const healthMetadata =
        data.healthMetadata &&
        typeof data.healthMetadata === 'object'
          ? data.healthMetadata
          : null;

      // ------------------------------------------------------
      // ACTION PANEL EVENT CONTRACT
      // ------------------------------------------------------

      const actionData = {

        // Request metadata
        requestId: data.requestId || null,
        sessionId: data.sessionId || sessionId,

        // Emergency / Radar
        threatLevel:
          data.threatLevel || 'UNKNOWN',

        intel:
          typeof data.radarIntel === 'string'
            ? data.radarIntel
            : 'No saved radar intelligence available.',

        // Navigation
        route: navigationText,

        destCoords: navigationCoords,

        isRealData: navigationIsReal,

        // Medical
        medical: medicalData,

        // Secure identity
        vault: vaultResult,

        // Verification
        evidence: evidenceResult,

        // Public Health
        healthAdvisory:
          data.healthAdvisory ||
          'No public-health advisory is currently available.',

        officialAlerts,

        outbreakReports,

        healthMetadata,

        // Resilience
        resiliencePrediction:
          data.resiliencePrediction ||
          'Resilience engine standing by.',
      };

      // ------------------------------------------------------
      // BROADCAST TO THE MAP AND ACTION PANEL
      // ------------------------------------------------------

      window.dispatchEvent(
        new CustomEvent(
          'SWARM_INTEL_UPDATE',
          {
            detail: actionData,
          },
        ),
      );

      // ------------------------------------------------------
      // SUCCESS STATE
      // ------------------------------------------------------

      setChatLog({
        role: 'ai',

        text:
          'ChayRa crisis fleet execution completed. Tactical intelligence has been delivered to the dashboard.',

        brain: 'Amazon Bedrock Central Brain',

        circuitTripped: null,
      });

      setInput('');

    } catch (error) {

      console.error(
        '[HelpBar]: Rescue protocol failed.',
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : 'Critical network failure.';

      setChatLog({
        role: 'error',
        text: message,
      });

      // Preserve the original input on failure
      // so the user can retry without retyping.

    } finally {

      setIsProcessing(false);
    }
  }

  // ==========================================================
  // 9. PIN DROPPED EVENT
  // ==========================================================

  useEffect(() => {

    const handlePinDropped = (event: Event) => {

      const customEvent =
        event as CustomEvent<Coordinates>;

      const coords = customEvent.detail;

      if (!isValidCoordinates(coords)) {
        setChatLog({
          role: 'error',
          text: 'The map returned invalid coordinates.',
        });

        setIsPinDropMode(false);

        return;
      }

      setUserCoords(coords);

      setIsPinDropMode(false);

      if (input.trim()) {
        void executeRescueProtocol(
          coords,
          input.trim(),
        );
      }
    };

    window.addEventListener(
      'PIN_DROPPED',
      handlePinDropped,
    );

    return () => {
      window.removeEventListener(
        'PIN_DROPPED',
        handlePinDropped,
      );
    };

  }, [input, isProcessing]);

  // ==========================================================
  // 10. UI
  // ==========================================================

  return (
    <div className="w-full flex flex-col relative z-10 bg-[#0a0714]/80 backdrop-blur-3xl border border-violet-500/10 rounded-[22px] p-2 gap-2 transition-all shadow-2xl">

      <div className="absolute inset-0 bg-gradient-to-t from-red-500/5 to-transparent rounded-3xl pointer-events-none"></div>

      {/* LOCATION BAR */}

      <div className="w-full flex items-center justify-between px-3 py-2 border-b border-white/5 relative z-10">

        {!userCoords && !isPinDropMode ? (

          <div className="flex flex-row w-full items-center justify-between gap-2">

            <span className="text-gray-400 font-mono text-xs flex items-center gap-2 group-hover:text-gray-300 transition-colors">
              <MapPin className="w-4 h-4 text-red-500 animate-bounce drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]" />
              LOCATION STANDBY
            </span>

            <div className="flex gap-2 w-auto justify-end">

              <button
                onClick={fetchLiveLocation}
                disabled={isProcessing}
                className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-400/50 rounded font-mono text-[10px] flex items-center gap-1 transition-all hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] disabled:opacity-50"
              >
                <Navigation className="w-3 h-3" />
                GPS
              </button>

              <button
                onClick={enablePinDrop}
                disabled={isProcessing}
                className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:border-purple-400/50 rounded font-mono text-[10px] flex items-center gap-1 transition-all hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] disabled:opacity-50"
              >
                <MapPin className="w-3 h-3" />
                DROP PIN
              </button>

            </div>
          </div>

        ) : isPinDropMode ? (

          <div className="flex flex-row w-full items-center justify-between gap-2">

            <span className="text-purple-400 font-mono text-xs animate-pulse flex items-center gap-2 drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]">
              <MapPin className="w-4 h-4" />
              AWAITING TACTICAL PIN...
            </span>

            <button
              onClick={triggerReset}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 hover:text-white rounded font-mono text-[10px] flex items-center gap-1 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] w-full md:w-auto justify-center mt-1 md:mt-0"
            >
              <X className="w-3 h-3" />
              CANCEL
            </button>

          </div>

        ) : (

          <div className="flex flex-row w-full items-center justify-between gap-2">

            <span className="text-emerald-400 font-mono text-xs flex items-center gap-2 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]">
              <MapPin className="w-4 h-4" />
              LOCKED: {userCoords?.lat.toFixed(3)}, {userCoords?.lng.toFixed(3)}
            </span>

            <button
              onClick={triggerReset}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-400/50 rounded font-mono text-[10px] flex items-center gap-1 transition-all hover:shadow-[0_0_15px_rgba(220,38,38,0.3)] w-full md:w-auto justify-center mt-1 md:mt-0 disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              RESET
            </button>

          </div>
        )}

      </div>

      {/* LOCATION PROMPT */}

      {showLocationPrompt && (

        <div className="absolute bottom-[110%] left-1/2 -translate-x-1/2 w-full max-w-md bg-black/95 backdrop-blur-3xl border border-red-500/50 p-6 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.4)] animate-in slide-in-from-bottom-4 z-50">

          <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 to-transparent rounded-2xl pointer-events-none"></div>

          <div className="flex justify-between items-start mb-4 relative z-10">

            <div>
              <h3 className="text-red-500 font-bold tracking-widest text-sm flex items-center gap-2 drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]">
                <MapPin className="w-4 h-4 animate-bounce" />
                LOCATION REQUIRED
              </h3>

              <p className="text-gray-400 text-xs font-mono mt-1">
                Select location method to proceed with rescue.
              </p>
            </div>

            <button
              onClick={() => setShowLocationPrompt(false)}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

          </div>

          <div className="flex flex-col gap-3 mt-4 relative z-10">

            <button
              onClick={fetchLiveLocation}
              className="flex items-center justify-between p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 hover:border-blue-400/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.2)] transition-all group"
            >
              <div className="flex items-center gap-3">
                <Navigation className="text-blue-500 w-5 h-5 group-hover:animate-pulse" />
                <span className="text-blue-100 font-mono text-sm">
                  USE LIVE GPS SIGNAL
                </span>
              </div>

              <span className="text-blue-500/50 text-xs font-mono">
                [FASTEST]
              </span>
            </button>

            <button
              onClick={enablePinDrop}
              className="flex items-center justify-between p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 hover:border-purple-400/50 hover:shadow-[0_0_20px_rgba(168,85,247,0.2)] transition-all group"
            >
              <div className="flex items-center gap-3">
                <MapPin className="text-purple-500 w-5 h-5 group-hover:animate-bounce" />

                <span className="text-purple-100 font-mono text-sm">
                  DROP TACTICAL PIN
                </span>
              </div>

              <span className="text-purple-500/50 text-xs font-mono">
                [MANUAL]
              </span>
            </button>

          </div>
        </div>
      )}

      {/* CHAT STATUS */}

      {chatLog && (

        <div className="w-full bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-xl relative overflow-hidden transition-all animate-in fade-in slide-in-from-bottom-2 mx-1 mt-1 shadow-[0_0_20px_rgba(16,185,129,0.05)] max-h-[160px] overflow-y-auto">

          <div className={`absolute top-0 left-0 w-[2px] h-full ${
            chatLog.role === 'error'
              ? 'bg-red-500 shadow-[0_0_15px_rgba(220,38,38,1)]'
              : 'bg-gradient-to-b from-transparent via-emerald-500 to-transparent shadow-[0_0_15px_rgba(16,185,129,1)]'
          }`}></div>

          {(isProcessing || chatLog.role === 'ai') && !isPinDropMode && (

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3 pb-3 border-b border-white/5 relative z-10">

              <div className="flex flex-col gap-1 p-2 bg-black/40 border border-emerald-500/20 rounded-lg shadow-[inset_0_0_15px_rgba(16,185,129,0.05)]">

                <span className="text-[9px] text-emerald-500 font-bold tracking-widest flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  SYSTEM BRAIN
                </span>

                <span className="text-[10px] font-mono text-gray-300 mt-1">
                  {isProcessing
                    ? 'REQUEST SENT — EXECUTING SWARM...'
                    : `Primary: ${chatLog.brain || 'Brain Gateway'}`}
                </span>

                {chatLog.circuitTripped && !isProcessing && (

                  <span className="text-[9px] font-mono text-amber-400 mt-1 flex items-start gap-1 bg-amber-500/10 p-1 rounded border border-amber-500/20">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    {chatLog.circuitTripped}
                  </span>

                )}

              </div>

              <div className="flex flex-col gap-1 p-2 bg-black/40 border border-blue-500/20 rounded-lg shadow-[inset_0_0_15px_rgba(59,130,246,0.05)] overflow-hidden">

                <span className="text-[9px] text-blue-500 font-bold tracking-widest flex items-center gap-1.5">

                  {isProcessing
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <ShieldCheck className="w-3 h-3" />}

                  {isProcessing
                    ? 'SERVER ORCHESTRATING'
                    : 'SWARM STATUS'}

                </span>

                <span className={`text-[10px] font-mono mt-1 ${
                  isProcessing
                    ? 'text-blue-300'
                    : 'text-emerald-400'
                }`}>
                  {isProcessing
                    ? 'Waiting for server response...'
                    : 'REQUEST COMPLETED'}
                </span>

              </div>

            </div>
          )}

          <div className="font-mono text-[11px] md:text-xs text-gray-300 leading-relaxed pl-2 relative z-10">

            {chatLog.role === 'user' ? (

              <span className="text-gray-500">
                &gt;&gt; TX:
                {' '}
                <span className="text-gray-200">
                  {chatLog.text}
                </span>
              </span>

            ) : chatLog.role === 'error' ? (

              <span className="text-red-400">
                {chatLog.text}
              </span>

            ) : (

              <span className={isPinDropMode
                ? 'text-purple-400 animate-pulse'
                : 'text-emerald-100/90'
              }>
                {chatLog.text}
              </span>

            )}

          </div>

        </div>
      )}

      {/* INPUT BAR */}

      <div
        className={`w-full rounded-2xl p-1.5 md:p-2 flex items-center gap-1.5 md:gap-3 transition-all duration-300 mt-1 ${
          isPinDropMode
            ? 'bg-[#0f0717] border border-purple-500/30 hover:border-purple-500/50'
            : 'bg-[#160505] border border-red-500/20 hover:border-red-500/40 shadow-[inset_0_0_15px_rgba(220,38,38,0.03)]'
        }`}
      >

        <div
          className={`p-2 md:p-3 rounded-xl border transition-all duration-300 flex-shrink-0 ${
            isPinDropMode
              ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
              : 'bg-red-500/10 border-red-500/20 text-red-500'
          }`}
        >
          {isProcessing
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Terminal className="w-4 h-4" />}
        </div>

        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            isPinDropMode
              ? 'AWAITING TACTICAL PIN DROP...'
              : isListening
                ? 'Listening to your voice...'
                : 'Describe your emergency or use voice command...'
          }
          className={`flex-1 bg-transparent border-none text-white focus:ring-0 text-sm md:text-lg font-mono outline-none transition-all pb-0.5 ${
            isListening
              ? 'placeholder-red-500/70'
              : isPinDropMode
                ? 'placeholder-purple-400/60'
                : 'placeholder-gray-500'
          }`}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              handleInitialSend();
            }
          }}
          disabled={
            isProcessing ||
            isListening ||
            isPinDropMode
          }
        />

        <div className="flex items-center gap-1 md:gap-2 pr-0 md:pr-1">

          <button
            onClick={toggleRecording}
            disabled={isProcessing || isPinDropMode}
            className={`p-2 md:p-3 rounded-xl transition-all border ${
              isListening
                ? 'bg-red-500/20 border-red-500/50 text-red-500 animate-pulse'
                : 'bg-transparent border-transparent hover:bg-white/5 text-gray-500 hover:text-white'
            }`}
          >
            <Mic className="w-4 h-4" />
          </button>

          <button
            onClick={handleInitialSend}
            disabled={
              isProcessing ||
              !input.trim() ||
              isPinDropMode
            }
            className={`px-1.5 py-2 md:px-6 md:py-3.5 max-w-[60px] md:max-w-none text-white rounded-xl font-bold tracking-[0.05em] md:tracking-[0.1em] text-[10px] md:text-[11px] transition-all flex items-center gap-1 md:gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 mr-0 min-w-0 ${
              isPinDropMode
                ? 'bg-purple-600 hover:bg-purple-500'
                : 'bg-[#b91c1c] hover:bg-[#dc2626] shadow-[0_0_15px_rgba(220,38,38,0.2)]'
            }`}
          >
            {isProcessing
              ? 'SYNCING...'
              : isPinDropMode
                ? 'WAIT'
                : (
                  <>
                    <span className="hidden md:inline">
                      INITIATE RESCUE
                    </span>

                    <span className="md:hidden">
                      Help
                    </span>
                  </>
                )}

            {!isProcessing && !isPinDropMode && (
              <Send className="w-3 h-3 md:w-3.5 md:h-3.5 ml-0 md:ml-1" />
            )}
          </button>

        </div>
      </div>

      {/* STATUS FOOTER */}

      <div className="hidden md:flex w-full items-center justify-between gap-3 text-[10px] font-mono text-gray-500 px-2 pt-2 mt-1 border-t border-white/5 whitespace-nowrap overflow-hidden">

        <div className="flex items-center gap-2 md:gap-4 shrink-0">

          {isProcessing ? (

            <span className="flex items-center gap-1.5 md:gap-2 text-amber-400 text-[8px] md:text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
              ORCHESTRATING...
            </span>

          ) : isListening ? (

            <span className="flex items-center gap-1.5 md:gap-2 text-red-500 animate-pulse text-[8px] md:text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
              INTERCEPTING...
            </span>

          ) : isPinDropMode ? (

            <span className="flex items-center gap-1.5 md:gap-2 text-purple-400 text-[8px] md:text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
              AWAITING COORDS
            </span>

          ) : (

            <span className="flex items-center gap-1.5 md:gap-2 text-emerald-500/80 text-[8px] md:text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
              CLIENT READY
            </span>

          )}

        </div>

        <div className="flex items-center gap-1 shrink-0 overflow-hidden">

          <span className="hidden lg:inline text-[10px] font-mono text-gray-400 tracking-widest">
            A PRODUCT OF
          </span>

          <span className="text-[9px] md:text-[11px] font-bold tracking-[0.1em] md:tracking-[0.15em] text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400 drop-shadow-[0_0_8px_rgba(139,92,246,0.4)] truncate">
            RANAJIT DHAR
          </span>

        </div>

        <div className="flex items-center gap-4 opacity-80 shrink-0">

          <span className="flex items-center gap-1.5 text-cyan-400/90">
            <Clock3 className="w-3.5 h-3.5" />

            <span className={latency ? 'text-cyan-300' : 'text-gray-600'}>
              {latency !== null ? `${latency}ms` : '--'}
            </span>
          </span>

          <span className="opacity-30">|</span>

          <span className="flex items-center gap-1.5">
            API:
            <span className="text-emerald-500">
              {isProcessing ? 'BUSY' : 'READY'}
            </span>
          </span>

        </div>

      </div>
    </div>
  );
}
