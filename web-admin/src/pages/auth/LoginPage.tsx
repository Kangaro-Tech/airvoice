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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-amber-600/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-slate-800/20 rounded-full blur-3xl" />
      </div>

      {/* reCAPTCHA container — invisible */}
      <div id="recaptcha-container" />

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="relative inline-block mb-5">
            <div className="w-28 h-28 rounded-3xl flex items-center justify-center shadow-2xl shadow-amber-500/20 surface p-2 overflow-hidden">
              <img src={logoImg} alt="AIRVOICE" className="w-full h-full object-contain" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full border-2 border-slate-950 flex items-center justify-center">
              <div className="w-2 h-2 surface rounded-full" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">AIRVOICE</h1>
          <p className="text-slate-400 mt-1 text-sm font-medium">Defence Finance Management System</p>
          <div className="flex items-center justify-center gap-2 mt-2 text-xs text-slate-500">
            <Shield size={11} />
            <span>Staff Portal — Authorised Personnel Only</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          {/* Top accent bar */}
          <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

          <div className="p-8">

            {/* ── Step: Enter Phone or Email ── */}
            {step === 'identifier' && (
              <form onSubmit={handleIdentifierSubmit} className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Sign In</h2>
                  <p className="text-sm text-slate-400">
                    Enter your mobile number or email address
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300">
                    Mobile Number or Email
                  </label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-all">
                      {identifierType === 'email' ? (
                        <Mail size={17} className="text-amber-400" />
                      ) : (
                        <Phone size={17} className={identifierType === 'phone' ? 'text-amber-400' : 'text-slate-500'} />
                      )}
                    </div>
                    <input
                      type="text"
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      placeholder="+94 7X XXX XXXX  or  user@email.com"
                      className="w-full pl-11 pr-4 py-3.5 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all text-sm"
                      autoFocus
                      required
                    />
                    {identifierType && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-md ${
                          identifierType === 'phone'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-purple-500/20 text-purple-400'
                        }`}>
                          {identifierType === 'phone' ? 'OTP' : 'PASSWORD'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Visual hint pills */}
                  <div className="flex gap-3 mt-3">
                    <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      identifierType === 'phone'
                        ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                        : 'bg-slate-800/50 border-slate-700/50 text-slate-500'
                    }`}>
                      <Phone size={11} />
                      <span>Mobile → OTP</span>
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      identifierType === 'email'
                        ? 'bg-purple-500/15 border-purple-500/30 text-purple-400'
                        : 'bg-slate-800/50 border-slate-700/50 text-slate-500'
                    }`}>
                      <Mail size={11} />
                      <span>Email → Password</span>
                    </div>
                  </div>
                </div>

                {error && <ErrorBox message={error} />}

                <button
                  type="submit"
                  disabled={isLoading || !identifierType}
                  className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-900 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 text-sm"
                >
                  {isLoading ? (
                    <><Loader2 size={17} className="animate-spin" /> Processing...</>
                  ) : identifierType === 'phone' ? (
                    <><Phone size={17} /> Send OTP<ChevronRight size={15} /></>
                  ) : identifierType === 'email' ? (
                    <><Lock size={17} /> Enter Password<ChevronRight size={15} /></>
                  ) : (
                    <>Continue<ChevronRight size={15} /></>
                  )}
                </button>
              </form>
            )}

            {/* ── Step: OTP Verification ── */}
            {step === 'otp' && (
              <form onSubmit={handleOtpSubmit} className="space-y-6">
                <div>
                  <div className="w-12 h-12 bg-blue-500/15 rounded-2xl flex items-center justify-center mb-4">
                    <Phone size={22} className="text-blue-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">Enter OTP</h2>
                  <p className="text-sm text-slate-400">
                    Code sent to <span className="text-amber-400 font-semibold">{identifier}</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300">6-Digit Code</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
                    <input
                      type="text"
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-full pl-11 pr-4 py-4 bg-slate-800 border border-slate-700 text-white rounded-xl text-3xl tracking-[0.5em] text-center font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                      maxLength={6}
                      inputMode="numeric"
                      autoFocus
                      required
                    />
                  </div>
                  {/* Progress dots */}
                  <div className="flex justify-center gap-2 mt-2">
                    {[0,1,2,3,4,5].map(i => (
                      <div key={i} className={`w-2 h-2 rounded-full transition-all ${
                        i < otp.length ? 'bg-amber-500 scale-110' : 'bg-slate-700'
                      }`} />
                    ))}
                  </div>
                </div>

                {error && <ErrorBox message={error} />}

                <button
                  type="submit"
                  disabled={isLoading || otp.length < 6}
                  className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-900 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 text-sm"
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
                  className="w-full text-sm text-slate-500 hover:text-slate-300 transition-colors"
                >
                  ← Change phone number
                </button>
              </form>
            )}

            {/* ── Step: Email Password ── */}
            {step === 'password' && (
              <form onSubmit={handleEmailLogin} className="space-y-6">
                <div>
                  <div className="w-12 h-12 bg-purple-500/15 rounded-2xl flex items-center justify-center mb-4">
                    <Mail size={22} className="text-purple-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">Enter Password</h2>
                  <p className="text-sm text-slate-400">
                    Sign in as <span className="text-amber-400 font-semibold">{identifier}</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-11 pr-12 py-3.5 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all text-sm"
                      autoFocus
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                {error && <ErrorBox message={error} />}

                <button
                  type="submit"
                  disabled={isLoading || !password}
                  className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-900 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 text-sm"
                >
                  {isLoading ? (
                    <><Loader2 size={17} className="animate-spin" /> Signing in...</>
                  ) : (
                    <><Shield size={17} /> Sign In</>
                  )}
                </button>

                <button
                  type="button"
                  onClick={goBack}
                  className="w-full text-sm text-slate-500 hover:text-slate-300 transition-colors"
                >
                  ← Change email
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Unauthorised access is a criminal offence. All activity is monitored and logged.
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
