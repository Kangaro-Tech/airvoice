import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/services/api';
import { XCircle, Gift, Loader2 } from 'lucide-react';

interface SpecialApprovalRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  phoneModelId: string;
  termMonths: number;
  onSuccess: () => void;
}

export default function SpecialApprovalRequestModal({
  isOpen,
  onClose,
  customerId,
  customerName,
  phoneModelId,
  termMonths,
  onSuccess,
}: SpecialApprovalRequestModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const requestMutation = useMutation({
    mutationFn: (payload: { customer_id: string; phone_model_id: string; term_months: number; reason: string }) =>
      api.post('/applications/request-special-approval', payload),
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err?.response?.data?.error || 'Failed to submit request');
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (reason.trim().length < 10) {
      setError('Please provide a detailed justification (minimum 10 characters)');
      return;
    }
    requestMutation.mutate({
      customer_id: customerId,
      phone_model_id: phoneModelId,
      term_months: termMonths,
      reason,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-base">
          <h3 className="font-bold text-base-primary flex items-center gap-2">
            <Gift size={18} className="text-amber-500" /> Request Special Approval
          </h3>
          <button onClick={onClose} className="text-base-muted hover:text-gray-600">
            <XCircle size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-xs text-amber-800">
              This customer is currently ineligible for a standard plan (has 2 or more active plans). Your request will be sent to the admin and super admin team for review.
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Customer</label>
              <input
                type="text"
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm surface-2 text-gray-600 focus:outline-none"
                value={customerName}
                disabled
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Justification / Reason</label>
              <textarea
                rows={4}
                className="w-full border border-base rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                placeholder="Explain why this customer should be allowed an additional device (e.g., high-ranking officer, excellent repayment history)..."
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </div>

            {error && <div className="text-xs text-red-600 font-semibold">{error}</div>}
          </div>
          <div className="px-6 pb-5 flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-base rounded-lg text-sm font-medium hover:bg-[var(--bg-surface-2)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={requestMutation.isPending || reason.trim().length < 10}
              className="px-5 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {requestMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              {requestMutation.isPending ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
