"use client";
import { useEffect, useState } from "react";

function fmt(ms: number) {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${d > 0 ? d + "d " : ""}${h}:${m}:${sec}`;
}

export function Countdown({ to, className }: { to: string; className?: string }) {
  const target = new Date(to).getTime();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(target - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return <span className={className} suppressHydrationWarning>{left === null ? "––:––:––" : fmt(left)}</span>;
}
