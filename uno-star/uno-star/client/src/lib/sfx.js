/** Petits sons synthetiques (WebAudio) — aucun fichier audio, tout est genere. */

let ctx = null;
let muted = false;

function ensure() {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(v) {
  muted = !!v;
}
export function isMuted() {
  return muted;
}

function tone(freq, duration, type = 'sine', gain = 0.08, delay = 0) {
  const ac = ensure();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export const sfx = {
  select: () => tone(660, 0.06, 'triangle', 0.04),
  play: () => {
    tone(520, 0.09, 'sine', 0.07);
    tone(780, 0.12, 'sine', 0.05, 0.05);
  },
  draw: () => tone(320, 0.1, 'sine', 0.05),
  penalty: () => {
    tone(180, 0.18, 'sawtooth', 0.06);
    tone(140, 0.22, 'sawtooth', 0.05, 0.08);
  },
  uno: () => {
    tone(660, 0.1, 'square', 0.05);
    tone(880, 0.14, 'square', 0.05, 0.09);
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.06, i * 0.12));
  },
  error: () => tone(200, 0.16, 'square', 0.05),
};
