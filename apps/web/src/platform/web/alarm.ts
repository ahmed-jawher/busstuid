import type { AlarmPort } from '../types';

// A two-tone siren synthesised with Web Audio: nothing to download, works offline (PLAN §3.5).
// Browsers only allow audio after a user gesture; the driver has always tapped by the time this
// can trigger. Native builds (phase 6) use a bundled sound on a high-priority channel instead.

export function createWebAlarm(): AlarmPort {
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const beep = () => {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const [i, freq] of [880, 660].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.4, now + i * 0.35 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.35 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.35);
      osc.stop(now + i * 0.35 + 0.32);
    }
    if ('vibrate' in navigator) navigator.vibrate([300, 100, 300]);
  };

  return {
    get active() {
      return timer !== null;
    },
    start() {
      if (timer) return;
      try {
        ctx ??= new AudioContext();
        void ctx.resume();
      } catch {
        ctx = null;
      }
      beep();
      timer = setInterval(beep, 900);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
