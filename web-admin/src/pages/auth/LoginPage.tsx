import { useState, useEffect } from 'react';
import logoImg from '@/assets/logo.png';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import {
  Shield, Phone, KeyRound, AlertCircle, Loader2,
  Mail, Eye, EyeOff, ChevronRight, Lock
} from 'lucide-react';

type Step = 'identifier' | 'otp' | 'password';
type IdentifierType = 'phone' | 'email' | null;

function isPhoneNumber(value: string): boolean {
  // Matches +94XXXXXXXXX or 07XXXXXXXX or digits-only
  return /^(\+94|0)[0-9]{7,12}$/.test(value.replace(/\s/g, ''));
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value: string): string {
  const stripped = value.replace(/\s/g, '');
  if (stripped.startsWith('07')) return '+94' + stripped.slice(1);
  if (stripped.startsWith('94')) return '+' + stripped;
  return stripped;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const {
    user, sendOtp, verifyOtp, loginWithEmail,
    isLoading, error, clearError, confirmationResult
  } = useAuthStore();

  const [step, setStep] = useState<Step>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [identifierType, setIdentifierType] = useState<IdentifierType>(null);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (confirmationResult) setStep('otp');
  }, [confirmationResult]);

  // Detect type as user types
  useEffect(() => {
    const v = identifier.trim();
    if (isPhoneNumber(v)) setIdentifierType('phone');
    else if (isEmail(v)) setIdentifierType('email');
    else setIdentifierType(null);
  }, [identifier]);

  const handleIdentifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const v = identifier.trim();

    if (isPhoneNumber(v)) {
      // Phone → OTP
      const phone = normalizePhone(v);
      await sendOtp(phone);
      // step will switch to 'otp' via useEffect on confirmationResult
    } else if (isEmail(v)) {
      // Email → show password field
      setStep('password');
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await verifyOtp(otp);
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await loginWithEmail(identifier.trim(), password);
  };

  const goBack = () => {
    setStep('identifier');
    setOtp('');
    setPassword('');
    clearError();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#0a0f1c]">
      {/* Dynamic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] w-[40%] h-[60%] bg-indigo-600/20 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[20%] left-[20%] w-[60%] h-[50%] bg-blue-900/30 rounded-full blur-[150px]" />
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-50" />
      </div>

      {/* reCAPTCHA container — invisible */}
      <div id="recaptcha-container" />

      <div className="w-full max-w-md relative z-10 flex flex-col items-center">
        {/* Logo & Header */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="relative mb-6">
            <div className="w-24 h-24 rounded-2xl flex items-center justify-center bg-white shadow-2xl overflow-hidden p-3 relative">
              <img src={logoImg} alt="AIRVOICE" className="w-full h-full object-contain relative z-10" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-sm">AIRVOICE</h1>
          <p className="text-blue-200/70 mt-1.5 text-sm font-medium tracking-wide">Defence Finance Management System</p>
          <div className="inline-flex items-center gap-1.5 mt-3 text-[11px] font-semibold tracking-widest text-emerald-400 uppercase bg-emerald-400/10 border border-emerald-400/20 px-3 py-1 rounded-full">
            <Shield size={10} /> Staff Portal
          </div>
        </div>

        {/* Glass Card */}
        <div className="w-full bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] overflow-hidden relative">
          {/* Top highlight */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          
          <div className="p-8">
            {/* ── Step: Enter Phone or Email ── */}
            {step === 'identifier' && (
              <form onSubmit={handleIdentifierSubmit} className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Welcome back</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Sign in to access the staff dashboard
                  </p>
                </div>

                <div className="space-y-2.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Mobile Number or Email
                  </label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200">
                      {identifierType === 'email' ? (
                        <Mail size={18} className="text-blue-400" />
                      ) : (
                        <Phone size={18} className={identifierType === 'phone' ? 'text-blue-400' : 'text-slate-500 group-focus-within:text-blue-400'} />
                      )}
                    </div>
                    <input
                      type="text"
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      placeholder="+94 7X XXX XXXX  or  user@email.com"
                      className="w-full pl-12 pr-4 py-3.5 bg-black/20 border border-white/10 text-white placeholder-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm shadow-inner"
                      autoFocus
                      required
                    />
                    {identifierType && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/20">
                          {identifierType === 'phone' ? 'OTP' : 'PASSWORD'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {error && <ErrorBox message={error} />}

                <button
                  type="submit"
                  disabled={isLoading || !identifierType}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,234,0.3)] hover:shadow-[0_0_25px_rgba(37,99,234,0.4)] flex items-center justify-center gap-2 text-sm border border-white/10 relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full hover:translate-y-0 transition-transform duration-300 ease-out" />
                  <span className="relative flex items-center gap-2">
                    {isLoading ? (
                      <><Loader2 size={17} className="animate-spin" /> Processing...</>
                    ) : identifierType === 'phone' ? (
                      <><Phone size={17} /> Send OTP<ChevronRight size={15} /></>
                    ) : identifierType === 'email' ? (
                      <><Lock size={17} /> Enter Password<ChevronRight size={15} /></>
                    ) : (
                      <>Continue<ChevronRight size={15} /></>
                    )}
                  </span>
                </button>
              </form>
            )}

            {/* ── Step: OTP Verification ── */}
            {step === 'otp' && (
              <form onSubmit={handleOtpSubmit} className="space-y-6">
                <div>
                  <div className="w-12 h-12 bg-blue-500/20 border border-blue-500/30 rounded-2xl flex items-center justify-center mb-5 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                    <Phone size={22} className="text-blue-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Verify Identity</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Enter the code sent to <span className="text-blue-300 font-semibold">{identifier}</span>
                  </p>
                </div>

                <div className="space-y-2.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">6-Digit OTP Code</label>
                  <div className="relative">
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                      type="text"
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-full pl-12 pr-4 py-4 bg-black/20 border border-white/10 text-white rounded-xl text-3xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all shadow-inner placeholder-slate-700"
                      maxLength={6}
                      inputMode="numeric"
                      autoFocus
                      required
                    />
                  </div>
                  {/* Progress dots */}
                  <div className="flex justify-center gap-3 mt-3">
                    {[0,1,2,3,4,5].map(i => (
                      <div key={i} className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        i < otp.length ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)] scale-125' : 'bg-slate-700'
                      }`} />
                    ))}
                  </div>
                </div>

                {error && <ErrorBox message={error} />}

                <button
                  type="submit"
                  disabled={isLoading || otp.length < 6}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,234,0.3)] hover:shadow-[0_0_25px_rgba(37,99,234,0.4)] flex items-center justify-center gap-2 text-sm border border-white/10"
                >
                  {isLoading ? (
                    <><Loader2 size={17} className="animate-spin" /> Verifying...</>
                  ) : (
                    <><KeyRound size={17} /> Verify &amp; Sign In</>
                  )}
                </button>

                <button
                  type="button"
                  onClick={goBack}
                  className="w-full text-sm text-slate-400 hover:text-white transition-colors"
                >
                  ← Use a different number
                </button>
              </form>
            )}

            {/* ── Step: Email Password ── */}
            {step === 'password' && (
              <form onSubmit={handleEmailLogin} className="space-y-6">
                <div>
                  <div className="w-12 h-12 bg-indigo-500/20 border border-indigo-500/30 rounded-2xl flex items-center justify-center mb-5 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                    <Mail size={22} className="text-indigo-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Enter Password</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Signing in as <span className="text-blue-300 font-semibold">{identifier}</span>
                  </p>
                </div>

                <div className="space-y-2.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Account Password</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors duration-200" size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-12 pr-12 py-3.5 bg-black/20 border border-white/10 text-white placeholder-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all text-sm shadow-inner"
                      autoFocus
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {error && <ErrorBox message={error} />}

                <button
                  type="submit"
                  disabled={isLoading || !password}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,234,0.3)] hover:shadow-[0_0_25px_rgba(37,99,234,0.4)] flex items-center justify-center gap-2 text-sm border border-white/10"
                >
                  {isLoading ? (
                    <><Loader2 size={17} className="animate-spin" /> Signing in...</>
                  ) : (
                    <><Shield size={17} /> Secure Sign In</>
                  )}
                </button>

                <button
                  type="button"
                  onClick={goBack}
                  className="w-full text-sm text-slate-400 hover:text-white transition-colors"
                >
                  ← Use a different email
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] font-medium text-slate-500 mt-8 tracking-wide">
          Unauthorised access is a criminal offence.<br />All activity is monitored and securely logged.
        </p>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
      <AlertCircle size={15} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
