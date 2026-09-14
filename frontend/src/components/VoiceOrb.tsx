"use client";

import { useEffect, useId, useRef } from "react";
import type { VoiceStatus } from "@/hooks/useVoice";
import styles from "./VoiceOrb.module.css";

const colors = ["#74b9ff", "#8ce7df", "#e0fff2", "#afcaff", "#f29eae"];

function wavePath(time: number, layer: number, amplitude: number) {
  const points = [];
  for (let x = 0; x <= 240; x += 2) {
    const position = (x - 120) / 120;
    const envelope = Math.pow(Math.max(0, 1 - position * position), 2.4);
    const wave = Math.sin(position * 5.6 + time + layer * .66)
      + .42 * Math.sin(position * 9.8 - time * .72 + layer * .45);
    const y = 120 + wave * amplitude * envelope + (layer - 2) * 3 * envelope;
    points.push(`${x === 0 ? "M" : "L"}${x},${y.toFixed(2)}`);
  }
  return points.join(" ");
}

export default function VoiceOrb({ status, muted }: { status: VoiceStatus; muted: boolean }) {
  const id = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const state = useRef({ status, muted });
  useEffect(() => { state.current = { status, muted }; }, [status, muted]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const paths = svg.current?.querySelectorAll<SVGPathElement>("[data-wave]");
    let frame = 0;
    let previous = 0;
    let phase = 0;
    let amplitude = 18;

    const draw = (now: number) => {
      const { status: current, muted: quiet } = state.current;
      const delta = previous ? Math.min((now - previous) / 1000, .05) : 0;
      previous = now;
      const target = quiet ? 5 : { idle: 18, connecting: 13, listening: 27, thinking: 16, speaking: 42 }[current];
      amplitude += (target - amplitude) * .065;
      phase += delta * (current === "speaking" ? 2.5 : current === "listening" ? 1.7 : .8);
      paths?.forEach(path => {
        const layer = Number(path.dataset.wave);
        path.setAttribute("d", wavePath(phase, layer, amplitude * (.9 + .1 * Math.sin(phase * .5))));
      });
      if (!reducedMotion.matches) frame = requestAnimationFrame(draw);
    };
    const resume = () => { cancelAnimationFrame(frame); previous = 0; draw(performance.now()); };
    reducedMotion.addEventListener("change", resume);
    const visibility = () => { if (document.hidden) cancelAnimationFrame(frame); else resume(); };
    document.addEventListener("visibilitychange", visibility);
    draw(performance.now());
    return () => { cancelAnimationFrame(frame); reducedMotion.removeEventListener("change", resume); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  return <div className={styles.stage} data-state={status} aria-hidden="true">
    <div className={styles.halo} />
    <div className={styles.orb}>
      <div className={styles.surface} />
      <svg ref={svg} className={styles.waves} viewBox="0 0 240 240" fill="none">
        <defs>
          <filter id={`${id}-glow`} x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="5" /></filter>
          <linearGradient id={`${id}-fade`}><stop offset="0" stopColor="white" stopOpacity="0"/><stop offset=".2" stopColor="white"/><stop offset=".8" stopColor="white"/><stop offset="1" stopColor="white" stopOpacity="0"/></linearGradient>
          <mask id={`${id}-mask`}><rect width="240" height="240" fill={`url(#${id}-fade)`}/></mask>
        </defs>
        <g mask={`url(#${id}-mask)`}>
          <g filter={`url(#${id}-glow)`} opacity=".65">{colors.map((color, i) => <path key={color} data-wave={i} d={wavePath(0, i, 18)} stroke={color} strokeWidth="5" />)}</g>
          {colors.map((color, i) => <path key={color} data-wave={i} d={wavePath(0, i, 18)} stroke={color} strokeWidth={i === 2 ? 1.8 : 1.2} opacity={i === 2 ? 1 : .75} />)}
        </g>
      </svg>
      <span className={styles.reflection} />
    </div>
    <span className={styles.caption} lang="ar" dir="rtl">هلا</span>
  </div>;
}
