let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return ctx;
}

function beep(freq: number, durationMs: number, when = 0) {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.value = freq;
  osc.type = "sine";
  gain.gain.setValueAtTime(0.0001, ac.currentTime + when);
  gain.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + when + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + when + durationMs / 1000);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + when);
  osc.stop(ac.currentTime + when + durationMs / 1000 + 0.02);
}

export function playBeep(type: "success" | "error" | "ship") {
  if (type === "success") {
    beep(880, 90);
  } else if (type === "error") {
    beep(220, 120, 0);
    beep(220, 120, 0.18);
  } else {
    beep(660, 90, 0);
    beep(880, 90, 0.12);
    beep(1175, 140, 0.24);
  }
}