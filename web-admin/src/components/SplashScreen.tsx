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

  /* ── Particle canvas (Cosmic Stardust Ring) ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);

    interface Particle {
      angle: number; radius: number;
      targetRadius: number;
      speed: number; size: number; alpha: number;
      color: string;
      wobbleSpeed: number;
    }
    const particles: Particle[] = [];
    const numParticles = 4000;

    for (let i = 0; i < numParticles; i++) {
      // Gaussian distribution for ring
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
      
      let targetRadius = 120 + num * 40; 
      if (targetRadius < 65) targetRadius = 65 + Math.random() * 20; // Keep the dark hole empty
      
      const isBlue = Math.random() > 0.6;
      const isWhite = Math.random() > 0.8;
      
      let color = 'rgba(140, 180, 220, ';
      if (isWhite) color = 'rgba(230, 240, 255, ';
      else if (isBlue) color = 'rgba(80, 140, 210, ';

      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: canvas.width ? Math.random() * Math.max(canvas.width, canvas.height) * 1.5 : 1000, 
        targetRadius: targetRadius,
        speed: (0.001 + Math.random() * 0.003) * (Math.random() > 0.2 ? 1 : -0.5), // Mostly one direction
        size: Math.random() * 1.4 + 0.3,
        alpha: Math.random() * 0.7 + 0.1,
        color: color,
        wobbleSpeed: Math.random() * 0.05 + 0.01,
      });
    }

    let frame = 0;
    const loop = () => {
      // Dark trail effect for smooth movement
      ctx.fillStyle = 'rgba(4, 7, 18, 0.2)'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      ctx.save();
      ctx.translate(cx, cy);
      // Slight 3D tilt
      ctx.scale(1, 0.8); 

      // Draw particles
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < numParticles; i++) {
        const p = particles[i];
        
        // Pull particles in when phase >= 1
        if (phase >= 1) {
          const diff = p.targetRadius - p.radius;
          p.radius += diff * (0.01 + Math.random() * 0.02);
        }

        p.angle += p.speed;
        
        // Add a slight wobble to radius for organic movement
        const currentRadius = p.radius + Math.sin(frame * p.wobbleSpeed + p.angle) * 3;
        
        const x = Math.cos(p.angle) * currentRadius;
        const y = Math.sin(p.angle) * currentRadius;

        ctx.fillStyle = p.color + p.alpha + ')';
        ctx.beginPath();
        // Skip drawing if completely offscreen to save performance
        if (Math.abs(x) > canvas.width || Math.abs(y) > canvas.height) continue;
        
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Ensure the black hole in the center stays dark
      ctx.globalCompositeOperation = 'source-over';
      const hole = ctx.createRadialGradient(cx, cy, 30, cx, cy, 90);
      hole.addColorStop(0, 'rgba(4, 7, 18, 1)');
      hole.addColorStop(0.5, 'rgba(4, 7, 18, 0.8)');
      hole.addColorStop(1, 'rgba(4, 7, 18, 0)');
      ctx.fillStyle = hole;
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.fill();

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

        {/* ═══════════════════════════════════════
            CENTRAL LOGO — Premium 3D Card
            ═══════════════════════════════════════ */}
        <div style={{
          position: 'relative',
          transition: 'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)',
          opacity: vis(1) ? 1 : 0,
          transform: vis(1) ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 180, // Occupy central space
        }}>
          
          {/* 3D Premium Logo Container */}
          <div style={{
            position: 'relative',
            borderRadius: '32px', // Modern round corners
            background: 'transparent', // Removed white background
            padding: '4px', // Subtle inner padding
           
            animation: vis(1) ? 'spl-float 3s ease-in-out infinite' : 'none',
            overflow: 'hidden', // Clips image corners
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <img
              src={kangaroLogo}
              alt="Kangaro-Tech"
              style={{
                width: 220, height: 'auto',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>

          {/* Subtle shadow below logo for 3D depth */}
          <div style={{
            position: 'absolute',
            bottom: -25,
            width: 140, height: 14,
            background: 'radial-gradient(ellipse, rgba(168,85,247,0.6) 0%, transparent 70%)',
            filter: 'blur(8px)',
            animation: vis(1) ? 'spl-shadow 3s ease-in-out infinite' : 'none',
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
