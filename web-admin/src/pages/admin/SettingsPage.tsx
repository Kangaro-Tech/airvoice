import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  SlidersHorizontal,
  MessageSquare,
  Users,
  Building2,
  Server,
  CircleCheck,
  Save,
  Smartphone,
  Coins,
  Trophy,
  Users2,
  AlertTriangle,
  AlertCircle,
  CalendarClock,
  Bot,
  Info,
  MessageCircle,
  Send,
  ChevronUp,
  Pencil,
  MessagesSquare,
  Phone,
  Shield,
  Activity,
  Clock,
  Contact,
  Plus,
  CircleX,
  Pause,
  Play,
  MapPin,
  BadgeCheck,
  TrendingUp,
  Landmark,
  Layers,
  ServerCog,
  Plug,
  Database,
  Key,
  Cloud,
  Calendar,
  RefreshCw,
  Download,
  UserPlus,
  User,
  X,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const token = () => localStorage.getItem('av_token') ?? '';
async function apiFetch(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(opts.headers ?? {}) },
  });
  return r.json();
}

type User = {
  id: string;
  phone_number: string;
  role: string;
  full_name?: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
};

type Camp = {
  id: string;
  name: string;
  branch: string;
  location: string;
  is_active: boolean;
  total_customers: number;
  collection_rate: number;
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: '#0d1f3c',
  finance_officer: '#7c3aed',
  camp_officer: '#0d9488',
  sales_officer: '#d97706',
  customer: '#6b7280',
};

const NOTIFICATION_TEMPLATES = [
  { id: 'deduction_confirmed', name: 'Deduction Confirmed', channel: 'WhatsApp + SMS', template: 'Dear {name}, your AIRVOICE monthly installment of LKR {amount} has been deducted from your {month} salary at {camp}. Remaining: {remaining} months. Thank you. - AIRVOICE Finance' },
  { id: 'deduction_failed', name: 'Deduction Failed', channel: 'WhatsApp + SMS', template: 'Dear {name}, we were unable to process your AIRVOICE installment for {month}. Please contact your camp payroll officer or call AIRVOICE on +94 11 234 5678. Ref: {appId}.' },
  { id: 'application_approved', name: 'Application Approved', channel: 'WhatsApp + Email', template: 'Congratulations {name}! Your AIRVOICE phone application {appId} for {phone} has been approved. Your sales officer will contact you to arrange collection. Monthly installment: LKR {amount}.' },
  { id: 'guarantor_request', name: 'Guarantor Request', channel: 'WhatsApp + App', template: 'Dear Guarantor, {name} has listed you as guarantor for an AIRVOICE phone installment (LKR {amount}/month x {months} months). Please login to the AIRVOICE app to approve or decline. Ref: {appId}.' },
  { id: 'overdue_notice', name: 'Overdue Notice', channel: 'WhatsApp + SMS', template: 'Dear {name}, your AIRVOICE installment for {phone} (LKR {amount}) is overdue. Please contact your camp salary officer or call us on +94 11 234 5678 immediately to avoid further action.' },
];

const TABS = [
  { key: 'templates', Icon: MessageSquare, label: 'Message Templates' },
  { key: 'system', Icon: Server, label: 'System Info' },
] as const;

const USER_TABLE_HEADERS = [
  { label: 'Name / Phone', Icon: Contact },
  { label: 'Role', Icon: Shield },
  { label: 'Status', Icon: Activity },
  { label: 'Last Login', Icon: Clock },
  { label: 'Actions', Icon: Settings },
];

const SYSTEM_INFO_ICONS: Record<string, any> = {
  'System Version': Layers,
  'Environment': ServerCog,
  'API Endpoint': Plug,
  'Database': Database,
  'Auth Method': Key,
  'Storage': Cloud,
  'AI Engine': Bot,
  'Build Date': Calendar,
};

const MAINTENANCE_ACTIONS = [
  { label: 'Flush Cache', Icon: RefreshCw, color: '#1d4ed8', desc: 'Clear server-side query cache' },
  { label: 'Recalculate Risk Scores', Icon: Bot, color: '#7c3aed', desc: 'Re-run AI risk scoring for all customers' },
  { label: 'Export Audit Log', Icon: Download, color: '#16a34a', desc: 'Download complete audit trail as CSV' },
];

export default function SettingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'templates'|'system'>('templates');
  const [templates, setTemplates] = useState(NOTIFICATION_TEMPLATES);
  const [editTemplate, setEditTemplate] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ phone_number: '', role: 'camp_officer', full_name: '' });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => apiFetch('/api/users'),
  });

  const { data: campsData, isLoading: campsLoading } = useQuery({
    queryKey: ['camps-list'],
    queryFn: () => apiFetch('/api/camps'),
  });

  const updateUserMutation = useMutation({
    mutationFn: (payload: { id: string; is_active: boolean }) =>
      apiFetch(`/api/users/${payload.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: payload.is_active }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users-list'] }); showToast('User updated ✓'); },
  });

  const users: User[] = usersData?.data ?? [];
  const camps: Camp[] = campsData?.data ?? [];

  return (
    <div style={{ padding: 24, backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100%' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#0d1f3c', color: '#fff', padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CircleCheck size={16} color="#4ade80" />{toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Settings size={28} color="#2563ea" />
          System Settings
        </h1>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Notification templates, users, and camp configuration
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border-color)' }}>
        {TABS.map(({ key: t, Icon, label: l }) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: 'none', borderBottom: tab === t ? '2px solid #1d4ed8' : '2px solid transparent', background: 'none', fontWeight: tab === t ? 700 : 500, color: tab === t ? '#1d4ed8' : 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
          >
            <Icon size={15} /> {l}
          </button>
        ))}
      </div>


      {/* MESSAGE TEMPLATES */}
      {tab === 'templates' && (
        <div style={{ maxWidth: 800 }}>
          <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
            <Info size={18} color="#1d4ed8" />
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Templates support variables: <strong>{'{name}'}</strong> <strong>{'{amount}'}</strong> <strong>{'{camp}'}</strong> <strong>{'{month}'}</strong> <strong>{'{appId}'}</strong> <strong>{'{phone}'}</strong> <strong>{'{months}'}</strong> <strong>{'{remaining}'}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {templates.map(tmpl => {
              const isEditing = editTemplate === tmpl.id;
              const previewText = tmpl.template
                .replace(/\{name\}/g, 'Sgt. Karunaratne')
                .replace(/\{amount\}/g, '3,500')
                .replace(/\{camp\}/g, 'Colombo HQ')
                .replace(/\{month\}/g, new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }))
                .replace(/\{appId\}/g, 'AV-2025-00142')
                .replace(/\{phone\}/g, 'Samsung Galaxy A55')
                .replace(/\{months\}/g, '12')
                .replace(/\{remaining\}/g, '8');

              return (
                <div key={tmpl.id} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: isEditing ? '1px solid var(--border-color)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MessageCircle size={14} color="var(--text-muted)" />
                        {tmpl.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Send size={11} />{tmpl.channel}
                      </div>
                    </div>
                    <button
                      onClick={() => setEditTemplate(isEditing ? null : tmpl.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: isEditing ? 'var(--bg-surface-3)' : 'var(--bg-surface-2)', border: '1px solid var(--border-color)', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                      {isEditing ? <ChevronUp size={14} /> : <Pencil size={14} />}
                      {isEditing ? 'Close' : 'Edit'}
                    </button>
                  </div>
                  {isEditing ? (
                    <div style={{ padding: '16px', display: 'flex', gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Pencil size={11} />Template Text
                        </div>
                        <textarea
                          value={tmpl.template}
                          onChange={e => setTemplates(prev => prev.map(t => t.id === tmpl.id ? { ...t, template: e.target.value } : t))}
                          rows={6}
                          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--input-border)', borderRadius: 8, fontSize: 13, lineHeight: 1.7, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{tmpl.template.length} characters</div>
                          <button
                            onClick={() => { setEditTemplate(null); showToast(`"${tmpl.name}" template saved ✓`); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
                          >
                            <Save size={13} /> Save Template
                          </button>
                        </div>
                      </div>

                      <div style={{ width: 260, flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <MessagesSquare size={12} />WhatsApp Preview
                        </div>
                        <div style={{ background: '#e5ddd5', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
                          <div style={{ background: '#075e54', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13 }}>A</div>
                            <div>
                              <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>AIRVOICE</div>
                              <div style={{ color: '#a8d5b5', fontSize: 10 }}>Business Account</div>
                            </div>
                          </div>
                          <div style={{ padding: '12px 10px', minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h20v20H0zm20 20h20v20H20z' fill='rgba(0,0,0,0.04)'/%3E%3C/svg%3E\")" }}>
                            <div style={{
                              background: '#dcf8c6',
                              borderRadius: '12px 2px 12px 12px',
                              padding: '8px 12px',
                              maxWidth: '92%',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                              position: 'relative',
                            }}>
                              <div style={{ fontSize: 12, lineHeight: 1.6, color: '#111', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {previewText}
                              </div>
                              <div style={{ fontSize: 9.5, color: '#92a09f', textAlign: 'right', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                                {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M1 5L4.5 8.5L13 1" stroke="#4fc3f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  <path d="M5 5L8.5 8.5L13 1" stroke="#4fc3f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </div>
                            </div>
                          </div>
                        </div>
                        <p style={{ fontSize: 10.5, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
                          Preview uses sample values
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--text-secondary)', background: 'var(--bg-surface-2)', lineHeight: 1.6 }}>
                      {tmpl.template.slice(0, 120)}{tmpl.template.length > 120 ? '…' : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}



      {/* SYSTEM INFO */}
      {tab === 'system' && (
        <div style={{ maxWidth: 600 }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>System Information</div>
            </div>
            <div style={{ padding: '8px 0' }}>
              {[
                { label: 'System Version', value: 'AIRVOICE v3.0.0' },
                { label: 'Environment', value: import.meta.env.MODE },
                { label: 'API Endpoint', value: API },
                { label: 'Database', value: 'Supabase PostgreSQL' },
                { label: 'Auth Method', value: 'JWT Bearer Token' },
                { label: 'Storage', value: 'Supabase Storage' },
                { label: 'AI Engine', value: 'Anthropic Claude (Optional)' },
                { label: 'Build Date', value: new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) },
              ].map(item => {
                const Icon = SYSTEM_INFO_ICONS[item.label] ?? Info;
                return (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon size={14} color="var(--text-muted)" />
                      {item.label}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: item.label.includes('Endpoint') || item.label.includes('Version') ? 'JetBrains Mono, monospace' : 'inherit' }}>{item.value}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 12, marginTop: 14, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Maintenance Actions</div>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {MAINTENANCE_ACTIONS.map(a => (
                <div key={a.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: '1px solid var(--border-color)', borderRadius: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: `${a.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <a.Icon size={15} color={a.color} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{a.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{a.desc}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => showToast(`${a.label} completed ✓`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: `${a.color}18`, border: `1px solid ${a.color}40`, borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: 'pointer', color: a.color }}
                  >
                    <a.Icon size={13} /> Run
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      {showAddUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 14, padding: 28, width: 440 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserPlus size={18} color="var(--text-muted)" />
                Invite New User
              </div>
              <button onClick={() => setShowAddUser(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={22} />
              </button>
            </div>
            {[
              { label: 'Full Name', key: 'full_name', placeholder: 'e.g. John Perera', type: 'text', Icon: User },
              { label: 'Phone / Email', key: 'phone_number', placeholder: '+94 7X XXX XXXX or email', type: 'text', Icon: Phone },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 }}>
                  <f.Icon size={12} color="var(--text-muted)" />{f.label}
                </label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={(newUser as any)[f.key]}
                  onChange={e => setNewUser(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--input-border)', borderRadius: 8, fontSize: 13, backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }}
                />
              </div>
            ))}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 }}>
                <Shield size={12} color="var(--text-muted)" />Role
              </label>
              <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))} style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--input-border)', borderRadius: 8, fontSize: 13, backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }}>
                <option value="camp_officer">Camp Officer</option>
                <option value="sales_officer">Sales Officer</option>
                <option value="finance_officer">Finance Officer</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddUser(false)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '9px 16px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-color)', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                <X size={14} />Cancel
              </button>
              <button
                onClick={() => { setShowAddUser(false); showToast(`Invitation sent to ${newUser.phone_number} ✓`); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
              >
                <Send size={14} /> Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}