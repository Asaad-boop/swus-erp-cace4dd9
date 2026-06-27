let ctx: AudioContext | null = null;
function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}
function tone(freq: number, dur = 0.12, type: OscillatorType = "sine", gain = 0.15) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur);
}
export function beepSuccess() { tone(880, 0.1, "sine", 0.18); }
export function beepError() { tone(220, 0.25, "square", 0.18); }
export function beepShip() {
  tone(660, 0.08);
  setTimeout(() => tone(880, 0.08), 90);
  setTimeout(() => tone(1180, 0.16), 180);
}
export function beepNewOrder() {
  // Cheerful 4-note chime — "ding-da-ding-ding!"
  tone(880, 0.12, "triangle", 0.2);              // A5
  setTimeout(() => tone(1175, 0.12, "triangle", 0.2), 130);  // D6
  setTimeout(() => tone(1568, 0.14, "triangle", 0.22), 260); // G6
  setTimeout(() => tone(2093, 0.22, "triangle", 0.22), 410); // C7
}