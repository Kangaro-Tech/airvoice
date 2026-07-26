import React, { useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/services/api';
import { Camera, Loader2, Save } from 'lucide-react';

export default function MyProfilePage() {
  const user = useAuthStore(state => state.user);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ text: 'File too large. Max 5MB allowed.', type: 'error' });
      return;
    }
    
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handlePhotoUpload = async () => {
    if (!photoFile) return;
    
    setIsUploading(true);
    setMessage(null);
    try {
      const res = await authApi.uploadMePhoto(photoFile);
      if (res.data?.success && res.data.photo_url) {
        // Update the global store directly to avoid 401 on /me for email users
        useAuthStore.setState((state) => {
          if (state.user) {
            return { user: { ...state.user, profile_photo_url: res.data.photo_url } };
          }
          return state;
        });
        setPhotoFile(null);
        setPhotoPreview(null);
        setMessage({ text: 'Photo updated successfully!', type: 'success' });
      }
    } catch (err: any) {
      setMessage({ text: err.response?.data?.error || 'Failed to upload photo', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const displayPhoto = photoPreview || user?.profile_photo_url;
  const initials = user?.full_name
    ? user.full_name.charAt(0).toUpperCase()
    : (user?.phone_number?.slice(-2) || '?');

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>My Profile</h1>
      
      {message && (
        <div className={`p-4 rounded-lg mb-6 text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
          {message.text}
        </div>
      )}

      <div className="p-6 rounded-xl shadow-sm border mb-6" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Profile Photo</h2>
        
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="relative group">
            <div className="w-32 h-32 rounded-full overflow-hidden flex items-center justify-center text-4xl font-bold border-4" style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
              {displayPhoto ? (
                <img src={displayPhoto} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
          </div>
          
          <div className="flex flex-col gap-3 flex-1 w-full text-center md:text-left">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Upload a clear photo of yourself. JPEG, PNG, or WebP up to 5MB.
            </p>
            
            <input type="file" ref={fileInputRef} className="hidden" accept="image/jpeg, image/png, image/webp" onChange={handlePhotoSelect} />
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors text-sm font-medium"
                disabled={isUploading}
              >
                <Camera size={16} />
                Select Photo
              </button>
              
              {photoFile && (
                <button
                  onClick={handlePhotoUpload}
                  disabled={isUploading}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {isUploading ? 'Uploading...' : 'Save Photo'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-6 rounded-xl shadow-sm border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Account Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <label className="block mb-1 font-semibold" style={{ color: 'var(--text-muted)' }}>Name</label>
            <div className="p-2.5 rounded-lg border" style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
              {user?.full_name || 'Not set'}
            </div>
          </div>
          <div>
            <label className="block mb-1 font-semibold" style={{ color: 'var(--text-muted)' }}>Phone Number</label>
            <div className="p-2.5 rounded-lg border" style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
              {user?.phone_number || 'Not set'}
            </div>
          </div>
          <div>
            <label className="block mb-1 font-semibold" style={{ color: 'var(--text-muted)' }}>Role</label>
            <div className="p-2.5 rounded-lg border capitalize" style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
              {user?.role?.replace(/_/g, ' ') || 'Not set'}
            </div>
          </div>
          <div>
            <label className="block mb-1 font-semibold" style={{ color: 'var(--text-muted)' }}>Status</label>
            <div className="p-2.5 rounded-lg border" style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}>
              {user?.is_active ? (
                <span className="text-green-500 font-medium">Active</span>
              ) : (
                <span className="text-red-500 font-medium">Inactive</span>
              )}
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs italic" style={{ color: 'var(--text-muted)' }}>
          To update your account details, please contact your administrator.
        </p>
      </div>
    </div>
  );
}
