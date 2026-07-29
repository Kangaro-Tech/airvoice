import { useEffect, useState, useRef } from 'react';
import kangaroLogo from '@/assets/kangaro-logo.png';

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [phase, setPhase] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  /* ── Phase timeline ── */
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200);   // logo slides in
    const t2 = setTimeout(() => setPhase(2), 800);   // lock + particles
    const t3 = setTimeout(() => setPhase(3), 1400);  // text + progress
    const t4 = setTimeout(() => setPhase(4), 3600);  // exit
    const t5 = setTimeout(() => onFinish(), 4200);
    return () => [t1, t2, t3, t4, t5].forEach(clearTimeout);
  }, [onFinish]);

  /* ── Progress bar ── */
  useEffect(() => {
    if (phase < 3) return;
    let cur = 0;
    const iv = setInterval(() => {
      cur += Math.random() * 7 + 3;
      if (cur >= 100) { cur = 100; clearInterval(iv); }
      setProgress(Math.min(cur, 100));
    }, 55);
    return () => clearInterval(iv);
  }, [phase]);

  /* ── Particle canvas (fire + sparks around lock) ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);

    interface P { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; hue: number; }
    const pts: P[] = [];

    const spawn = (cx: number, cy: number) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 0.5;
      const fire = Math.random() > 0.35;
      pts.push({
        x: cx + (Math.random() - 0.5) * 24,
        y: cy + (Math.random() - 0.5) * 24,
        vx: Math.cos(angle) * speed * (fire ? 0.3 : 1.1),
        vy: Math.sin(angle) * speed - (fire ? 2.8 : 1.0),
        life: 0,
        maxLife: Math.random() * 55 + 35,
        size: Math.random() * (fire ? 14 : 3) + (fire ? 5 : 1),
        hue: fire ? Math.random() * 55 + 5 : 255 + Math.random() * 60,
      });
    };

    let frame = 0;
    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2 + 10; // slightly below center (near lock)

      if (phase >= 2) for (let i = 0; i < 7; i++) spawn(cx, cy);

      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy; p.vy -= 0.055;
        p.life++;
        const t = p.life / p.maxLife;
        const alpha = (1 - t) * 0.88;
        p.size *= 0.972;
        if (p.size < 0.1 || p.life >= p.maxLife) { pts.splice(i, 1); continue; }

        ctx.save();
        ctx.globalAlpha = alpha;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        if (p.hue > 200) {
          g.addColorStop(0, `hsla(${p.hue},100%,85%,1)`);
          g.addColorStop(0.5, `hsla(${p.hue},100%,60%,0.6)`);
          g.addColorStop(1, `hsla(${p.hue},80%,40%,0)`);
        } else {
          g.addColorStop(0, `hsla(${p.hue},100%,95%,1)`);
          g.addColorStop(0.25, `hsla(${p.hue + 15},100%,70%,0.85)`);
          g.addColorStop(0.6, `hsla(${p.hue + 30},100%,45%,0.4)`);
          g.addColorStop(1, `hsla(${p.hue + 50},100%,20%,0)`);
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(p.size, 0.1), 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.restore();
      }

      // Central energy glow
      if (phase >= 2) {
        const pulse = Math.sin(frame * 0.08) * 0.2 + 0.8;
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70 * pulse);
        glow.addColorStop(0, 'rgba(168,85,247,0.3)');
        glow.addColorStop(0.4, 'rgba(59,130,246,0.18)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(cx, cy, 70 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      frame++;
      animFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(animFrameRef.current); window.removeEventListener('resize', resize); };
  }, [phase]);

  const vis = (n: number) => phase >= n;
  const exit = phase === 4;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'radial-gradient(ellipse at 50% 40%, #0d1235 0%, #06091a 70%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      transition: 'opacity 0.6s ease, transform 0.6s ease',
      opacity: exit ? 0 : 1,
      transform: exit ? 'scale(1.06)' : 'scale(1)',
      pointerEvents: exit ? 'none' : 'all',
    }}>

      {/* ── Ambient glows ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {[
          { top: '-15%', left: '-10%', w: '55%', h: '55%', c: 'rgba(120,40,255,0.2)', d: '0s' },
          { top: 'auto', left: 'auto', bottom: '-15%', right: '-5%', w: '50%', h: '50%', c: 'rgba(37,99,234,0.18)', d: '2.5s' },
          { top: '30%', left: '60%', w: '35%', h: '35%', c: 'rgba(6,182,212,0.1)', d: '1.2s' },
        ].map((g, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: (g as any).top, left: (g as any).left,
            bottom: (g as any).bottom, right: (g as any).right,
            width: g.w, height: g.h,
            background: `radial-gradient(circle, ${g.c} 0%, transparent 70%)`,
            animation: `spl-pulse 5s ease-in-out infinite ${g.d}`,
          }} />
        ))}
        {/* Grid */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }} />
      </div>

      {/* ── Corner brackets ── */}
      {[
        { top: 20, left: 20, borderTop: '2px solid rgba(168,85,247,0.35)', borderLeft: '2px solid rgba(168,85,247,0.35)' },
        { top: 20, right: 20, borderTop: '2px solid rgba(59,130,246,0.35)', borderRight: '2px solid rgba(59,130,246,0.35)' },
        { bottom: 20, left: 20, borderBottom: '2px solid rgba(168,85,247,0.35)', borderLeft: '2px solid rgba(168,85,247,0.35)' },
        { bottom: 20, right: 20, borderBottom: '2px solid rgba(59,130,246,0.35)', borderRight: '2px solid rgba(59,130,246,0.35)' },
      ].map((s, i) => (
        <div key={i} style={{ position: 'absolute', width: 50, height: 50, borderRadius: 2, ...s } as React.CSSProperties} />
      ))}

      {/* ── Particle canvas ── */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

      {/* ── Main content ── */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Logo pill — clean, no circle, just the logo on dark */}
        <div style={{
          transition: 'opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1)',
          opacity: vis(1) ? 1 : 0,
          transform: vis(1) ? 'translateY(0) scale(1)' : 'translateY(-30px) scale(0.8)',
          marginBottom: 28,
        }}>
          {/* Logo — transparent, floating cleanly */}
          <img
            src={kangaroLogo}
            alt="Kangaro-Tech"
            style={{
              width: 200, height: 'auto',
              objectFit: 'contain',
              filter: `
                drop-shadow(0 0 20px rgba(168,85,247,0.6))
                drop-shadow(0 0 50px rgba(59,130,246,0.35))
                drop-shadow(0 4px 12px rgba(0,0,0,0.6))
              `,
              mixBlendMode: 'lighten',
            }}
          />
        </div>

        {/* ═══════════════════════════════════════
            PREMIUM 3D LOCK — centre hero element
            ═══════════════════════════════════════ */}
        <div style={{
          position: 'relative',
          transition: 'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)',
          opacity: vis(2) ? 1 : 0,
          transform: vis(2) ? 'scale(1) translateY(0)' : 'scale(0.3) translateY(40px)',
        }}>

          {/* Outer spin ring — conic gradient */}
          <div style={{
            position: 'absolute', inset: -22,
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, rgba(168,85,247,0.6), rgba(59,130,246,0.6), rgba(6,182,212,0.4), rgba(168,85,247,0.6))',
            filter: 'blur(10px)',
            animation: 'spl-spin 3s linear infinite',
          }} />

          {/* Dashed ring */}
          <svg style={{
            position: 'absolute', inset: -18,
            width: 'calc(100% + 36px)', height: 'calc(100% + 36px)',
            animation: 'spl-spin-rev 5s linear infinite',
          }} viewBox="0 0 148 148">
            <circle cx="74" cy="74" r="70" fill="none"
              stroke="url(#lg1)" strokeWidth="1.5"
              strokeDasharray="10 7" strokeLinecap="round" />
            <defs>
              <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="50%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
          </svg>

          {/* Inner ring */}
          <div style={{
            position: 'absolute', inset: -8,
            borderRadius: '50%',
            border: '1px solid transparent',
            background: 'linear-gradient(#06091a,#06091a) padding-box, conic-gradient(from 220deg,#a855f7,#3b82f6,#06b6d4,#a855f7) border-box',
            animation: 'spl-spin 3s linear infinite',
          }} />

          {/* Lock body */}
          <div style={{
            width: 112, height: 112,
            borderRadius: '28px',
            background: 'linear-gradient(135deg, rgba(12,8,35,0.98), rgba(8,5,25,0.99))',
            border: '1px solid rgba(168,85,247,0.35)',
            boxShadow: `
              0 0 0 1px rgba(255,255,255,0.05),
              0 12px 40px rgba(0,0,0,0.7),
              0 0 70px rgba(168,85,247,0.55),
              0 0 130px rgba(59,130,246,0.28),
              inset 0 1px 0 rgba(255,255,255,0.09),
              inset 0 -1px 0 rgba(0,0,0,0.5)
            `,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
            animation: vis(2) ? 'spl-float 3s ease-in-out infinite' : 'none',
            overflow: 'hidden',
          }}>
            {/* Top glass reflection */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '45%',
              borderRadius: '28px 28px 0 0',
              background: 'linear-gradient(180deg, rgba(168,85,247,0.1) 0%, transparent 100%)',
            }} />

            {/* Modern SVG lock */}
            <svg width="62" height="68" viewBox="0 0 62 68" fill="none" style={{ position: 'relative', zIndex: 1 }}>
              <defs>
                {/* Shackle gradient — cold chrome-blue */}
                <linearGradient id="sk-g" x1="31" y1="0" x2="31" y2="32" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#c4b5fd" />
                  <stop offset="50%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
                {/* Body gradient */}
                <linearGradient id="bk-g" x1="2" y1="30" x2="60" y2="68" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#7c3aed" />
                  <stop offset="40%" stopColor="#4f46e5" />
                  <stop offset="100%" stopColor="#2563ea" />
                </linearGradient>
                {/* Body highlight */}
                <linearGradient id="bk-hl" x1="2" y1="30" x2="32" y2="46" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
                {/* Keyhole ring */}
                <linearGradient id="kh-g" x1="22" y1="44" x2="40" y2="62" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="rgba(0,0,0,0.6)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0.4)" />
                </linearGradient>
                <filter id="lk-glow2" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="1.8" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="kh-shadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="rgba(0,0,0,0.5)" />
                </filter>
              </defs>

              {/* ── Shackle (U-arch) — slim, rounded, chrome ── */}
              <path
                d="M18 32V18C18 10.268 24.268 4 31 4C37.732 4 44 10.268 44 18V32"
                stroke="url(#sk-g)" strokeWidth="5" strokeLinecap="round"
                fill="none" filter="url(#lk-glow2)"
              />
              {/* Shackle inner dark line for 3D depth */}
              <path
                d="M22.5 32V18C22.5 12.753 26.753 8.5 31 8.5C35.247 8.5 39.5 12.753 39.5 18V32"
                stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" strokeLinecap="round"
                fill="none"
              />

              {/* ── Body: bevelled rect ── */}
              <rect x="2" y="30" width="58" height="36" rx="9" fill="url(#bk-g)" />

              {/* Body face highlight */}
              <rect x="2" y="30" width="58" height="18" rx="9" fill="url(#bk-hl)" opacity="0.9" />

              {/* Bottom bevel shadow */}
              <rect x="2" y="56" width="58" height="10" rx="9" fill="rgba(0,0,0,0.25)" />

              {/* ── Side edge lines for 3D depth ── */}
              <line x1="2" y1="32" x2="2" y2="62" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <line x1="60" y1="32" x2="60" y2="62" stroke="rgba(0,0,0,0.4)" strokeWidth="1" />

              {/* ── Modern keyhole: ring + teardrop ── */}
              {/* Outer ring */}
              <circle cx="31" cy="46" r="8.5" fill="url(#kh-g)" filter="url(#kh-shadow)" />
              {/* Ring border glow */}
              <circle cx="31" cy="46" r="8.5" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              {/* Inner keyhole circle */}
              <circle cx="31" cy="44" r="4" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.75" />
              {/* Teardrop stem */}
              <path d="M28.5 47.5 Q31 53.5 33.5 47.5 Z" fill="rgba(255,255,255,0.08)" />
              <rect x="29" y="47" width="4" height="7" rx="2" fill="rgba(0,0,0,0.5)" />

              {/* ── Top-left glint dot ── */}
              <circle cx="10" cy="37" r="2.5" fill="rgba(255,255,255,0.2)" filter="url(#lk-glow2)" />

              {/* ── Horizontal line accents ── */}
              <line x1="8" y1="58" x2="24" y2="58" stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeLinecap="round" />
              <line x1="38" y1="58" x2="54" y2="58" stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeLinecap="round" />
            </svg>

            {/* Inner pulse ring */}
            <div style={{
              position: 'absolute', inset: 10, borderRadius: 20,
              border: '1px solid rgba(168,85,247,0.18)',
              animation: 'spl-lockglow 2.2s ease-in-out infinite',
            }} />
          </div>

          {/* Shadow below lock */}
          <div style={{
            margin: '10px auto 0', width: 80, height: 14,
            background: 'radial-gradient(ellipse, rgba(168,85,247,0.55) 0%, transparent 70%)',
            filter: 'blur(8px)',
            animation: vis(2) ? 'spl-shadow 3s ease-in-out infinite' : 'none',
          }} />
        </div>

        {/* ── Text block ── */}
        <div style={{
          marginTop: 28, textAlign: 'center',
          transition: 'opacity 0.55s ease 0.15s, transform 0.55s ease 0.15s',
          opacity: vis(3) ? 1 : 0,
          transform: vis(3) ? 'translateY(0)' : 'translateY(16px)',
        }}>
          {/* Tagline with "Staff Portal" pill */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10,
          }}>
            <div style={{
              width: 4, height: 4, borderRadius: '50%',
              background: '#a855f7',
              boxShadow: '0 0 8px #a855f7',
              animation: 'spl-blink 1.5s ease-in-out infinite',
            }} />
            <span style={{
              fontSize: 11, color: 'rgba(148,163,184,0.55)',
              letterSpacing: '0.22em', textTransform: 'uppercase',
              fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 600,
            }}>
              AirVoice · Defence Finance System
            </span>
            <div style={{
              width: 4, height: 4, borderRadius: '50%',
              background: '#3b82f6',
              boxShadow: '0 0 8px #3b82f6',
              animation: 'spl-blink 1.5s ease-in-out infinite 0.75s',
            }} />
          </div>

          {/* Divider */}
          <div style={{
            margin: '0 auto 14px', width: 180, height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.5), rgba(59,130,246,0.5), transparent)',
          }} />

          {/* Progress */}
          <div style={{ width: 220, margin: '0 auto' }}>
            <div style={{
              width: '100%', height: 3, borderRadius: 99,
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', width: `${progress}%`,
                background: 'linear-gradient(90deg, #a855f7, #6366f1, #3b82f6, #06b6d4)',
                borderRadius: 99,
                transition: 'width 0.1s linear',
                boxShadow: '0 0 10px rgba(168,85,247,0.8), 0 0 20px rgba(59,130,246,0.4)',
              }} />
            </div>
            <div style={{
              marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{
                fontSize: 9, color: 'rgba(148,163,184,0.4)',
                textTransform: 'uppercase', letterSpacing: '0.2em',
                fontFamily: 'Inter, system-ui, sans-serif',
                animation: 'spl-blink 1.2s ease-in-out infinite',
              }}>
                {progress < 100 ? 'Securing…' : '✓ Ready'}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, color: 'rgba(168,85,247,0.7)',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                {Math.round(progress)}%
              </span>
            </div>
          </div>

          {/* Footer Badges */}
          <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            {/* Developer highlight */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 18px',
              background: 'linear-gradient(90deg, rgba(59,130,246,0.15), rgba(168,85,247,0.15))',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 99,
              boxShadow: '0 0 16px rgba(59,130,246,0.2), inset 0 0 10px rgba(168,85,247,0.1)',
            }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 6px #3b82f6', animation: 'spl-blink 1.5s infinite' }} />
              <span style={{
                fontSize: 9.5, color: 'rgba(255,255,255,0.9)',
                letterSpacing: '0.18em', textTransform: 'uppercase',
                fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 600,
              }}>
                Developed by <span style={{ fontWeight: 800, background: 'linear-gradient(90deg, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Kangaro Tech Australia</span>
              </span>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#a855f7', boxShadow: '0 0 6px #a855f7', animation: 'spl-blink 1.5s infinite 0.75s' }} />
            </div>

            {/* CIMA badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 12px',
              background: 'rgba(168,85,247,0.05)',
              border: '1px solid rgba(168,85,247,0.15)',
              borderRadius: 99,
            }}>
              <span style={{
                fontSize: 8, color: 'rgba(168,85,247,0.5)',
                letterSpacing: '0.22em', textTransform: 'uppercase',
                fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 600,
              }}>
                A CIMA Group Company
              </span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spl-spin      { from{transform:rotate(0deg)}  to{transform:rotate(360deg)} }
        @keyframes spl-spin-rev  { from{transform:rotate(0deg)}  to{transform:rotate(-360deg)} }
        @keyframes spl-float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
        @keyframes spl-shadow    { 0%,100%{opacity:.7;transform:scale(1)} 50%{opacity:.3;transform:scale(0.78)} }
        @keyframes spl-pulse     { 0%,100%{opacity:.85} 50%{opacity:.35} }
        @keyframes spl-blink     { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes spl-lockglow  {
          0%,100%{ box-shadow:0 0 0 0 rgba(168,85,247,0.0), inset 0 0 8px rgba(168,85,247,0.05) }
          50%    { box-shadow:0 0 0 6px rgba(168,85,247,0.15), inset 0 0 16px rgba(168,85,247,0.12) }
        }
      `}</style>
    </div>
  );
}
