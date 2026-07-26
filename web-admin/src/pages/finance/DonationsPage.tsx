import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { donationsApi } from '@/services/api';
import { Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

export default function DonationsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    completed_paid_phone_count: '',
    percentage: 3,
    chq_no: '',
    chq_amount: '',
    delivery: 'POST',
    sending_date: ''
  });

  const { data: donations, isLoading } = useQuery({
    queryKey: ['donations'],
    queryFn: async () => {
      const res = await donationsApi.list();
      return res.data;
    }
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => donationsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donations'] });
      setIsModalOpen(false);
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        completed_paid_phone_count: '',
        percentage: 3,
        chq_no: '',
        chq_amount: '',
        delivery: 'POST',
        sending_date: ''
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => donationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donations'] });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      completed_paid_phone_count: parseInt(formData.completed_paid_phone_count.toString(), 10),
      percentage: parseFloat(formData.percentage.toString()),
      chq_amount: formData.chq_amount ? parseFloat(formData.chq_amount.toString()) : undefined,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-black text-base-primary">Donations</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Item
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="surface-2 border-b border-base text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 font-semibold text-base-secondary">DATE</th>
              <th className="px-4 py-3 font-semibold text-base-secondary">6 MONTH COMPLETED PAID PHONE COUNT</th>
              <th className="px-4 py-3 font-semibold text-base-secondary">PERCENTAGE</th>
              <th className="px-4 py-3 font-semibold text-base-secondary">CHQ NO</th>
              <th className="px-4 py-3 font-semibold text-base-secondary">CHQ AMOUNT</th>
              <th className="px-4 py-3 font-semibold text-base-secondary">DELIVERY</th>
              <th className="px-4 py-3 font-semibold text-base-secondary">SENDING DATE</th>
              <th className="px-4 py-3 font-semibold text-base-secondary">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-base" style={{ borderColor: 'var(--border-color)' }}>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-center text-base-muted">Loading...</td>
              </tr>
            ) : donations?.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-center text-base-muted">No donations found.</td>
              </tr>
            ) : (
              donations?.map((item: any) => (
                <tr key={item.id} className="hover:bg-[var(--bg-surface-2)]">
                  <td className="px-4 py-3">{item.date}</td>
                  <td className="px-4 py-3">{item.completed_paid_phone_count}</td>
                  <td className="px-4 py-3">{item.percentage}%</td>
                  <td className="px-4 py-3">{item.chq_no || '-'}</td>
                  <td className="px-4 py-3">{item.chq_amount || '-'}</td>
                  <td className="px-4 py-3">{item.delivery?.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">{item.sending_date || '-'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        if (window.confirm('Are you sure you want to delete this?')) {
                          deleteMutation.mutate(item.id);
                        }
                      }}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="surface rounded-xl border border-base shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4 text-base-primary">Add Donation Item</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div>
                <label className="block text-sm font-medium text-base-secondary mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="form-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-base-secondary mb-1">6 Month Completed Paid Phone Count</label>
                <input
                  type="number"
                  required
                  value={formData.completed_paid_phone_count}
                  onChange={(e) => setFormData({ ...formData, completed_paid_phone_count: e.target.value })}
                  className="form-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-base-secondary mb-1">Percentage</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={formData.percentage}
                    onChange={(e) => setFormData({ ...formData, percentage: parseFloat(e.target.value) })}
                    className="form-input pr-8"
                  />
                  <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-base-muted pointer-events-none">%</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-base-secondary mb-1">CHQ NO</label>
                <input
                  type="text"
                  value={formData.chq_no}
                  onChange={(e) => setFormData({ ...formData, chq_no: e.target.value })}
                  className="form-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-base-secondary mb-1">CHQ Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.chq_amount}
                  onChange={(e) => setFormData({ ...formData, chq_amount: e.target.value })}
                  className="form-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-base-secondary mb-1">Delivery</label>
                <select
                  value={formData.delivery}
                  onChange={(e) => setFormData({ ...formData, delivery: e.target.value })}
                  className="form-input"
                >
                  <option value="POST">POST</option>
                  <option value="COURIER">COURIER</option>
                  <option value="OFFICE_COLLECT">OFFICE COLLECT</option>
                  <option value="CAMP_HAND_OVER">CAMP HAND OVER</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-base-secondary mb-1">Sending Date</label>
                <input
                  type="date"
                  value={formData.sending_date}
                  onChange={(e) => setFormData({ ...formData, sending_date: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="btn bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {createMutation.isPending ? 'Saving...' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
