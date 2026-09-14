"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking";
export type Transcript = { id: string; role: "user" | "assistant"; text: string };

export function useVoice(language: "ar" | "en", goal: string) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [playBlocked, setPlayBlocked] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState<Transcript[]>([]);
  const peer = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const connecting = useRef(false);
  const recoveryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    generation.current++;
    connecting.current = false;
    if (timeout.current) clearTimeout(timeout.current);
    if (recoveryTimeout.current) clearTimeout(recoveryTimeout.current);
    recoveryTimeout.current = null;
    setRecovering(false);
    controller.current?.abort();
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    const pc = peer.current;
    peer.current = null;
    channel.current?.close();
    channel.current = null;
    pc?.close();
    if (audio.current) { audio.current.onpause = null; audio.current.onplaying = null; audio.current.pause(); audio.current.srcObject = null; audio.current = null; }
    setStatus("idle");
    setMuted(false);
    setPlayBlocked(false);
  }, []);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    const leave = () => stop();
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [stop]);
  const active = status !== "idle" && status !== "connecting";
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setSeconds(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => {
    if (seconds >= 600 && active) { stop(); setError(language === "ar" ? "انتهت جلسة التجربة (١٠ دقائق). تقدر تبدأ جلسة جديدة." : "Your 10-minute demo has ended. You can start a new session."); }
  }, [seconds, active, stop, language]);

  const start = async () => {
    if (connecting.current || peer.current) return;
    connecting.current = true;
    const attempt = ++generation.current;
    setError(""); setTranscript([]); setSeconds(0); setStatus("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error(language === "ar" ? "الصوت يحتاج اتصال HTTPS أو localhost ومتصفح يدعم الميكروفون." : "Voice needs HTTPS or localhost and a browser with microphone support.");
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (generation.current !== attempt) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const pc = new RTCPeerConnection(); peer.current = pc;
      const player = new Audio(); player.autoplay = true; audio.current = player;
      const play = () => {
        if (generation.current !== attempt) return;
        void player.play().then(() => {
          if (generation.current === attempt) setPlayBlocked(false);
        }).catch(() => {
          if (generation.current === attempt) setPlayBlocked(true);
        });
      };
      player.onplaying = () => { if (generation.current === attempt) setPlayBlocked(false); };
      player.onpause = () => { if (generation.current === attempt) setPlayBlocked(true); };
      pc.ontrack = event => {
        if (generation.current !== attempt) return;
        // A modest playout buffer helps absorb jitter on mobile networks. Older
        // browsers keep their own adaptive buffering when this is unsupported.
        if ("jitterBufferTarget" in event.receiver) {
          try { event.receiver.jitterBufferTarget = 180; } catch { /* Browser default. */ }
        }
        player.srcObject = event.streams[0] || new MediaStream([event.track]);
        event.track.onunmute = play;
        play();
      };
      media.getTracks().forEach(track => pc.addTrack(track, media));
      const dc = pc.createDataChannel("oai-events"); channel.current = dc;
      const upsert = (id: string, role: "user" | "assistant", text: string, append = false) => {
        setTranscript(items => {
          const old = items.find(item => item.id === id);
          if (old) return items.map(item => item.id === id ? { ...item, text: append ? item.text + text : text } : item);
          return [...items, { id, role, text }];
        });
      };
      dc.onopen = () => {
        if (generation.current !== attempt) return;
        if (timeout.current) clearTimeout(timeout.current);
        connecting.current = false; setStatus("listening");
        dc.send(JSON.stringify({ type: "response.create" }));
      };
      let outputPlaying = false;
      dc.onmessage = message => {
        if (generation.current !== attempt) return;
        try {
          const event = JSON.parse(message.data);
          switch (event.type) {
            case "input_audio_buffer.speech_started": setStatus("listening"); break;
            case "input_audio_buffer.speech_stopped": setStatus("thinking"); break;
            case "response.created": setError(""); setStatus("thinking"); break;
            case "output_audio_buffer.started": outputPlaying = true; setStatus("speaking"); break;
            case "output_audio_buffer.stopped":
            case "output_audio_buffer.cleared": outputPlaying = false; setStatus("listening"); break;
            case "conversation.item.input_audio_transcription.completed": upsert(event.item_id, "user", event.transcript); break;
            case "response.output_audio_transcript.delta": upsert(event.item_id, "assistant", event.delta, true); break;
            case "response.output_audio_transcript.done": upsert(event.item_id, "assistant", event.transcript); break;
            case "response.done":
              // Generation can finish before buffered audio finishes playing.
              // Never stop the player or call a truncated reply "complete".
              if (event.response?.status === "incomplete") {
                if (!outputPlaying) setStatus("listening");
                setError(language === "ar" ? "الرد ما اكتمل. قل لي «كمّلي» وأكمل لك." : "The reply was cut short. Say “continue” to hear the rest.");
              }
              if (event.response?.status === "failed") { setError(language === "ar" ? "تعذّر الرد الآن. جرّب مرة ثانية." : "Hala could not respond. Please try again."); setStatus("listening"); }
              break;
            case "error": setError(language === "ar" ? "صار انقطاع في المحادثة. أنهِ الجلسة وجرّب مرة ثانية." : "The conversation encountered an error. End the session and reconnect."); break;
          }
        } catch { /* Ignore malformed non-application events. */ }
      };
      const disconnected = () => {
        if (generation.current !== attempt) return;
        stop(); setError(language === "ar" ? "انقطع الاتصال. تقدر تبدأ المحادثة من جديد." : "Connection lost. You can start a new conversation.");
      };
      dc.onclose = disconnected;
      pc.onconnectionstatechange = () => {
        if (generation.current !== attempt) return;
        if (pc.connectionState === "failed") { disconnected(); return; }
        if (pc.connectionState === "disconnected") {
          setRecovering(true);
          // ICE can recover from a brief Wi-Fi/mobile interruption by itself.
          // Repeated events must not extend the deadline indefinitely.
          recoveryTimeout.current ??= setTimeout(disconnected, 12000);
        } else if (pc.connectionState === "connected") {
          if (recoveryTimeout.current) clearTimeout(recoveryTimeout.current);
          recoveryTimeout.current = null;
          setRecovering(false);
          if (player.paused && player.srcObject) play();
        }
      };
      timeout.current = setTimeout(() => { if (generation.current === attempt) { stop(); setError(language === "ar" ? "الاتصال أخذ وقت طويل. جرّب مرة ثانية." : "Connection timed out. Please try again."); } }, 55000);
      await pc.setLocalDescription(await pc.createOffer());
      controller.current = new AbortController();
      const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.current.signal, body: JSON.stringify({ sdp: pc.localDescription?.sdp, language, goal }) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.detail || "Voice connection unavailable."); }
      const sdp = await response.text();
      if (generation.current !== attempt) return;
      await pc.setRemoteDescription({ type: "answer", sdp });
    } catch (err) {
      if (generation.current !== attempt) return;
      stop();
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      setError(denied ? (language === "ar" ? "اسمح للميكروفون من إعدادات المتصفح، أو خلّنا نتكلم بالكتابة." : "Allow microphone access in your browser, or chat with Hala by text.") : err instanceof Error ? err.message : "Unable to connect.");
    }
  };

  const toggleMute = () => { const value = !muted; stream.current?.getAudioTracks().forEach(track => { track.enabled = !value; }); setMuted(value); };
  const resumeAudio = () => {
    const attempt = generation.current;
    void audio.current?.play().then(() => {
      if (generation.current === attempt) setPlayBlocked(false);
    }).catch(() => {
      if (generation.current === attempt) setPlayBlocked(true);
    });
  };
  return { status, active, error, muted, playBlocked, recovering, seconds, transcript, start, stop, toggleMute, resumeAudio, clearError: () => setError("") };
}
