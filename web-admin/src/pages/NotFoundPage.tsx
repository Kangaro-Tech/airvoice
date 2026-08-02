import { useNavigate, useLocation } from 'react-router-dom';
import { Home, ArrowLeft, SearchX } from 'lucide-react';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6">
      <div className="text-center max-w-md mx-auto">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-28 h-28 rounded-full bg-blue-50 flex items-center justify-center">
              <SearchX size={52} className="text-[#2563ea] opacity-70" />
            </div>
            <div className="absolute -top-2 -right-2 w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center shadow-md">
              <span className="text-white font-black text-sm">!</span>
            </div>
          </div>
        </div>

        {/* 404 text */}
        <div className="text-8xl font-black text-gray-100 leading-none mb-2 select-none">404</div>

        <h1 className="text-2xl font-bold text-base-primary mb-2">Page Not Found</h1>
        <p className="text-base-muted text-sm mb-2">
          The page you are looking for does not exist or you do not have permission to view it.
        </p>
        <code className="text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg font-mono block mb-8 break-all">
          {location.pathname}
        </code>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-5 py-2.5 border border-base text-base-secondary rounded-xl hover:bg-[var(--bg-surface-2)] transition-colors text-sm font-semibold"
          >
            <ArrowLeft size={16} />
            Go Back
          </button>
          <button
            onClick={() => navigate('/dashboard', { replace: true })}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#2563ea] text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-semibold"
          >
            <Home size={16} />
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
