import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Smartphone, ExternalLink } from 'lucide-react';

// ─── Language helper ───────────────────────────────────────────────────────
type Lang = 'en' | 'si' | 'ta';
const T = (lang: Lang, en: string, si: string, ta: string) =>
  lang === 'si' ? si : lang === 'ta' ? ta : en;

// ─── Mock data for preview (real API data shown where available) ────────────
const RANKS = [
  'Private','Lance Corporal','Corporal','Sergeant','Staff Sergeant',
  'Warrant Officer II','Warrant Officer I','Second Lieutenant','Lieutenant',
  'Captain','Major','Lieutenant Colonel','Colonel','Brigadier','Major General',
];

const BRANCHES: Record<string, { label: string; regiments: string[] }> = {
  army: { label: 'Sri Lanka Army', regiments: ['1 GW Bn','2 GW Bn','Gajaba Regiment','Vijayabahu Infantry','Gemunu Watch','Sri Lanka Light Infantry','1 ESR','2 ESR','3 ESR','SLEME'] },
  navy: { label: 'Sri Lanka Navy', regiments: ['Western Naval Command','Eastern Naval Command','Northern Naval Command','Southern Naval Command','Fleet Command'] },
  air_force: { label: 'Sri Lanka Air Force', regiments: ['No.1 Sqn','No.2 Sqn','No.3 Sqn','No.4 Sqn','Air Defence','Transport Wing','SLAF Katunayake'] },
};

const DEMO_APPS = [
  { id: 'AV-2025-00229', phone: 'AIRVOICE Pro Z9 Plus', monthly: 4750, installments: 18, paid: 11, status: 'active', missed: 0 },
  { id: 'AV-2025-00131', phone: 'AIRVOICE Nova X7', monthly: 3200, installments: 12, paid: 8, status: 'active', missed: 1 },
];

const DEMO_PHONES = [
  { id: 'm1', name: 'AIRVOICE Pro Z9 Plus', desc: 'Flagship · 256GB · Titanium', price: 145000, plans: [{ months: 12, monthly: 13750 }, { months: 18, monthly: 9750 }, { months: 24, monthly: 7800 }] },
  { id: 'm2', name: 'AIRVOICE Nova X7', desc: 'Mid-range · 128GB · Midnight Black', price: 78000, plans: [{ months: 6, monthly: 14200 }, { months: 12, monthly: 7500 }, { months: 18, monthly: 5300 }] },
  { id: 'm3', name: 'AIRVOICE Lite 5G', desc: 'Budget · 64GB · Ocean Blue', price: 45000, plans: [{ months: 6, monthly: 8200 }, { months: 12, monthly: 4300 }] },
];

// ─── Screens ────────────────────────────────────────────────────────────────
type Screen = 'landing' | 'register' | 'login' | 'home';
type HomeTab = 'home' | 'order' | 'track' | 'profile';

// ─── Pin Pad ─────────────────────────────────────────────────────────────────
function PinPad({ onSuccess, onOtp }: { onSuccess: () => void; onOtp: () => void }) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [error, setError] = useState(false);

  const press = (k: string) => {
    if (k === '⌫') {
      setDigits(prev => {
        const n = [...prev];
        const last = [...n].reverse().findIndex(v => v !== '');
        if (last >= 0) n[3 - last] = '';
        return n;
      });
      setError(false);
    } else {
      setDigits(prev => {
        const n = [...prev];
        const next = n.findIndex(v => v === '');
        if (next === -1) return n;
        n[next] = k;
        if (next === 3) {
          setTimeout(() => {
            if (n.join('') === '1234') { onSuccess(); }
            else { setError(true); setDigits(['', '', '', '']); }
          }, 200);
        }
        return n;
      });
    }
  };

  return (
    <div className="flex flex-col items-center">
      {/* Dots */}
      <div className="flex gap-3 mb-5">
        {digits.map((d, i) => (
          <div key={i} style={{
            width: 52, height: 52, borderRadius: 12,
            border: `2px solid ${d ? '#1a3a6b' : '#ddd'}`,
            background: d ? '#1a3a6b' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, color: '#fff', transition: 'all .2s',
          }}>
            {d ? '•' : ''}
          </div>
        ))}
      </div>
      {error && <p className="text-red-500 text-sm font-bold mb-3">Incorrect PIN. Try again.</p>}
      <p className="text-base-muted text-xs mb-4">Demo PIN: <b>1234</b></p>
      {/* Numpad */}
      <div className="grid grid-cols-3 gap-2.5" style={{ maxWidth: 240 }}>
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
          k === '' ? <div key={i} /> :
          <button key={i} onClick={() => press(k)} style={{
            height: 52, borderRadius: 12, border: '1px solid #e2e8f0',
            fontSize: 20, fontWeight: 700, background: '#fff', cursor: 'pointer',
            color: k === '⌫' ? '#e74c3c' : '#1a3a6b',
            boxShadow: '0 1px 3px rgba(0,0,0,.08)',
          }}>{k}</button>
        ))}
      </div>
      <button onClick={onOtp} style={{ marginTop: 16, background: 'none', border: 'none', color: '#1a3a6b', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
        Use Phone OTP instead
      </button>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function CustomerAppPage() {
  const [lang, setLang] = useState<Lang>('en');
  const [screen, setScreen] = useState<Screen>('landing');

  // Registration state
  const [regStep, setRegStep] = useState(1);
  const [regPhone, setRegPhone] = useState('');
  const [regOtp, setRegOtp] = useState('');
  const [regOtpSent, setRegOtpSent] = useState(false);
  const [regNic, setRegNic] = useState('');
  const [nicStatus, setNicStatus] = useState<null | 'checking' | 'verified' | 'failed' | 'dup'>(null);
  const [nicFront, setNicFront] = useState(false);
  const [nicBack, setNicBack] = useState(false);
  const [selfie, setSelfie] = useState<null | 'checking' | 'verified'>(null);
  const [regName, setRegName] = useState('');
  const [regDob, setRegDob] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regBranch, setRegBranch] = useState('');
  const [regRank, setRegRank] = useState('');
  const [regRegiment, setRegRegiment] = useState('');
  const [regServiceNo, setRegServiceNo] = useState('');
  const [payslips, setPayslips] = useState(0);
  const [termAccepted, setTermAccepted] = useState(false);
  const [signatureDone, setSignatureDone] = useState(false);
  const [appSubmitted, setAppSubmitted] = useState(false);

  // Home state
  const [homeTab, setHomeTab] = useState<HomeTab>('home');
  const [applyStep, setApplyStep] = useState(1);
  const [selPhone, setSelPhone] = useState<typeof DEMO_PHONES[0] | null>(null);
  const [selPlan, setSelPlan] = useState<{ months: number; monthly: number } | null>(null);
  const [applyDone, setApplyDone] = useState(false);

  // Fetch camps for register step 4
  const { data: campsRes } = useQuery({
    queryKey: ['camps-list-app'],
    queryFn: () => api.get('/camps').then(r => r.data),
  });
  const camps: { id: string; name: string; branch: string }[] = campsRes?.data ?? [];

  const toast = (msg: string) => alert(msg); // simplified for preview

  const STEP_TITLES = [
    T(lang,'Phone Verification','දුරකතන තහවුරු','கைபேசி சரிபார்ப்பு'),
    T(lang,'Identity Verification','හැඳුනුම්පත් තහවුරු','அடையாள சரிபிர்த்தல்'),
    T(lang,'Personal Details','පුද්ගලික විස්තර','தனிப்பட்ட விவரங்கள்'),
    T(lang,'Military Details','හමුදා විස්තර','இராணுவ விவரங்கள்'),
    T(lang,'Pay Slips','වේතන ලේඛන','சம்பள சீட்டு'),
    T(lang,'Terms & Agreement','කොන්දේසි සහ ගිවිසුම','விதிமுறைகள்'),
  ];

  // Phone frame style
  const phoneFrame: React.CSSProperties = {
    width: 390, minHeight: 780, background: '#f8fafc',
    borderRadius: 32, overflow: 'hidden',
    boxShadow: '0 30px 80px rgba(0,0,0,.35), 0 0 0 12px #1a1a2e, 0 0 0 14px #333',
    display: 'flex', flexDirection: 'column', flexShrink: 0, fontFamily: "'Inter', sans-serif",
    position: 'relative',
  };

  const navy = '#1a3a6b';
  const gold = '#c47c0e';

  // ── LANDING ──────────────────────────────────────────────────────────────
  const renderLanding = () => (
    <div style={{ minHeight: '100%', background: 'linear-gradient(160deg,#0a1628 0%,#1a3a6b 60%,#0d4a8a 100%)', display: 'flex', flexDirection: 'column', color: '#fff', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,.04)' }} />
      {/* Lang bar */}
      <div style={{ display: 'flex', gap: 6, padding: '14px 20px 0', justifyContent: 'flex-end' }}>
        {(['en','si','ta'] as Lang[]).map(l => (
          <button key={l} onClick={() => setLang(l)} style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,.3)', background: lang === l ? '#fff' : 'transparent', color: lang === l ? '#0a1628' : '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {l === 'en' ? 'EN' : l === 'si' ? 'සිං' : 'த'}
          </button>
        ))}
      </div>
      {/* Center */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
        <div style={{ width: 90, height: 90, borderRadius: 24, background: 'linear-gradient(135deg,#c47c0e,#f5a623)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, boxShadow: '0 8px 32px rgba(196,124,14,.4)' }}>
          <Smartphone size={44} color="#fff" />
        </div>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -0.5, marginBottom: 4 }}>AIRVOICE</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>Defence Finance</div>
        <div style={{ fontSize: 12.5, opacity: 0.55, textAlign: 'center', maxWidth: 260, lineHeight: 1.6, marginBottom: 36 }}>
          {T(lang,'Phone installment plans for Sri Lanka Armed Forces','ශ්‍රී ලංකා සන්නද්ධ හමුදාව සඳහා','இலங்கை ஆயுத படையினருக்கு')}
        </div>
        {/* Ad banner */}
        <div style={{ width: '100%', maxWidth: 340, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: '10px 14px', marginBottom: 28, backdropFilter: 'blur(10px)' }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Advertisement</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg,#4285F4,#34A853)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#fff', fontSize: 18 }}>📶</span>
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fff' }}>Dialog Axiata Special Offer</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.65)', marginTop: 2 }}>Get 20GB free data with your AIRVOICE plan. Military exclusive.</div>
            </div>
          </div>
        </div>
        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
          <button onClick={() => { setScreen('register'); setRegStep(1); }} style={{ padding: '16px', borderRadius: 14, background: 'linear-gradient(135deg,#c47c0e,#f5a623)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 20px rgba(196,124,14,.4)' }}>
            👤 {T(lang,'Create Account','ගිණුම සාදන්න','கணக்கு உருவாக்கு')}
          </button>
          <button onClick={() => setScreen('login')} style={{ padding: '16px', borderRadius: 14, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.25)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(10px)' }}>
            🔐 {T(lang,'Sign In','පිවිසෙන්න','உள்நுழைய')}
          </button>
        </div>
      </div>
      <div style={{ textAlign: 'center', padding: '16px', fontSize: 11, opacity: 0.45 }}>14+ years serving Sri Lanka's Armed Forces · 200,000+ customers</div>
    </div>
  );

  // ── REGISTRATION STEP ────────────────────────────────────────────────────
  const renderRegStep = () => {
    const verifyNic = () => {
      setNicStatus('checking');
      setTimeout(() => { setNicStatus(regNic.length >= 9 ? 'verified' : 'failed'); }, 1800);
    };
    const takeSelfie = () => {
      setSelfie('checking');
      setTimeout(() => setSelfie('verified'), 2400);
    };

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
        {/* Header */}
        <div style={{ background: navy, color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => regStep > 1 ? setRegStep(s => s - 1) : setScreen('landing')} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }}>←</button>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{T(lang,'Create Account','ගිණුම සාදන්න','கணக்கு உருவாக்கு')}</div>
            <div style={{ fontSize: 11, opacity: 0.75 }}>Step {regStep} of 6 — {STEP_TITLES[regStep - 1]}</div>
          </div>
        </div>
        {/* Progress */}
        <div style={{ height: 4, background: 'rgba(0,0,0,.08)' }}>
          <div style={{ height: '100%', background: gold, width: `${(regStep / 6) * 100}%`, transition: 'width .4s' }} />
        </div>
        {/* Content */}
        <div style={{ flex: 1, padding: '20px 16px', overflowY: 'auto' }}>
          {/* Step 1: Phone OTP */}
          {regStep === 1 && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ width: 64, height: 64, borderRadius: 18, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <span style={{ fontSize: 32 }}>📱</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{T(lang,'Verify Your Phone','දුරකථනය තහවුරු කරන්න','உங்கள் தொலைபேசியை சரிபார்க்கவும்')}</div>
                <div style={{ fontSize: 12.5, color: '#666', maxWidth: 280, margin: '0 auto', lineHeight: 1.6 }}>
                  {T(lang,'Each mobile number can only be used for one AIRVOICE account.','එක් දුරකතන අංකයකට AIRVOICE ගිණුමක් පමණයි.','ஒவ்வொரு கைபேசி எண்ணும் ஒரு கணக்கிற்கு மட்டுமே.')}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>Mobile Number (Sri Lanka) *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ padding: '0 12px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10, display: 'flex', alignItems: 'center', fontWeight: 700, fontSize: 13, color: navy }}> +94 </div>
                  <input className="w-full border border-base rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2" style={{ flex: 1, borderRadius: 10, border: '1px solid #ddd', padding: '10px 12px' }} placeholder="7X XXX XXXX" maxLength={9} value={regPhone} onChange={e => setRegPhone(e.target.value.replace(/\D/g,''))} />
                </div>
              </div>
              {!regOtpSent ? (
                <button onClick={() => { if (regPhone.length < 9) { toast('Enter valid phone number'); return; } setRegOtpSent(true); }} style={{ width: '100%', padding: 14, borderRadius: 14, background: navy, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', border: 'none' }}>
                  📤 {T(lang,'Send OTP','OTP යවන්න','OTP அனுப்பு')}
                </button>
              ) : (
                <div>
                  <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 12.5, color: '#166534', marginBottom: 14 }}>
                    ✅ OTP sent to +94{regPhone}
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>Enter OTP Code</label>
                    <input style={{ width: '100%', border: '1px solid #ddd', borderRadius: 10, padding: '12px 16px', fontSize: 22, letterSpacing: 12, textAlign: 'center', background: '#fff', boxSizing: 'border-box' }} placeholder="------" maxLength={6} value={regOtp} onChange={e => setRegOtp(e.target.value.replace(/\D/g,''))} />
                  </div>
                  <button onClick={() => { if (regOtp.length < 4) { toast('Enter OTP'); return; } setRegStep(2); }} style={{ width: '100%', padding: 14, borderRadius: 14, background: navy, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', border: 'none' }}>
                    ✅ {T(lang,'Verify & Continue','තහවුරු කරන්න','சரிபார்த்து தொடரவும்')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 2: NIC + Selfie */}
          {regStep === 2 && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>{T(lang,'Identity Verification','හැඳුනුම්පත් තහවුරු','அடையாள சரிபிர்த்தல்')}</div>
                <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.6 }}>{T(lang,'AI scans your NIC and selfie to verify your identity.','AI ඔබේ NIC හා selfie පරීක්ෂා කරයි.','AI உங்கள் NIC மற்றும் selfie சரிபார்க்கும்.')}</div>
              </div>
              {/* NIC */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>National ID Card Number (NIC) *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={{ flex: 1, border: '1px solid #ddd', borderRadius: 10, padding: '10px 12px', fontSize: 14 }} placeholder="901234567V or 199012345678" value={regNic} onChange={e => { setRegNic(e.target.value); setNicStatus(null); }} />
                  {nicStatus === null && regNic.length >= 9 && (
                    <button onClick={verifyNic} style={{ padding: '0 16px', background: navy, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Verify</button>
                  )}
                </div>
                {nicStatus === 'checking' && <div style={{ color: navy, fontSize: 12, marginTop: 6 }}>🤖 AI checking NIC authenticity...</div>}
                {nicStatus === 'verified' && <div style={{ color: '#166534', fontSize: 12, fontWeight: 700, marginTop: 6 }}>✅ NIC Verified — Authentic</div>}
                {nicStatus === 'failed' && <div style={{ color: '#dc2626', fontSize: 12, fontWeight: 700, marginTop: 6 }}>❌ Verification failed</div>}
              </div>
              {/* NIC Front/Back */}
              {(['NIC Front (with photo)', 'NIC Back'] as const).map((label, idx) => {
                const captured = idx === 0 ? nicFront : nicBack;
                const setCaptured = idx === 0 ? setNicFront : setNicBack;
                return (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>{label} *</label>
                    <div onClick={() => setCaptured(true)} style={{ border: `2px dashed ${captured ? '#22c55e' : '#ddd'}`, borderRadius: 12, padding: 18, textAlign: 'center', cursor: 'pointer', background: captured ? '#f0fdf4' : '#fff' }}>
                      {captured ? <div style={{ color: '#166534', fontWeight: 700 }}>📷 {label} captured ✅</div>
                        : <div style={{ color: '#999', fontSize: 13 }}>📷 Tap to capture</div>}
                    </div>
                  </div>
                );
              })}
              {/* Selfie */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>Live Selfie (AI face match) *</label>
                <div onClick={takeSelfie} style={{ border: `2px dashed ${selfie === 'verified' ? '#22c55e' : '#ddd'}`, borderRadius: 12, padding: 22, textAlign: 'center', cursor: 'pointer', background: selfie === 'verified' ? '#f0fdf4' : '#fff' }}>
                  {selfie === 'checking' ? <div style={{ color: navy }}>🤖 AI analyzing face... Comparing with NIC...</div>
                    : selfie === 'verified' ? <div style={{ color: '#166534', fontWeight: 700 }}>🤳 Face matched ✅ Identity confirmed</div>
                    : <div style={{ color: '#999', fontSize: 13 }}>🤳 Tap to take selfie</div>}
                </div>
              </div>
              <button onClick={() => { if (!nicFront || !nicBack) { toast('Capture both NIC sides'); return; } if (selfie !== 'verified') { toast('Take selfie first'); return; } if (nicStatus !== 'verified') { toast('Verify NIC first'); return; } setRegStep(3); }} style={{ width: '100%', padding: 14, borderRadius: 14, background: navy, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', border: 'none' }}>
                {T(lang,'Continue','ඉදිරියට','தொடரவும்')} →
              </button>
            </div>
          )}

          {/* Step 3: Personal Details */}
          {regStep === 3 && (
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>{T(lang,'Personal Details','පුද්ගලික විස්තර','தனிப்பட்ட விவரங்கள்')}</div>
              {[
                { label: T(lang,'Full Name','සම්පූර්ණ නම','முழு பெயர்') + ' *', val: regName, set: setRegName, placeholder: 'As on NIC', type: 'text' },
                { label: T(lang,'Date of Birth','උපන් දිනය','பிறந்த தேதி') + ' *', val: regDob, set: setRegDob, placeholder: '', type: 'date' },
                { label: T(lang,'Email Address','විද්‍යුත් ලිපිනය','மின்னஞ்சல்') + ' *', val: regEmail, set: setRegEmail, placeholder: 'your@email.com', type: 'email' },
              ].map(f => (
                <div key={f.label} style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>{f.label}</label>
                  <input type={f.type} style={{ width: '100%', border: '1px solid #ddd', borderRadius: 10, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }} placeholder={f.placeholder} value={f.val} onChange={e => f.set(e.target.value)} />
                </div>
              ))}
              <button onClick={() => { if (!regName || !regDob || !regEmail) { toast('Fill all fields'); return; } setRegStep(4); }} style={{ width: '100%', padding: 14, borderRadius: 14, background: navy, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', border: 'none' }}>
                {T(lang,'Continue','ඉදිරියට','தொடரவும்')} →
              </button>
            </div>
          )}

          {/* Step 4: Military Details */}
          {regStep === 4 && (
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>{T(lang,'Military Details','හමුදා විස්තර','இராணுவ விவரங்கள்')}</div>
              {[
                { label: T(lang,'Branch','සේවා අංශය','படை') + ' *', id: 'branch', options: Object.entries(BRANCHES).map(([k, v]) => ({ v: k, l: v.label })), val: regBranch, set: (v: string) => { setRegBranch(v); setRegRegiment(''); } },
                ...(regBranch ? [{ label: T(lang,'Rank','නිළය','பதவி') + ' *', id: 'rank', options: RANKS.map(r => ({ v: r, l: r })), val: regRank, set: setRegRank }] : []),
                ...(regBranch ? [{ label: T(lang,'Regiment / Unit','රෙජිමේන්තු','படைப்பிரிவு') + ' *', id: 'regiment', options: BRANCHES[regBranch]?.regiments.map(r => ({ v: r, l: r })) ?? [], val: regRegiment, set: setRegRegiment }] : []),
              ].map(f => (
                <div key={f.id} style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>{f.label}</label>
                  <select style={{ width: '100%', border: '1px solid #ddd', borderRadius: 10, padding: '10px 12px', fontSize: 14 }} value={f.val} onChange={e => f.set(e.target.value)}>
                    <option value="">Select...</option>
                    {f.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              ))}
              {regBranch && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>Camp / Base *</label>
                  <select style={{ width: '100%', border: '1px solid #ddd', borderRadius: 10, padding: '10px 12px', fontSize: 14 }} value='' onChange={() => {}}>
                    <option value="">Select camp...</option>
                    {camps.filter(c => !c.branch || c.branch === regBranch).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>Service Number *</label>
                <input style={{ width: '100%', border: '1px solid #ddd', borderRadius: 10, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }} placeholder="e.g. SL/0045678" value={regServiceNo} onChange={e => setRegServiceNo(e.target.value)} />
              </div>
              <button onClick={() => { if (!regBranch || !regRank || !regRegiment || !regServiceNo) { toast('Fill all fields'); return; } setRegStep(5); }} style={{ width: '100%', padding: 14, borderRadius: 14, background: navy, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', border: 'none' }}>
                {T(lang,'Continue','ඉදිරියට','தொடரவும்')} →
              </button>
            </div>
          )}

          {/* Step 5: Pay Slips */}
          {regStep === 5 && (
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>{T(lang,'Pay Slip Verification','වේතන තහවුරු','சம்பள சரிபிர்த்தல்')}</div>
              <div style={{ fontSize: 12.5, color: '#666', marginBottom: 20, lineHeight: 1.6 }}>
                {T(lang,'Upload at least 3 recent pay slips to verify your salary.','කරුණාකර අවම 3 මාසයේ වේතන ලේඛනය ඉදිරිපත් කරන්න.','குறைந்தது 3 மாத சம்பள சீட்டு அவசியம்.')}
              </div>
              {['Most Recent Pay Slip','2 Months Ago Pay Slip','3 Months Ago Pay Slip'].map((label, i) => {
                const uploaded = payslips > i;
                return (
                  <div key={i} onClick={() => setPayslips(Math.max(payslips, i + 1))} style={{ border: `2px dashed ${uploaded ? '#22c55e' : '#ddd'}`, borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', background: uploaded ? '#f0fdf4' : '#fff', marginBottom: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: uploaded ? '#dcfce7' : '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22 }}>{uploaded ? '📄✅' : '📤'}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{label}</div>
                      <div style={{ fontSize: 12, color: uploaded ? '#166534' : '#999', marginTop: 2 }}>{uploaded ? '✔ Uploaded — AI verified salary' : 'Tap to upload PDF or photo'}</div>
                    </div>
                  </div>
                );
              })}
              <div style={{ padding: '10px 14px', background: '#eef2ff', borderRadius: 9, fontSize: 12.5, marginBottom: 16 }}>
                📎 Only official military pay slips accepted. All data is encrypted and never shared.
              </div>
              <button onClick={() => { if (payslips < 3) { toast('Upload all 3 pay slips'); return; } setRegStep(6); }} style={{ width: '100%', padding: 14, borderRadius: 14, background: navy, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', border: 'none' }}>
                {T(lang,'Continue','ඉදිරියට','தொடரவும்')} →
              </button>
            </div>
          )}

          {/* Step 6: Terms + Signature */}
          {regStep === 6 && (
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>{T(lang,'Terms & Agreement','කොන්දේසි සහ ගිවිසුම','விதிமுறைகள்')}</div>
              <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 14, maxHeight: 160, overflowY: 'auto', fontSize: 12, color: '#555', lineHeight: 1.7, marginBottom: 14 }}>
                <strong>AIRVOICE Phone Installment Agreement</strong><br />
                1. Monthly installments will be deducted from your salary by your camp payroll.<br />
                2. The device remains property of AIRVOICE until full payment is made.<br />
                3. Missed deductions for 2+ months may result in legal recovery action.<br />
                4. Your guarantor (if applicable) is equally liable for outstanding amounts.<br />
                5. Early settlement is permitted. Contact finance for settlement figures.<br />
                6. AIRVOICE reserves the right to verify your service status at any time.
              </div>
              <div onClick={() => setTermAccepted(!termAccepted)} style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', marginBottom: 16, padding: '10px 14px', background: termAccepted ? '#f0fdf4' : '#f8fafc', border: `1px solid ${termAccepted ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 10 }}>
                <div style={{ width: 22, height: 22, border: `2px solid ${termAccepted ? '#22c55e' : '#ddd'}`, borderRadius: 6, background: termAccepted ? '#22c55e' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 14, fontWeight: 900 }}>
                  {termAccepted ? '✓' : ''}
                </div>
                <div style={{ fontSize: 13 }}>I have read and agree to the AIRVOICE terms and conditions.</div>
              </div>
              {/* Signature pad */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>Digital Signature *</label>
                <div onClick={() => setSignatureDone(true)} style={{ border: `2px dashed ${signatureDone ? '#22c55e' : '#ddd'}`, borderRadius: 12, padding: 28, textAlign: 'center', cursor: 'pointer', background: signatureDone ? '#f0fdf4' : '#fff' }}>
                  {signatureDone
                    ? <div style={{ color: '#166534', fontWeight: 700 }}><div style={{ fontFamily: 'cursive', fontSize: 24, marginBottom: 4 }}>{regName || 'Your Name'}</div>✅ Signature captured</div>
                    : <div style={{ color: '#999' }}>✍ Tap and draw your signature</div>
                  }
                </div>
              </div>
              {!appSubmitted ? (
                <button onClick={() => { if (!termAccepted) { toast('Accept terms first'); return; } if (!signatureDone) { toast('Sign the agreement first'); return; } setAppSubmitted(true); }} style={{ width: '100%', padding: 14, borderRadius: 14, background: navy, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', border: 'none', opacity: termAccepted && signatureDone ? 1 : 0.5 }}>
                  📤 {T(lang,'Submit Registration','ලියාපදිංචිය ඉදිරිපත් කරන්න','பதிவை சமர்ப்பிக்கவும்')}
                </button>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 40 }}>✅</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#166534', marginBottom: 8 }}>Registration Submitted!</div>
                  <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 20 }}>Your application is now with your Camp CO for verification. AIRVOICE will contact you within 3–5 working days.</div>
                  <button onClick={() => { setScreen('home'); setRegStep(1); setAppSubmitted(false); }} style={{ width: '100%', padding: 14, borderRadius: 14, background: navy, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', border: 'none' }}>
                    🏠 {T(lang,'Go to Home','ගෙදර යයි','முகப்பு பக்கம்')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  const renderLogin = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      <div style={{ background: navy, color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => setScreen('landing')} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }}>←</button>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{T(lang,'Sign In','පිවිසෙන්න','உள்நுழைய')}</div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, fontSize: 40 }}>🔐</div>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{T(lang,'Enter PIN','PIN ඇතුළු කරන්න','PIN உள்ளிடவும்')}</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 28 }}>Demo Customer · PIN: 1234</div>
        <PinPad onSuccess={() => setScreen('home')} onOtp={() => toast('OTP login — demo only supports PIN')} />
      </div>
    </div>
  );

  // ── HOME APP ──────────────────────────────────────────────────────────────
  const totalOwed = DEMO_APPS.reduce((s, a) => s + a.monthly * (a.installments - a.paid), 0);
  const missed = DEMO_APPS.reduce((s, a) => s + a.missed, 0);

  const renderApplyFlow = () => (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => { setApplyStep(1); setSelPhone(null); setSelPlan(null); setApplyDone(false); setHomeTab('home'); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>←</button>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{T(lang,'Order a Phone','දුරකතනයක් ඇනවුම් කරන්න','தொலைபேசி ஆர்டர் செய்யவும்')}</div>
          <div style={{ fontSize: 12, color: '#888' }}>Step {applyStep} of 3</div>
        </div>
      </div>
      <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, marginBottom: 20 }}>
        <div style={{ height: '100%', background: gold, borderRadius: 2, width: `${(applyStep / 3) * 100}%`, transition: 'width .4s' }} />
      </div>

      {applyStep === 1 && (
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>{T(lang,'Choose a Phone','දුරකතනයක් තෝරන්න','தொலைபேசியைத் தேர்ந்தெடுக்கவும்')}</div>
          {DEMO_PHONES.map(m => (
            <div key={m.id} onClick={() => { setSelPhone(m); setApplyStep(2); }} style={{ background: '#fff', border: `2px solid ${selPhone?.id === m.id ? navy : '#e5e7eb'}`, borderRadius: 16, padding: '14px 16px', marginBottom: 12, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.06)', transition: 'border-color .2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{m.desc}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', background: '#f0fdf4', borderRadius: 6, padding: '2px 8px', display: 'inline-block' }}>In Stock</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {m.plans.map(p => (
                  <div key={p.months} style={{ background: '#eef2ff', borderRadius: 8, padding: '6px 10px', textAlign: 'center', minWidth: 80 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: navy }}>LKR {p.monthly.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{p.months} months</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {applyStep === 2 && selPhone && (
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{T(lang,'Select Payment Plan','ගෙවීම් සැලැස්ම','கட்டண திட்டம்')}</div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>for {selPhone.name}</div>
          {selPhone.plans.map(p => (
            <div key={p.months} onClick={() => setSelPlan(p)} style={{ background: selPlan?.months === p.months ? '#eef2ff' : '#fff', border: `2px solid ${selPlan?.months === p.months ? navy : '#e5e7eb'}`, borderRadius: 14, padding: '16px', marginBottom: 10, cursor: 'pointer', transition: 'all .2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: navy }}>LKR {p.monthly.toLocaleString()}<span style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>/mo</span></div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{p.months} months · Total LKR {(p.monthly * p.months).toLocaleString()}</div>
                </div>
                <div style={{ width: 24, height: 24, border: `2px solid ${selPlan?.months === p.months ? navy : '#ddd'}`, borderRadius: '50%', background: selPlan?.months === p.months ? navy : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900 }}>
                  {selPlan?.months === p.months ? '✓' : ''}
                </div>
              </div>
            </div>
          ))}
          {selPlan && (
            <button onClick={() => setApplyStep(3)} style={{ width: '100%', padding: 14, borderRadius: 14, background: navy, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', border: 'none', marginTop: 8 }}>
              {T(lang,'Continue to Confirm','ඉදිරියට','தொடரவும்')} →
            </button>
          )}
        </div>
      )}

      {applyStep === 3 && selPhone && selPlan && (
        <div>
          {!applyDone ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 16 }}>{T(lang,'Confirm & Sign','තහවුරු කරන්න','உறுதிப்படுத்தவும்')}</div>
              <div style={{ background: '#eef2ff', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Order Summary</div>
                <div style={{ fontWeight: 800, fontSize: 16, color: navy }}>{selPhone.name}</div>
                <div style={{ fontWeight: 700, fontSize: 20, color: navy, marginTop: 8 }}>LKR {selPlan.monthly.toLocaleString()}<span style={{ fontSize: 12, fontWeight: 500, color: '#888' }}>/month</span></div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>× {selPlan.months} months = LKR {(selPlan.monthly * selPlan.months).toLocaleString()} total</div>
              </div>
              <div style={{ padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 12.5, marginBottom: 16 }}>
                ✅ Zero down payment · Deducted from salary · No bank required
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#555', display: 'block', marginBottom: 8 }}>Digital Signature *</label>
                <div onClick={() => setSignatureDone(true)} style={{ border: `2px dashed ${signatureDone ? '#22c55e' : '#ddd'}`, borderRadius: 12, padding: 24, textAlign: 'center', cursor: 'pointer', background: signatureDone ? '#f0fdf4' : '#fff' }}>
                  {signatureDone ? <div style={{ color: '#166534', fontWeight: 700 }}><div style={{ fontFamily: 'cursive', fontSize: 22 }}>Sgt. K. Perera</div>✅ Signed</div>
                    : <div style={{ color: '#999' }}>✍ Tap to sign</div>}
                </div>
              </div>
              <button onClick={() => { if (!signatureDone) { toast('Sign first'); return; } setApplyDone(true); }} style={{ width: '100%', padding: 14, borderRadius: 14, background: navy, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', border: 'none', opacity: signatureDone ? 1 : 0.5 }}>
                📤 {T(lang,'Submit Application','ඉල්ලීම ඉදිරිපත් කරන්න','விண்ணப்பத்தை சமர்ப்பிக்கவும்')}
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#166534', marginBottom: 8 }}>Application Submitted!</div>
              <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 24 }}>
                Your application is now with Camp CO for verification. AIRVOICE will contact you within 3–5 working days.
              </div>
              <div style={{ background: '#eef2ff', borderRadius: 12, padding: 14, marginBottom: 20, textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>What happens next:</div>
                {['Camp CO reviews your service record', 'AIRVOICE Finance checks credit history', 'Sales Officer verifies and schedules handover', 'Phone delivered with zero deposit'].map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 12.5 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: navy, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ color: '#555' }}>{s}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => { setApplyDone(false); setApplyStep(1); setSelPhone(null); setSelPlan(null); setSignatureDone(false); setHomeTab('home'); }} style={{ width: '100%', padding: 14, borderRadius: 14, background: navy, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', border: 'none' }}>
                🏠 {T(lang,'Back to Home','ගෙදර','முகப்பு')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderHome = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f0f4f8', minHeight: 0 }}>
      {/* Top bar */}
      <div style={{ background: navy, color: '#fff', padding: '14px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{T(lang,'Welcome back','නැවත සාදරයෙන්','மீண்டும் வரவேற்கிறோம்')}</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Sgt. Kumara</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {(['en','si','ta'] as Lang[]).map(l => (
              <button key={l} onClick={() => setLang(l)} style={{ padding: '3px 8px', borderRadius: 16, border: '1px solid rgba(255,255,255,.3)', background: lang === l ? '#fff' : 'transparent', color: lang === l ? navy : '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                {l === 'en' ? 'EN' : l === 'si' ? 'සිං' : 'த'}
              </button>
            ))}
            <div style={{ position: 'relative', cursor: 'pointer' }}>
              <span style={{ fontSize: 20 }}>🔔</span>
              {missed > 0 && <div style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', background: '#ef4444', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{missed}</div>}
            </div>
          </div>
        </div>
        {/* Balance card */}
        <div style={{ background: 'rgba(255,255,255,.1)', borderRadius: 14, padding: 14, backdropFilter: 'blur(10px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>{T(lang,'Outstanding Balance','ශේෂ රාශිය','நிலுவை தொகை')}</div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>LKR {totalOwed.toLocaleString()}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>Next: LKR 4,750 due Jul 25</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>{T(lang,'Active Plans','ක්‍රියාකාරී','செயலில்')}</div>
              <div style={{ fontSize: 24, fontWeight: 900 }}>{DEMO_APPS.filter(a => a.status === 'active').length}</div>
              {missed > 0 && <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 2 }}>{missed} missed</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Missed alert */}
      {missed > 0 && (
        <div style={{ background: '#ef4444', color: '#fff', padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>{T(lang,'Payment Alert','ගෙවීම් අවවාදය','கட்டண எச்சரிக்கை')}</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>{missed} {T(lang,'deductions were not made. Contact CO.','කැපීම් නොවීය. CO හමු වන්න.','விலக்குகள் செய்யப்படவில்லை.')}</div>
          </div>
        </div>
      )}

      {/* Page content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {homeTab === 'home' && (
          <div style={{ padding: 16 }}>
            {/* App cards */}
            {DEMO_APPS.map(app => {
              const pct = Math.round((app.paid / app.installments) * 100);
              return (
                <div key={app.id} style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
                  <div style={{ background: navy, padding: '14px', color: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{app.phone}</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>{T(lang,'Installment Plan','ගෙවීම් සැලැස්ම','தவணை திட்டம்')}</div>
                      </div>
                      {app.missed > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>{app.missed} Missed</span>}
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,.2)', marginBottom: 6 }}>
                      <div style={{ height: '100%', borderRadius: 4, background: '#f5a623', width: `${pct}%`, transition: 'width .6s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span>{app.paid} of {app.installments} paid</span>
                      <span>{pct}% complete</span>
                    </div>
                  </div>
                  <div style={{ padding: '12px 14px', fontSize: 13, color: '#888' }}>
                    LKR {app.monthly.toLocaleString()}/mo · {app.installments - app.paid} months remaining
                  </div>
                </div>
              );
            })}
            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { icon: '📱', label: T(lang,'Order Phone','දුරකතනය ඇනවුම් කරන්න','தொலைபேசி ஆர்டர்'), color: navy, fn: () => setHomeTab('track') },
                { icon: '📋', label: T(lang,'My Agreements','ගිවිසුම්','ஒப்பந்தங்கள்'), color: '#166534', fn: () => setHomeTab('track') },
                { icon: '🎧', label: T(lang,'Support','සහාය','ஆதரவு'), color: '#d97706', fn: () => alert('AIRVOICE Support: 1800 700 700') },
                { icon: '📞', label: '1800 700 700', color: '#7c3aed', fn: () => alert('Hotline: 1800 700 700') },
              ].map(btn => (
                <button key={btn.label} onClick={btn.fn} style={{ padding: 16, borderRadius: 14, background: '#fff', border: '1px solid #e5e7eb', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `${btn.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{btn.icon}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, textAlign: 'center', color: '#555' }}>{btn.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {homeTab === 'order' && renderApplyFlow()}

        {homeTab === 'track' && (
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>{T(lang,'My Applications','මගේ ඉල්ලීම්','என் விண்ணப்பங்கள்')}</div>
            {DEMO_APPS.map(app => {
              const stages = ['submitted','camp_review','finance_review','approved','active'];
              const si = stages.indexOf(app.status);
              return (
                <div key={app.id} style={{ background: '#fff', borderRadius: 14, marginBottom: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                  <div style={{ padding: '14px 14px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{app.phone}</div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{app.id}</div>
                      </div>
                      <span style={{ background: '#f0fdf4', color: '#166534', fontWeight: 700, fontSize: 11, borderRadius: 6, padding: '2px 8px' }}>{app.status}</span>
                    </div>
                    {/* Pipeline dots */}
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
                      {stages.map((_, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < stages.length - 1 ? 1 : 0 }}>
                          <div style={{ width: i === si ? 18 : 12, height: i === si ? 18 : 12, borderRadius: '50%', background: i <= si ? '#22c55e' : '#e5e7eb', border: i === si ? '3px solid #22c55e' : 'none', flexShrink: 0, transition: 'all .3s' }} />
                          {i < stages.length - 1 && <div style={{ flex: 1, height: 2, background: i < si ? '#22c55e' : '#e5e7eb' }} />}
                        </div>
                      ))}
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                        <span style={{ color: '#888' }}>Installments Paid</span>
                        <span style={{ fontWeight: 700 }}>{app.paid}/{app.installments}</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 4, background: '#e5e7eb' }}>
                        <div style={{ height: '100%', borderRadius: 4, background: '#22c55e', width: `${(app.paid / app.installments) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: '10px 14px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#888' }}>Remaining: {app.installments - app.paid} months</span>
                    <span style={{ fontWeight: 700, color: navy }}>LKR {app.monthly.toLocaleString()}/mo</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {homeTab === 'profile' && (
          <div style={{ padding: 16 }}>
            <div style={{ background: navy, borderRadius: 16, padding: 20, color: '#fff', marginBottom: 16, textAlign: 'center' }}>
              <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 32 }}>👤</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Sgt. Kumara Perera</div>
              <div style={{ fontSize: 13, opacity: 0.75, marginTop: 3 }}>Sergeant · Army</div>
              <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>Colombo HQ</div>
            </div>
            {[
              ['NIC','901234567V'], ['Service No','A/034521'], ['Branch','Sri Lanka Army'],
              ['Regiment','1 GW Bn'], ['Camp','Colombo HQ'],
              ['Active Plans',DEMO_APPS.filter(a => a.status === 'active').length], ['Risk Score','Low ✅'],
            ].map(([l, v]) => (
              <div key={String(l)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 14px', background: '#fff', borderRadius: 10, marginBottom: 8, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
                <span style={{ color: '#888', fontSize: 13 }}>{l}</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{String(v)}</span>
              </div>
            ))}
            <button onClick={() => setScreen('landing')} style={{ width: '100%', padding: 14, marginTop: 8, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
              🚪 {T(lang,'Sign Out','පිටවීම','வெளியேறு')}
            </button>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ background: '#fff', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-around', padding: '10px 0', flexShrink: 0 }}>
        {[
          { k: 'home', icon: '🏠', label: T(lang,'Home','ගෙදර','முகப்பு') },
          { k: 'order', icon: '🛒', label: T(lang,'Order','ඇනවුම','ஆர்டர்') },
          { k: 'track', icon: '📋', label: T(lang,'Track','නිරීක්ෂා','கண்காணி') },
          { k: 'profile', icon: '👤', label: T(lang,'Profile','පැතිකඩ','விவரம்') },
        ].map(item => (
          <button key={item.k} onClick={() => setHomeTab(item.k as HomeTab)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', flex: 1, color: homeTab === item.k ? navy : '#9ca3af' }}>
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            <span style={{ fontSize: 10, fontWeight: homeTab === item.k ? 700 : 400 }}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  // ─── PAGE WRAPPER ────────────────────────────────────────────────────────
  return (
    <div className="p-6 min-h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)' }}>
      {/* Admin Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Smartphone size={26} className="text-amber-400" />
          Customer App Preview
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Interactive simulation of the AIRVOICE Customer Mobile App — Tri-language (EN / සිංහල / தமிழ்)
        </p>
      </div>

      <div className="flex gap-10 items-start justify-center flex-wrap">
        {/* Phone Frame */}
        <div style={{ position: 'relative' }}>
          {/* Notch */}
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', width: 120, height: 28, background: '#1a1a2e', borderRadius: '0 0 16px 16px', zIndex: 20 }} />
          <div style={phoneFrame}>
            <div style={{ paddingTop: 40, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {screen === 'landing' && renderLanding()}
              {screen === 'register' && renderRegStep()}
              {screen === 'login' && renderLogin()}
              {screen === 'home' && renderHome()}
            </div>
          </div>
          {/* Home indicator */}
          <div style={{ width: 120, height: 4, background: '#333', borderRadius: 2, margin: '12px auto 0' }} />
        </div>

        {/* Info panel */}
        <div className="w-80 space-y-4" style={{ color: '#fff' }}>
          <div className="bg-white/10 rounded-2xl p-5 backdrop-blur-sm">
            <h3 className="font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400">📱</span> App Screens
            </h3>
            <div className="space-y-2">
              {[
                { s: 'landing', label: 'Landing / Welcome', active: screen === 'landing' },
                { s: 'register', label: '6-Step Registration', active: screen === 'register' },
                { s: 'login', label: 'PIN Login', active: screen === 'login' },
                { s: 'home', label: 'Home App (4 tabs)', active: screen === 'home' },
              ].map(item => (
                <button
                  key={item.s}
                  onClick={() => { setScreen(item.s as Screen); if (item.s === 'register') setRegStep(1); }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                    item.active ? 'bg-amber-500 text-slate-900' : 'bg-white/10 text-slate-300 hover:bg-white/20'
                  }`}
                >
                  <span>{item.active ? '→' : '·'}</span> {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white/10 rounded-2xl p-5 backdrop-blur-sm">
            <h3 className="font-bold text-white mb-3">🌐 Language</h3>
            <div className="flex gap-2">
              {([['en', 'English'], ['si', 'සිංහල'], ['ta', 'தமிழ்']] as [Lang, string][]).map(([l, label]) => (
                <button key={l} onClick={() => setLang(l)} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${lang === l ? 'bg-amber-500 text-slate-900' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white/10 rounded-2xl p-5 backdrop-blur-sm">
            <h3 className="font-bold text-white mb-3">📋 Registration Steps</h3>
            <div className="space-y-1.5 text-sm">
              {['Phone OTP Verification','NIC + Selfie (AI Verify)','Personal Details','Military Details','Pay Slips (3 months)','Terms & Digital Signature'].map((s, i) => (
                <div key={i} onClick={() => { setScreen('register'); setRegStep(i + 1); }} className="flex items-center gap-2 cursor-pointer hover:text-amber-400 transition-colors" style={{ color: screen === 'register' && regStep === i + 1 ? '#f59e0b' : '#cbd5e1' }}>
                  <span className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${screen === 'register' && regStep === i + 1 ? 'bg-amber-500 text-slate-900' : 'bg-white/20 text-white'}`}>{i + 1}</span>
                  {s}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/10 rounded-2xl p-5 backdrop-blur-sm">
            <h3 className="font-bold text-white mb-2">ℹ️ Demo Notes</h3>
            <ul className="text-slate-400 text-xs space-y-1">
              <li>• PIN login uses demo PIN: <b className="text-white">1234</b></li>
              <li>• Registration accepts any input</li>
              <li>• Camp data loads from real API</li>
              <li>• All phone/NIC data is demo only</li>
            </ul>
            <a href="/applications" className="mt-3 flex items-center gap-1.5 text-amber-400 text-xs font-semibold hover:text-amber-300">
              <ExternalLink size={12} /> Go to Real Applications →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
