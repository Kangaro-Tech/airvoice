import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, XCircle } from 'lucide-react';

interface CameraModalProps {
  label: string;
  onClose: () => void;
  onCapture: (file: File) => void;
  /** Optional: pass 'environment' for rear camera (NIC scans), 'user' for selfie */
  facingMode?: 'user' | 'environment';
}

export default function CameraModal({ label, onClose, onCapture, facingMode = 'environment' }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    setReady(false);
    setError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera is not supported in this browser.');
      return;
    }

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })
      .then(s => {
        activeStream = s;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          const playVideo = () => {
            videoRef.current?.play().catch(err => {
              console.warn('Video play failed:', err);
            });
            setReady(true);
          };
          videoRef.current.onloadedmetadata = playVideo;
          if (videoRef.current.readyState >= 2) playVideo();
        }
      })
      .catch(err => {
        console.error('Webcam error:', err);
        setError('Could not access camera. Please check browser permissions.');
      });

    return () => {
      activeStream?.getTracks().forEach(t => t.stop());
    };
  }, [facingMode]);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width  = videoRef.current.videoWidth  || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror flip for selfie (front camera)
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (!blob) return;
      const filename = `${label.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.jpg`;
      const file = new File([blob], filename, { type: 'image/jpeg' });
      onCapture(file);
    }, 'image/jpeg', 0.95);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[70] p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-amber-400" />
            <h3 className="font-bold text-white text-sm">{label}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <XCircle size={20} />
          </button>
        </div>

        {/* Camera feed */}
        <div className="p-5 flex-1 flex flex-col items-center justify-center min-h-[320px] relative">
          {error ? (
            <p className="text-red-400 text-sm font-semibold text-center px-4 z-10">{error}</p>
          ) : (
            <div className={`relative w-full rounded-xl overflow-hidden bg-black border border-slate-700 ${ready ? 'block' : 'opacity-0 absolute pointer-events-none'}`} style={{ aspectRatio: '16/9' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
              />
              {/* Guide overlay for NIC */}
              {facingMode === 'environment' && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{ padding: '12% 8%' }}
                >
                  <div
                    className="w-full h-full rounded-xl"
                    style={{
                      border: '2.5px solid rgba(251,191,36,0.7)',
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
                      borderRadius: 8,
                    }}
                  />
                </div>
              )}
            </div>
          )}
          
          {!error && !ready && (
            <div className="flex flex-col items-center justify-center gap-2 text-slate-400 absolute inset-0 z-10">
              <Loader2 className="animate-spin text-amber-400" size={28} />
              <p className="text-xs">Initializing camera…</p>
            </div>
          )}

          {!error && ready && (
            <p className="text-xs text-slate-400 mt-3 text-center">
              {facingMode === 'environment'
                ? 'Align the NIC card inside the frame, then capture.'
                : 'Look directly at the camera and capture your selfie.'}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-2 flex justify-between gap-3 border-t border-slate-800/50">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={capturePhoto}
            disabled={!ready}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors"
          >
            <Camera size={14} /> Capture Photo
          </button>
        </div>
      </div>
    </div>
  );
}
