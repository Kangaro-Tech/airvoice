import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import logoImg from '@/assets/logo.png';
import {
  Shield, Mail, Eye, EyeOff, AlertCircle,
  Loader2, UserPlus, CheckCircle2, ChevronDown, Phone
} from 'lucide-react';

type UserRole =
  | 'sales_officer' | 'camp_officer' | 'finance_officer' | 'recovery_officer'
  | 'inventory_manager' | 'accountant' | 'admin' | 'super_admin';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'sales_officer',    label: 'Sales Officer' },
  { value: 'camp_officer',     label: 'Camp Officer' },
  { value: 'finance_officer',  label: 'Finance Officer' },
  { value: 'recovery_officer', label: 'Recovery Officer' },
  { value: 'inventory_manager',label: 'Inventory Manager' },
  { value: 'accountant',       label: 'Accountant' },
  { value: 'admin',            label: 'Admin' },
  { value: 'super_admin',      label: 'Super Admin' },
];

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Contains uppercase', ok: /[A-Z]/.test(password) },
    { label: 'Contains number', ok: /\d/.test(password) },
    { label: 'Contains special character', ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const strength = checks.filter(c => c.ok).length;
  const colors = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500'];

  return (
    <div className="space-y-2">
      <div className="flex gap-1 h-1">
        {[1,2,3,4].map(i => (
          <div key={i} className={`flex-1 rounded-full transition-all ${i <= strength ? colors[strength] : 'bg-slate-700'}`} />
        ))}
      </div>
      {password && (
        <div className="grid grid-cols-2 gap-1">
          {checks.map(c => (
            <div key={c.label} className={`flex items-center gap-1 text-xs ${c.ok ? 'text-emerald-400' : 'text-slate-500'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${c.ok ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              {c.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { registerWithEmail, isLoading, error, clearError } = useAuthStore();
  const { theme } = useThemeStore();

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('sales_officer');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearError();

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }
    if (phone && !/^(\+94|0)[0-9]{7,12}$/.test(phone.replace(/\s/g, ''))) {
      setLocalError('Invalid phone number format. Use format: +94XXXXXXXXX or 07XXXXXXXX');
      return;
    }

    await registerWithEmail(email, password, role, phone || undefined);
    if (!error) {
      setSuccess(true);
    }
  };

  const isDark = theme === 'dark';

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="w-full max-w-md text-center">
          <div className="border p-10 shadow-2xl rounded-2xl" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
            <div className="w-20 h-20 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={40} className="text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Registration Successful!</h2>
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Account created for <span className="text-amber-500 font-semibold">{email}</span>
            </p>
            {phone && (
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                Phone: <span className="font-medium text-amber-500">{phone}</span>
              </p>
            )}
            <p className="text-xs mb-8" style={{ color: 'var(--text-muted)' }}>
              Role: <span style={{ color: 'var(--text-primary)' }}>{ROLES.find(r => r.value === role)?.label}</span>
            </p>
            <button
              onClick={() => navigate('/admin/users')}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-900 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 text-sm"
            >
              Go to Staff Management
            </button>
          </div>
        </div>
      </div>
    );
  }

  const displayError = localError || error;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden transition-all duration-200" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-600/8 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-28 h-28 rounded-3xl flex items-center justify-center shadow-2xl shadow-amber-500/20 surface p-2 overflow-hidden mx-auto mb-5">
            <img src={logoImg} alt="AIRVOICE" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>Register Staff Account</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Create a staff member login details</p>
        </div>

        {/* Card */}
        <div className="border rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

          <div className="p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Email Address *</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="staff@airvoice.lk"
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl transition-all text-sm"
                    style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
                    required
                  />
                </div>
              </div>

              {/* Phone Number (Optional) */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Phone Number (Optional)</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+94 7X XXX XXXX"
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl transition-all text-sm"
                    style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Format: +94XXXXXXXXX or 07XXXXXXXX</p>
              </div>

              {/* Role */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Role *</label>
                <div className="relative">
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as UserRole)}
                    className="w-full px-4 py-3.5 rounded-xl focus:outline-none transition-all text-sm appearance-none cursor-pointer"
                    style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value} style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={17} />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full pl-4 pr-12 py-3.5 rounded-xl transition-all text-sm"
                    style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
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
                {password && <PasswordStrength password={password} />}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Confirm Password *</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-4 pr-12 py-3.5 rounded-xl transition-all text-sm"
                    style={{
                      backgroundColor: 'var(--input-bg)',
                      border: confirmPassword && confirmPassword !== password ? '1px solid #ef4444' : '1px solid var(--input-border)',
                      color: 'var(--text-primary)'
                    }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(p => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== password && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
              </div>

              {displayError && (
                <div className="flex items-start gap-2.5 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{displayError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !email || !password || !confirmPassword}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-900 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 text-sm"
              >
                {isLoading ? (
                  <><Loader2 size={17} className="animate-spin" /> Creating Account...</>
                ) : (
                  <><UserPlus size={17} /> Create Account</>
                )}
              </button>

              <div className="text-center">
                <Link
                  to="/admin/users"
                  className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                >
                  ← Back to Staff Management
                </Link>
              </div>
            </form>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mt-6 text-xs text-slate-600">
          <Shield size={11} />
          <span>Authorised personnel only. All activity is monitored.</span>
        </div>
      </div>
    </div>
  );
}
