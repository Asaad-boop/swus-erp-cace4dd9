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
/**
 * Premium "kaching + crystal chime" — Apple/Stripe style success cue.
 * Layered bell partials + soft cash-register sparkle + warm sub.
 * Tuned in C major (C–E–G–C) with shimmer on top so it feels rewarding,
 * not noisy. Designed to trigger dopamine without being startling.
 */
export function beepNewOrder() {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime;

  // master bus with gentle compression-feel via gain shaping
  const master = a.createGain();
  master.gain.value = 0.9;
  master.connect(a.destination);

  // subtle stereo width using a delay on a second channel
  const widen = a.createDelay();
  widen.delayTime.value = 0.012;
  const wideGain = a.createGain();
  wideGain.gain.value = 0.35;
  widen.connect(wideGain).connect(master);

  // bell partial: fundamental + harmonics with exponential decay
  const bell = (freq: number, when: number, dur: number, level: number) => {
    const partials = [
      { mult: 1,    gain: 1.0,  type: "sine" as OscillatorType },
      { mult: 2.0,  gain: 0.45, type: "sine" as OscillatorType },
      { mult: 3.01, gain: 0.22, type: "sine" as OscillatorType },
      { mult: 4.2,  gain: 0.12, type: "sine" as OscillatorType }, // inharmonic shimmer
    ];
    const start = t0 + when;
    partials.forEach((p) => {
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = p.type;
      osc.frequency.value = freq * p.mult;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(level * p.gain, start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g);
      g.connect(master);
      g.connect(widen);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    });
  };

  // warm sub thump — gives the "ka" of ka-ching
  const thump = (when: number) => {
    const start = t0 + when;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, start);
    osc.frequency.exponentialRampToValueAtTime(70, start + 0.18);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.35, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
    osc.connect(g).connect(master);
    osc.start(start);
    osc.stop(start + 0.3);
  };

  // sparkle: short filtered noise burst (the "ching" shimmer)
  const sparkle = (when: number) => {
    const start = t0 + when;
    const len = 0.4;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 2.5);
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    const hp = a.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 4500;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + len);
    src.connect(hp).connect(g).connect(master);
    src.start(start);
    src.stop(start + len);
  };

  // Composition — C major arpeggio resolving up an octave
  // C5 523.25 · E5 659.25 · G5 783.99 · C6 1046.50 · (E6 sparkle 1318.51)
  thump(0);
  bell(523.25, 0.00, 1.6, 0.22);   // C5 — root
  bell(659.25, 0.09, 1.5, 0.20);   // E5
  bell(783.99, 0.18, 1.6, 0.20);   // G5
  sparkle(0.20);
  bell(1046.50, 0.30, 1.8, 0.24);  // C6 — resolution
  bell(1318.51, 0.42, 1.6, 0.14);  // E6 shimmer
  bell(1567.98, 0.55, 1.4, 0.10);  // G6 air
}