// The sound: Web Audio, started on the first input. An engine note pitched by speed,
// noise bursts for the crashes, short tones for pickups and menus; M mutes.

import { tune } from './config';
import { vr } from './game/random';
import { audioContext } from './hook';
import type { Loose } from './game/types';

let audio: Loose = null, muted = false;
/** Starts the sound on the first input (browsers need one), and resumes it. */
export function startAudio() {
  if (!audio) {
    const ac = audioContext(); // a check may inject one
    const out = ac.createGain(); out.gain.value = muted ? 0 : tune.volume;
    out.connect(ac.destination); audio = { ac, out };
    try { // engine: a sawtooth through a low-pass, pitched by speed
      const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = 50; f.type = 'lowpass'; f.frequency.value = 700; g.gain.value = 0;
      o.connect(f).connect(g).connect(out); o.start();
      audio.engine = { o, g };
      const len = ac.sampleRate * 1, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = vr() * 2 - 1;
      audio.noise = buf;
    } catch (e) { /* no engine sound */ }
  }
  if (audio.ac.state === 'suspended') audio.ac.resume();
}
/** Mutes or unmutes everything. */
export function setMuted(m: Loose) { muted = m; if (audio) audio.out.gain.value = m ? 0 : tune.volume; }
addEventListener('tune', () => setMuted(muted));
/** A short tone: frequency in Hz, duration in s, a delay in s. */
export function tone(freq: Loose, dur: Loose, type: Loose = 'square', vol: Loose = 0.3, when: Loose = 0) {
  if (!audio || muted) return;
  const t = audio.ac.currentTime + when, o = audio.ac.createOscillator(), g = audio.ac.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(audio.out); o.start(t); o.stop(t + dur);
}
let lastCrashSound = 0;
/** A crash: a noise burst, louder and lower for a bigger power (0..1). */
export function crunch(power: Loose, low: Loose = false) { // a noise burst, louder and lower for bigger hits
  if (!audio || muted || !audio.noise) return;
  const now = audio.ac.currentTime; if (now - lastCrashSound < 0.05) return; lastCrashSound = now;
  const s = audio.ac.createBufferSource(), f = audio.ac.createBiquadFilter(), g = audio.ac.createGain();
  s.buffer = audio.noise; f.type = 'lowpass'; f.frequency.value = low ? 300 : 900 + Math.min(power, 1) * 1800;
  const v = Math.min(0.9, 0.15 + power * 0.6), d = low ? 1.4 : 0.25 + power * 0.4;
  g.gain.setValueAtTime(v, now); g.gain.exponentialRampToValueAtTime(0.001, now + d);
  s.connect(f).connect(g).connect(audio.out); s.start(now, vr() * 0.5); s.stop(now + d);
  tone(low ? 50 : 90 + vr() * 60, d * 0.7, 'triangle', v * 0.5);
}
/** The engine note follows the speed in px/s; off when the car is out of control. */
export function engineSound(speed: Loose, on: Loose) {
  if (!audio || !audio.engine) return;
  const t = audio.ac.currentTime;
  audio.engine.o.frequency.setTargetAtTime(45 + speed * 0.2, t, 0.05);
  audio.engine.g.gain.setTargetAtTime(on && !muted ? 0.07 : 0, t, 0.1);
}

/** True while the sound is muted. */
export function isMuted(): boolean { return muted; }
