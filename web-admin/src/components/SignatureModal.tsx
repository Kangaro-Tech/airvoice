import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { X, Loader2, RotateCcw, Download } from 'lucide-react';

interface SignatureModalProps {
  title: string;
  onClose: () => void;
  onSave: (signatureData: string) => void;
  isPending?: boolean;
}

export default function SignatureModal({ title, onClose, onSave, isPending = false }: SignatureModalProps) {
  const canvasRef = useRef<any>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const handleClear = () => {
    if (canvasRef.current) {
      canvasRef.current.clear();
      setIsEmpty(true);
    }
  };

  const handleSave = () => {
    if (!canvasRef.current || isEmpty) {
      alert('Please draw a signature first');
      return;
    }
    const signatureData = canvasRef.current.toDataURL('image/png');
    onSave(signatureData);
  };

  const handleEndStroke = () => {
    if (canvasRef.current && !canvasRef.current.isEmpty()) {
      setIsEmpty(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            disabled={isPending}
          >
            <X size={20} />
          </button>
        </div>

        {/* Canvas Area */}
        <div className="p-4">
          <div className="border-2 border-slate-300 rounded-lg bg-white overflow-hidden">
            <SignatureCanvas
              ref={canvasRef}
              penColor="black"
              canvasProps={{
                width: 400,
                height: 200,
                className: 'border-0',
                style: { display: 'block', cursor: 'crosshair' }
              }}
              onEnd={handleEndStroke}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2 text-center">
            Draw your signature above using mouse or touchpad
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 p-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={handleClear}
            disabled={isEmpty || isPending}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            <RotateCcw size={16} />
            Clear
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isEmpty || isPending}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isPending && <Loader2 size={16} className="animate-spin" />}
            {isPending ? 'Saving...' : 'Save Signature'}
          </button>
        </div>
      </div>
    </div>
  );
}
