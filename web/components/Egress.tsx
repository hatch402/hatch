"use client";

import { useEffect, useRef } from "react";
import { coverage, compact } from "../lib/coverage";
import styles from "./Egress.module.css";

/**
 * The hero's moving part: a cross-section of the door.
 *
 * Collateral arrives from the left, wide. It meets a wall with one slit in it.
 * Almost everything stops. Once in a while something threads the gap and keeps
 * going.
 *
 * The slit is not sized for effect. Its height is `bridged_coverage_pct` of the
 * band the arrivals aim at, and arrivals are spread uniformly across that band,
 * so the share that gets through equals the share that gets through on chain —
 * one in ninety-one, today. Nothing here is tuned to look dramatic; if the
 * measurement improves tomorrow the slit widens by itself.
 *
 * That is the whole reason it is a canvas and not a video.
 */

const SPAWN_PER_SECOND = 17;
const MAX_STREAKS = 260;
const TRAIL_FADE = 0.085; // paper painted over the last frame; higher = shorter trails
const HEAT_BUCKETS = 34;

type Streak = {
  x: number;
  px: number;
  py: number;
  y0: number;
  yTarget: number;
  speed: number;
  passes: boolean;
};

function readPalette() {
  const style = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    paper: pick("--paper", "#FBFAF7"),
    amber: pick("--amber", "#EA8C00"),
    rule: pick("--rule-strong", "#C9C5B9"),
  };
}

/** Slow at the edges, quick through the middle — reads as being drawn in. */
function ease(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export default function Egress() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const palette = readPalette();
    const share = Math.max(coverage.bridged_coverage_pct, 0.05) / 100;

    let width = 0;
    let height = 0;
    let wallX = 0;
    let apertureTop = 0;
    let apertureHeight = 0;
    let slitY = 0;
    let slitHeight = 0;

    const streaks: Streak[] = [];
    const heat = new Float32Array(HEAT_BUCKETS);

    const measure = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      wallX = Math.round(width * 0.72);
      // The band arrivals aim at. The slit is this band times the measured
      // coverage, which is what makes the pass rate honest rather than chosen.
      apertureHeight = height * 0.62;
      apertureTop = (height - apertureHeight) / 2;
      slitHeight = Math.max(apertureHeight * share, 1.5);
      slitY = apertureTop + apertureHeight / 2 - slitHeight / 2;

      ctx.fillStyle = palette.paper;
      ctx.fillRect(0, 0, width, height);
    };

    const spawn = () => {
      if (streaks.length >= MAX_STREAKS) return;
      const y0 = Math.random() * height;
      const yTarget = apertureTop + Math.random() * apertureHeight;
      streaks.push({
        x: -Math.random() * 40,
        px: 0,
        py: y0,
        y0,
        yTarget,
        speed: 70 + Math.random() * 130,
        passes: yTarget >= slitY && yTarget <= slitY + slitHeight,
      });
    };

    const drawWall = () => {
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.rule;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(wallX + 0.5, 0);
      ctx.lineTo(wallX + 0.5, slitY);
      ctx.moveTo(wallX + 0.5, slitY + slitHeight);
      ctx.lineTo(wallX + 0.5, height);
      ctx.stroke();

      // Pressure against the closed face: where arrivals are landing, and how
      // recently. It decays, so a lull actually looks like a lull.
      const bucketHeight = height / HEAT_BUCKETS;
      for (let i = 0; i < HEAT_BUCKETS; i += 1) {
        if (heat[i] <= 0.01) continue;
        ctx.globalAlpha = Math.min(heat[i], 1) * 0.45;
        ctx.fillStyle = palette.amber;
        ctx.fillRect(wallX - 4, i * bucketHeight, 4, bucketHeight + 0.5);
      }

      // The slit. Small, bright, and the only opening in the picture.
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.amber;
      ctx.shadowColor = palette.amber;
      ctx.shadowBlur = 9;
      ctx.fillRect(wallX - 1, slitY, 3, slitHeight);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    };

    const step = (dtSeconds: number) => {
      ctx.globalAlpha = TRAIL_FADE;
      ctx.fillStyle = palette.paper;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;

      for (let i = 0; i < HEAT_BUCKETS; i += 1) heat[i] *= 0.965;

      ctx.lineCap = "round";
      for (let i = streaks.length - 1; i >= 0; i -= 1) {
        const s = streaks[i];
        s.px = s.x;
        s.py = s.x <= wallX ? s.y0 + (s.yTarget - s.y0) * ease(Math.max(s.x, 0) / wallX) : s.yTarget;
        s.x += s.speed * dtSeconds;
        const y = s.x <= wallX ? s.y0 + (s.yTarget - s.y0) * ease(Math.max(s.x, 0) / wallX) : s.yTarget;

        if (!s.passes && s.x >= wallX) {
          const bucket = Math.min(
            HEAT_BUCKETS - 1,
            Math.max(0, Math.floor((s.yTarget / height) * HEAT_BUCKETS)),
          );
          heat[bucket] = Math.min(heat[bucket] + 0.5, 1.6);
          streaks.splice(i, 1);
          continue;
        }
        if (s.x > width + 30) {
          streaks.splice(i, 1);
          continue;
        }

        const through = s.x > wallX;
        ctx.globalAlpha = through ? 0.9 : 0.3;
        ctx.lineWidth = through ? 2 : 1.3;
        ctx.strokeStyle = palette.amber;
        ctx.beginPath();
        ctx.moveTo(s.px, s.py);
        ctx.lineTo(s.x, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      drawWall();
    };

    /* A single frame, for anyone who has asked the system not to animate.
       Same geometry, same slit, one arrival already through. */
    const staticFrame = () => {
      ctx.fillStyle = palette.paper;
      ctx.fillRect(0, 0, width, height);
      ctx.lineCap = "round";
      for (let i = 0; i < 46; i += 1) {
        const y0 = (i / 46) * height + 4;
        const yTarget = apertureTop + ((i * 37) % 100) / 100 * apertureHeight;
        const endX = wallX - ((i * 53) % 260);
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = palette.amber;
        ctx.beginPath();
        ctx.moveTo(Math.max(endX - 90, 0), y0 + (yTarget - y0) * ease(Math.max(endX - 90, 0) / wallX));
        ctx.lineTo(endX, y0 + (yTarget - y0) * ease(endX / wallX));
        ctx.stroke();
      }
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wallX, slitY + slitHeight / 2);
      ctx.lineTo(width, slitY + slitHeight / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (let i = 0; i < HEAT_BUCKETS; i += 1) heat[i] = 0.7;
      drawWall();
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let frame = 0;
    let last = 0;
    let carry = 0;
    let running = false;
    // Both have to be true. Watching only visibility restarts the loop for a
    // band that is nowhere near the viewport; watching only intersection keeps
    // it running in a background tab. Both start optimistic — the observers
    // exist to switch the loop off, because an observer that never fires must
    // cost a few idle frames, not a permanently frozen hero.
    let onScreen = true;
    let awake = !document.hidden;

    const tick = (now: number) => {
      // A tab that was in the background for a minute must not spawn a minute
      // of arrivals in one frame.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      carry += dt * SPAWN_PER_SECOND;
      while (carry >= 1) {
        spawn();
        carry -= 1;
      }
      step(dt);
      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };
    const sync = () => {
      if (reduced.matches) return stop();
      if (onScreen && awake) {
        if (running) return;
        running = true;
        last = performance.now();
        frame = requestAnimationFrame(tick);
      } else {
        stop();
      }
    };

    const onMotionPreference = () => {
      stop();
      measure();
      if (reduced.matches) staticFrame();
      else sync();
    };

    measure();
    // Draw the door once, straight away. A band that is empty until the first
    // animation frame arrives reads as a broken image.
    if (reduced.matches) staticFrame();
    else {
      step(0);
      sync();
    }

    // Off screen or in a background tab, this should cost nothing.
    const seen = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { threshold: 0 },
    );
    seen.observe(wrap);

    const onVisibility = () => {
      awake = !document.hidden;
      sync();
    };
    const onResize = () => {
      measure();
      streaks.length = 0;
      if (reduced.matches) staticFrame();
      else step(0);
    };

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(wrap);
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", onMotionPreference);

    return () => {
      stop();
      seen.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onMotionPreference);
    };
  }, []);

  const c = coverage;

  return (
    <figure className={styles.figure}>
      <div className={styles.band} ref={wrapRef}>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
        <span className={`stamp ${styles.left}`}>{compact(c.bridged_collateral_usd)} wants out</span>
        <span className={`stamp ${styles.right}`}>{compact(c.bridged_exit_usd)} fits</span>
      </div>
      <figcaption className={styles.caption}>
        One arrival in {Math.round(c.bridged_ratio)} gets through. The gap is drawn at{" "}
        {c.bridged_coverage_pct.toFixed(2)}% — the measured width of the exit at block{" "}
        {c.pool_block}, not a number picked to look alarming.
      </figcaption>
    </figure>
  );
}
