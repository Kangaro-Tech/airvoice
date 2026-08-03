import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chequeApi } from '@/services/api';
import { amountToWords, formatAmountFigures, formatDate } from '@/utils/numberToWords';
import {
  Printer, Settings, History, Plus, Trash2, Copy, Save,
  RotateCcw, Search, X, AlertCircle, CheckCircle2
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────

interface FieldConfig {
  label: string;
  xMm: number;
  yMm: number;
  fontSizePt: number;
  letterSpacingMm: number;
  bold: boolean;
  visible: boolean;
  format?: string;
  maxChars?: number;
  prefix?: string;
  useCommas?: boolean;
  securityAsterisks?: boolean;
  decimalPlaces?: number;
}

interface FieldsJson {
  date: FieldConfig;
  payee: FieldConfig;
  amountWordsLine1: FieldConfig;
  amountWordsLine2: FieldConfig;
  amountFigures: FieldConfig;
  accountPayeeOnly: FieldConfig;
  memo: FieldConfig;
}

interface BankTemplate {
  id: string;
  name: string;
  cheque_width_mm: number;
  cheque_height_mm: number;
  fields_json: FieldsJson;
  is_global_default: boolean;
  user_id: string | null;
}

interface PrintHistoryEntry {
  id: string;
  bank_name: string;
  cheque_no?: string;
  cheque_date?: string;
  payee: string;
  amount: number;
  amount_words?: string;
  memo?: string;
  ac_payee_only: boolean;
  printed_at: string;
}

interface FormValues {
  chequeNo: string;
  date: string;
  payee: string;
  amount: string;
  memo: string;
  acPayeeOnly: boolean;
}

type Tab = 'print' | 'calibrate' | 'history';
const FIELD_ORDER: (keyof FieldsJson)[] = [
  'date', 'payee', 'amountFigures',
  'amountWordsLine1', 'amountWordsLine2',
  'accountPayeeOnly', 'memo',
];

// ── Default base fields ────────────────────────────────────────────────

function makeBaseFields(): FieldsJson {
  return {
    date:             { label: 'Date',                    xMm: 148, yMm: 10, fontSizePt: 11,  letterSpacingMm: 2.6, bold: false, visible: true,  format: 'DD/MM/YYYY' },
    payee:            { label: 'Pay',                     xMm: 22,  yMm: 30, fontSizePt: 12,  letterSpacingMm: 0,   bold: false, visible: true  },
    amountWordsLine1: { label: 'Amount in words (line 1)',xMm: 12,  yMm: 42, fontSizePt: 10.5,letterSpacingMm: 0,   bold: false, visible: true,  maxChars: 62 },
    amountWordsLine2: { label: 'Amount in words (line 2)',xMm: 12,  yMm: 49, fontSizePt: 10.5,letterSpacingMm: 0,   bold: false, visible: true  },
    amountFigures:    { label: 'Amount in figures',       xMm: 150, yMm: 30, fontSizePt: 12,  letterSpacingMm: 0,   bold: true,  visible: true,  prefix: 'Rs.', useCommas: true, securityAsterisks: true, decimalPlaces: 2 },
    accountPayeeOnly: { label: 'A/C Payee Only',          xMm: 22,  yMm: 20, fontSizePt: 9,   letterSpacingMm: 0,   bold: false, visible: false },
    memo:             { label: 'Memo / For',              xMm: 12,  yMm: 70, fontSizePt: 9,   letterSpacingMm: 0,   bold: false, visible: false },
  };
}

// ── Split amount words to two lines ───────────────────────────────────

function splitWords(words: string, maxChars = 62): [string, string] {
  if (words.length <= maxChars) return [words, ''];
  const tokens = words.split(' ');
  let line1 = '';
  let i = 0;
  for (; i < tokens.length; i++) {
    const candidate = line1 ? `${line1} ${tokens[i]}` : tokens[i];
    if (candidate.length > maxChars) break;
    line1 = candidate;
  }
  return [line1, tokens.slice(i).join(' ')];
}

// ── Sample text for calibration ───────────────────────────────────────

function sampleText(key: keyof FieldsJson, f: FieldConfig): string {
  switch (key) {
    case 'date':             return formatDate('2026-07-08', f.format);
    case 'payee':            return 'JOHN A. PERERA';
    case 'amountWordsLine1': return 'RUPEES ONE HUNDRED THOUSAND, FOUR HUNDRED AND';
    case 'amountWordsLine2': return 'THIRTY AND CENTS FIFTY ONLY';
    case 'amountFigures':    return formatAmountFigures(100430.5, f);
    case 'accountPayeeOnly': return 'A/C PAYEE ONLY';
    case 'memo':             return 'Invoice #4521';
    default:                 return f.label;
  }
}

// ── Cheque Leaf Component ─────────────────────────────────────────────

interface ChequeLeafProps {
  bank: BankTemplate;
  values?: Record<string, string>;
  calibrate?: boolean;
  onFieldDrag?: (key: keyof FieldsJson, xMm: number, yMm: number) => void;
  scale?: number;
}

function ChequeLeaf({ bank, values, calibrate, onFieldDrag, scale = 1 }: ChequeLeafProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { cheque_width_mm: W, cheque_height_mm: H, fields_json: fields } = bank;

  function handleMouseDown(key: keyof FieldsJson, e: React.MouseEvent) {
    if (!calibrate || !onFieldDrag) return;
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect   = container.getBoundingClientRect();
    const pxPerMmX = rect.width  / W;
    const pxPerMmY = rect.height / H;
    const startX  = e.clientX;
    const startY  = e.clientY;
    const origX   = fields[key].xMm;
    const origY   = fields[key].yMm;

    function onMove(ev: MouseEvent) {
      const nx = Math.max(0, Math.round((origX + (ev.clientX - startX) / pxPerMmX) * 10) / 10);
      const ny = Math.max(0, Math.round((origY + (ev.clientY - startY) / pxPerMmY) * 10) / 10);
      onFieldDrag!(key, nx, ny);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width:  `${W}mm`,
        height: `${H}mm`,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        background: '#fbfaf3',
        border: '1px solid #b7c2bc',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        backgroundImage: 'linear-gradient(135deg,rgba(15,92,63,.04) 25%,transparent 25%),linear-gradient(315deg,rgba(15,92,63,.04) 25%,transparent 25%)',
        backgroundSize: '16px 16px',
      }}
    >
      {FIELD_ORDER.map(key => {
        const f = fields[key];
        if (!f) return null;
        if (!f.visible && !calibrate) return null;

        const text = values?.[key] ?? (calibrate ? sampleText(key, f) : '');
        const isPlaceholder = !values?.[key] && calibrate;

        return (
          <div
            key={key}
            onMouseDown={calibrate ? (e) => handleMouseDown(key, e) : undefined}
            style={{
              position: 'absolute',
              left: `${f.xMm}mm`,
              top: `${f.yMm}mm`,
              fontSize: `${f.fontSizePt}pt`,
              letterSpacing: `${f.letterSpacingMm ?? 0}mm`,
              fontWeight: f.bold ? 700 : 400,
              fontFamily: '"Courier New", monospace',
              whiteSpace: 'pre',
              color: isPlaceholder ? '#9aa39d' : '#10201a',
              fontStyle: isPlaceholder ? 'italic' : 'normal',
              opacity: calibrate && !f.visible ? 0.35 : 1,
              cursor: calibrate ? 'move' : 'default',
              outline: calibrate ? '1px dashed #4c8c74' : 'none',
              background: calibrate ? 'rgba(15,92,63,0.06)' : 'transparent',
              padding: calibrate ? '1px 3px' : 0,
              userSelect: 'none',
            }}
          >
            {text}
            {calibrate && (
              <span style={{
                position: 'absolute', top: -14, left: 0,
                fontSize: 9, fontFamily: 'sans-serif', fontWeight: 600,
                letterSpacing: 'normal',
                background: '#0a3f2b', color: '#fff',
                padding: '1px 4px', borderRadius: 3,
                whiteSpace: 'nowrap',
              }}>
                {f.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function ChequePrinterPage() {
  const qc = useQueryClient();

  const [activeTab, setActiveTab]         = useState<Tab>('print');
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [form, setForm]                   = useState<FormValues>({
    chequeNo: '', date: new Date().toISOString().slice(0, 10),
    payee: '', amount: '', memo: '', acPayeeOnly: false,
  });
  const [historySearch, setHistorySearch] = useState('');
  const [toast, setToast]                 = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────

  const { data: banksData, isLoading: banksLoading } = useQuery({
    queryKey: ['cheque-banks'],
    queryFn: () => chequeApi.listBanks().then(r => r.data.data as BankTemplate[]),
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['cheque-history', historySearch],
    queryFn: () => chequeApi.listHistory({ search: historySearch || undefined }).then(r => r.data),
    enabled: activeTab === 'history',
  });

  const banks = banksData ?? [];
  const historyItems: PrintHistoryEntry[] = historyData?.data ?? [];

  // Select first bank once loaded
  useEffect(() => {
    if (banks.length > 0 && !selectedBankId) {
      setSelectedBankId(banks[0].id);
    }
  }, [banks, selectedBankId]);

  const currentBank = banks.find(b => b.id === selectedBankId);

  // Local editable copy for calibration
  const [calibFields, setCalibFields] = useState<FieldsJson | null>(null);
  const [calibW, setCalibW]           = useState(190);
  const [calibH, setCalibH]           = useState(85);

  useEffect(() => {
    if (currentBank) {
      setCalibFields(JSON.parse(JSON.stringify(currentBank.fields_json)));
      setCalibW(currentBank.cheque_width_mm);
      setCalibH(currentBank.cheque_height_mm);
    }
  }, [currentBank?.id]);

  // ── Computed cheque values ─────────────────────────────────────────

  const computedValues = useCallback((): Record<string, string> => {
    if (!currentBank) return {};
    const amt = parseFloat(form.amount);
    const words = !isNaN(amt) && amt > 0 ? amountToWords(amt) : '';
    const [line1, line2] = splitWords(words, currentBank.fields_json.amountWordsLine1?.maxChars ?? 62);
    return {
      date:             formatDate(form.date, currentBank.fields_json.date.format),
      payee:            form.payee,
      amountWordsLine1: line1,
      amountWordsLine2: line2,
      amountFigures:    !isNaN(amt) && amt > 0 ? formatAmountFigures(amt, currentBank.fields_json.amountFigures) : '',
      accountPayeeOnly: form.acPayeeOnly ? 'A/C PAYEE ONLY' : '',
      memo:             form.memo,
    };
  }, [form, currentBank]);

  const amtWords = useCallback(() => {
    const amt = parseFloat(form.amount);
    return !isNaN(amt) && amt > 0 ? amountToWords(amt) : '';
  }, [form.amount]);

  // ── Mutations ──────────────────────────────────────────────────────

  const recordPrintMutation = useMutation({
    mutationFn: (data: unknown) => chequeApi.recordPrint(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cheque-history'] }),
  });

  const saveBankMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => chequeApi.updateBank(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cheque-banks'] });
      showToast('success', 'Template saved successfully!');
    },
    onError: (e: unknown) => showToast('error', (e as Error).message),
  });

  const createBankMutation = useMutation({
    mutationFn: (data: unknown) => chequeApi.createBank(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['cheque-banks'] });
      setSelectedBankId(res.data.data.id);
      showToast('success', 'New bank template created!');
    },
    onError: (e: unknown) => showToast('error', (e as Error).message),
  });

  const deleteBankMutation = useMutation({
    mutationFn: (id: string) => chequeApi.deleteBank(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cheque-banks'] });
      showToast('success', 'Bank template deleted.');
    },
  });

  const deleteHistoryMutation = useMutation({
    mutationFn: (id: string) => chequeApi.deleteHistory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cheque-history'] }),
  });

  const clearHistoryMutation = useMutation({
    mutationFn: () => chequeApi.clearHistory(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cheque-history'] }),
  });

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Handlers ───────────────────────────────────────────────────────

  function handlePrint() {
    if (!currentBank) return;
    const amt = parseFloat(form.amount);
    if (!form.payee.trim()) { showToast('error', 'Please enter the payee name.'); return; }
    if (isNaN(amt) || amt <= 0) { showToast('error', 'Please enter a valid amount.'); return; }

    // Trigger browser print
    window.print();

    // Record in DB
    recordPrintMutation.mutate({
      bank_template_id: currentBank.is_global_default ? undefined : currentBank.id,
      bank_name:    currentBank.name,
      cheque_no:    form.chequeNo || undefined,
      cheque_date:  form.date || undefined,
      payee:        form.payee,
      amount:       amt,
      amount_words: amtWords(),
      memo:         form.memo || undefined,
      ac_payee_only: form.acPayeeOnly,
    });
  }

  function handleSaveCalibration() {
    if (!currentBank || !calibFields) return;
    if (currentBank.is_global_default) {
      // Duplicate as user's own copy
      createBankMutation.mutate({
        name:             currentBank.name + ' (Custom)',
        cheque_width_mm:  calibW,
        cheque_height_mm: calibH,
        fields_json:      calibFields,
      });
    } else {
      saveBankMutation.mutate({
        id: currentBank.id,
        data: { cheque_width_mm: calibW, cheque_height_mm: calibH, fields_json: calibFields },
      });
    }
  }

  function handleDuplicateBank() {
    if (!currentBank || !calibFields) return;
    const newName = `${currentBank.name} (Copy)`;
    createBankMutation.mutate({
      name:             newName,
      cheque_width_mm:  calibW,
      cheque_height_mm: calibH,
      fields_json:      calibFields,
    });
  }

  function handleDeleteBank() {
    if (!currentBank || currentBank.is_global_default) return;
    if (!confirm(`Delete "${currentBank.name}" template? This cannot be undone.`)) return;
    deleteBankMutation.mutate(currentBank.id);
    setSelectedBankId(banks[0]?.id ?? '');
  }

  function handleResetCalibration() {
    if (!confirm('Reset to default field positions?')) return;
    setCalibFields(makeBaseFields());
    setCalibW(190);
    setCalibH(85);
  }

  function handleFieldDrag(key: keyof FieldsJson, xMm: number, yMm: number) {
    setCalibFields(prev => {
      if (!prev) return prev;
      return { ...prev, [key]: { ...prev[key], xMm, yMm } };
    });
  }

  function updateCalibField<K extends keyof FieldConfig>(
    key: keyof FieldsJson,
    prop: K,
    value: FieldConfig[K]
  ) {
    setCalibFields(prev => {
      if (!prev) return prev;
      return { ...prev, [key]: { ...prev[key], [prop]: value } };
    });
  }

  // ── Calibrate bank preview ─────────────────────────────────────────

  const calibBankPreview: BankTemplate | null = calibFields && currentBank
    ? { ...currentBank, fields_json: calibFields, cheque_width_mm: calibW, cheque_height_mm: calibH }
    : null;

  // ── Scale factor for preview (fits 190mm cheque in ~400px container) ─
  const previewScale = 400 / (currentBank?.cheque_width_mm ?? 190) / 3.7795;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      {/* Print portal — rendered directly under <body> so print CSS can target it */}
      {currentBank && createPortal(
        <>
          <style>{`
            @media screen { #cheque-print-portal { display: none !important; } }
            @media print {
              body > *:not(#cheque-print-portal) { display: none !important; visibility: hidden !important; }
              #cheque-print-portal {
                display: block !important;
                visibility: visible !important;
                position: fixed !important;
                left: 0 !important; top: 0 !important;
                margin: 0 !important; padding: 0 !important;
                background: transparent !important;
              }
              #cheque-print-portal * { display: block !important; visibility: visible !important; }
              @page { size: ${currentBank.cheque_width_mm}mm ${currentBank.cheque_height_mm}mm; margin: 0; }
            }
          `}</style>
          <div id="cheque-print-portal">
            <ChequeLeaf bank={currentBank} values={computedValues()} scale={1} />
          </div>
        </>,
        document.body
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Printer size={28} className="text-[#2563ea]" />
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Cheque Printer</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Print cheques with precise field positioning for any Sri Lankan bank</p>
          </div>
        </div>
        {/* Bank Selector & Add Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const name = prompt('Enter new bank template name:');
              if (name && name.trim()) {
                createBankMutation.mutate({
                  name: name.trim(),
                  cheque_width_mm: 190,
                  cheque_height_mm: 85,
                  fields_json: makeBaseFields()
                });
              }
            }}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={15}/> Add Bank
          </button>
          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Bank</label>
          {banksLoading ? (
            <div className="w-56 h-9 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--bg-surface-2)' }} />
          ) : (
            <select
              value={selectedBankId}
              onChange={e => setSelectedBankId(e.target.value)}
              className="form-input w-64 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <optgroup label="Global Defaults">
                {banks.filter(b => b.is_global_default).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </optgroup>
              {banks.some(b => !b.is_global_default) && (
                <optgroup label="My Custom Templates">
                  {banks.filter(b => !b.is_global_default).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border-color)' }}>
        {([
          { key: 'print',     label: 'Print Cheque',      icon: <Printer size={15}/> },
          { key: 'calibrate', label: 'Calibrate Template', icon: <Settings size={15}/> },
          { key: 'history',   label: 'History',            icon: <History size={15}/> },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent hover:text-blue-600'
            }`}
            style={{ color: activeTab === t.key ? '#2563eb' : 'var(--text-secondary)' }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── PRINT TAB ─────────────────────────────────────────── */}
      {activeTab === 'print' && (
<div className="grid grid-cols-[380px_1fr] gap-6 items-start">
          {/* Form */}
          <div className="card p-6 space-y-4">
            <h2 className="text-base font-semibold text-base-primary mb-2">Cheque Details</h2>

            <div>
              <label className="block text-xs font-semibold text-base-secondary mb-1">
                Cheque No. <span className="font-normal text-base-muted">(as printed on leaf)</span>
              </label>
              <input
                type="text"
                value={form.chequeNo}
                onChange={e => setForm(f => ({ ...f, chequeNo: e.target.value }))}
                placeholder="000123"
                className="w-full border border-base rounded-lg px-3 py-2 text-sm surface text-base-primary focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-base-secondary mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm surface text-base-primary focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-base-secondary mb-1">Pay To (Payee Name)</label>
              <input
                type="text"
                value={form.payee}
                onChange={e => setForm(f => ({ ...f, payee: e.target.value }))}
                placeholder="e.g. John Perera"
                className="w-full border border-base rounded-lg px-3 py-2 text-sm surface text-base-primary focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-base-secondary mb-1">Amount (LKR)</label>
              <input
                type="number"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                min={0}
                step="0.01"
                placeholder="e.g. 12500.50"
                className="w-full border border-base rounded-lg px-3 py-2 text-sm surface text-base-primary focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              {amtWords() && (
                <div className="mt-1.5 px-3 py-2 surface-2 border border-dashed border-base rounded-lg text-xs italic text-base-secondary leading-relaxed">
                  {amtWords()}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-base-secondary mb-1">
                Memo / For <span className="font-normal text-base-muted">(optional)</span>
              </label>
              <input
                type="text"
                value={form.memo}
                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                placeholder="e.g. Invoice #4521"
                className="w-full border border-base rounded-lg px-3 py-2 text-sm surface text-base-primary focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="acPayeeOnly"
                checked={form.acPayeeOnly}
                onChange={e => setForm(f => ({ ...f, acPayeeOnly: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="acPayeeOnly" className="text-sm text-base-secondary">Stamp "A/C Payee Only"</label>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Printer size={15}/> Print Cheque
              </button>
              <button
                onClick={() => setForm({ chequeNo:'',date:new Date().toISOString().slice(0,10),payee:'',amount:'',memo:'',acPayeeOnly:false })}
                className="px-3 py-2 text-sm text-base-secondary border border-base rounded-lg hover:bg-[var(--bg-surface-2)] transition-colors"
              >
                <X size={14} className="inline mr-1"/>Clear
              </button>
            </div>

            <p className="text-xs text-base-muted leading-relaxed">
              First time with this bank? Go to <strong>Calibrate Template</strong> to drag each field to match your cheque leaf.
            </p>
          </div>

          {/* Live Preview */}
          <div className="card p-6">
            <h2 className="text-base font-semibold text-base-primary mb-4">Live Preview</h2>
            <div className="overflow-auto surface-2 rounded-xl p-4 min-h-[300px] flex items-center justify-center">
              {currentBank ? (
                <div style={{ width: `${currentBank.cheque_width_mm * previewScale * 3.7795}px`, height: `${currentBank.cheque_height_mm * previewScale * 3.7795}px`, overflow: 'hidden' }}>
                  <ChequeLeaf bank={currentBank} values={computedValues()} scale={previewScale} />
                </div>
              ) : (
                <div className="text-base-muted text-sm">Select a bank to see preview</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CALIBRATE TAB ────────────────────────────────────── */}
      {activeTab === 'calibrate' && calibBankPreview && (
        <div className="grid grid-cols-[380px_1fr] gap-6 items-start">
          {/* Field editors */}
          <div className="card p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-base-primary">
              Template: <span className="text-amber-600">{currentBank?.name}</span>
              {currentBank?.is_global_default && (
                <span className="ml-2 text-xs font-normal text-base-muted surface-2 px-2 py-0.5 rounded-full">Global Default</span>
              )}
            </h2>

            {/* Cheque size */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Width (mm)</label>
                <input type="number" value={calibW} min={100} max={260} step={0.5}
                  onChange={e => setCalibW(parseFloat(e.target.value) || 190)}
                  className="w-full border border-base rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Height (mm)</label>
                <input type="number" value={calibH} min={50} max={140} step={0.5}
                  onChange={e => setCalibH(parseFloat(e.target.value) || 85)}
                  className="w-full border border-base rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>

            {/* Per-field editors */}
            {calibFields && FIELD_ORDER.map(key => {
              const f = calibFields[key];
              return (
                <div key={key} className="border border-base rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-base-secondary">{f.label}</span>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={f.visible}
                        onChange={e => updateCalibField(key, 'visible', e.target.checked)}
                        className="rounded"
                      />
                      Visible
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {([ ['X (mm)', 'xMm'], ['Y (mm)', 'yMm'], ['Font (pt)', 'fontSizePt'] ] as const).map(([lbl, prop]) => (
                      <div key={prop}>
                        <label className="block text-base-muted mb-0.5">{lbl}</label>
                        <input type="number" step={0.1} value={(f as any)[prop] as number}
                          onChange={e => updateCalibField(key, prop as any, parseFloat(e.target.value) as any)}
                          className="w-full border border-base rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                      </div>
                    ))}
                  </div>

                  {key === 'date' && (
                    <div>
                      <label className="block text-xs text-base-muted mb-0.5">Format</label>
                      <input type="text" value={f.format ?? 'DD/MM/YYYY'}
                        onChange={e => updateCalibField(key, 'format', e.target.value)}
                        className="w-full border border-base rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    </div>
                  )}

                  {key === 'amountFigures' && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-base-muted mb-0.5">Prefix</label>
                        <input type="text" value={f.prefix ?? 'Rs.'}
                          onChange={e => updateCalibField(key, 'prefix', e.target.value)}
                          className="w-full border border-base rounded px-2 py-1 text-xs"
                        />
                      </div>
                      <label className="flex items-center gap-1 mt-4 cursor-pointer">
                        <input type="checkbox" checked={f.useCommas ?? true}
                          onChange={e => updateCalibField(key, 'useCommas', e.target.checked)} className="rounded"
                        />
                        Commas
                      </label>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              <button onClick={handleSaveCalibration}
                disabled={saveBankMutation.isPending || createBankMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Save size={14}/>
                {currentBank?.is_global_default ? 'Save as My Copy' : 'Save Template'}
              </button>
              <button onClick={handleDuplicateBank}
                className="flex items-center gap-1.5 px-3 py-2 surface-2 hover:bg-[var(--bg-surface-3)] text-base-secondary text-sm rounded-lg transition-colors"
              >
                <Copy size={14}/> Duplicate
              </button>
              <button onClick={handleResetCalibration}
                className="flex items-center gap-1.5 px-3 py-2 border border-base text-gray-600 text-sm rounded-lg hover:bg-[var(--bg-surface-2)] transition-colors"
              >
                <RotateCcw size={14}/> Reset
              </button>
              {!currentBank?.is_global_default && (
                <button onClick={handleDeleteBank}
                  className="flex items-center gap-1.5 px-3 py-2 text-red-600 text-sm rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14}/> Delete
                </button>
              )}
            </div>

            <p className="text-xs text-base-muted leading-relaxed">
              Drag fields on the preview to reposition, or type exact mm values above.
              Global templates cannot be edited directly — save creates your own copy.
            </p>
          </div>

          {/* Calibration preview */}
          <div className="card p-6">
            <h2 className="text-base font-semibold text-base-primary mb-4">Drag Fields to Position</h2>
            <div className="overflow-auto surface-2 rounded-xl p-4 flex items-center justify-center min-h-[300px]">
              <div style={{
                width: `${calibW * previewScale * 3.7795}px`,
                height: `${calibH * previewScale * 3.7795}px`,
                overflow: 'hidden'
              }}>
                <ChequeLeaf
                  bank={calibBankPreview}
                  calibrate
                  onFieldDrag={handleFieldDrag}
                  scale={previewScale}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ──────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative w-80">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted"/>
              <input
                type="text"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Search by payee, cheque no, or bank…"
                className="w-full border border-base rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <button
              onClick={() => {
                if (!confirm('Clear all printed-cheque history? This cannot be undone.')) return;
                clearHistoryMutation.mutate();
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14}/> Clear All
            </button>
          </div>

          <div className="card overflow-hidden">
            {historyLoading ? (
              <div className="px-6 py-12 text-center text-base-muted text-sm">Loading history…</div>
            ) : historyItems.length === 0 ? (
              <div className="px-6 py-12 text-center text-base-muted text-sm">No cheques printed yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="surface-2 border-b border-base">
                  <tr>
                    {['Printed On', 'Bank', 'Cheque No.', 'Date', 'Payee', 'Amount (LKR)', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-base-muted uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historyItems.map(h => (
                    <tr key={h.id} className="hover:bg-[var(--bg-surface-2)]">
                      <td className="px-4 py-3 text-xs text-base-muted">{new Date(h.printed_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-base-secondary">{h.bank_name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{h.cheque_no || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{h.cheque_date || '—'}</td>
                      <td className="px-4 py-3 font-medium">{h.payee}</td>
                      <td className="px-4 py-3 font-semibold">LKR {Number(h.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => deleteHistoryMutation.mutate(h.id)}
                          className="p-1.5 text-base-muted hover:text-red-500 transition-colors"
                          title="Delete entry"
                        >
                          <Trash2 size={14}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {historyData?.meta && historyData.meta.total > 0 && (
            <p className="text-xs text-base-muted text-right">{historyData.meta.total} total print records</p>
          )}
        </div>
      )}
    </div>
  );
}
