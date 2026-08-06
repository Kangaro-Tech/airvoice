import { useState, useRef, useEffect } from 'react';
import { LifeBuoy, ExternalLink, Loader2 } from 'lucide-react';

// Dev: help-center dev server on port 5174
// Prod: served under /help/ by nginx proxy
const HELP_CENTER_URL =
  import.meta.env.VITE_HELP_CENTER_URL ||
  (import.meta.env.DEV ? 'http://localhost:5174' : '/help/');

export default function HelpCenterPage() {
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sendAuthToken = () => {
    const token = localStorage.getItem('av_token');
    if (token && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'AUTH_TOKEN', token }, '*');
    }
  }

  useEffect(() => {
    const handleLanguageChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      const newLang = customEvent.detail?.language || localStorage.getItem('app-language') || 'en';
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'LANGUAGE_CHANGE', language: newLang }, '*');
      }
    };

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'HELP_CENTER_READY') {
        sendAuthToken();
      }
    };

    window.addEventListener('languageChange', handleLanguageChange);
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('languageChange', handleLanguageChange);
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleIframeLoad = () => {
    setLoading(false);
    const lang = localStorage.getItem('app-language') || 'en';
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'LANGUAGE_CHANGE', language: lang }, '*');
      sendAuthToken();
      setTimeout(sendAuthToken, 250);
    }
  };

  return (
    <div className="help-center-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* ── Header bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px',
          borderBottom: '1px solid var(--border, #e2e8f0)',
          background: 'var(--card-bg, #fff)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LifeBuoy size={20} style={{ color: 'var(--primary, #6366f1)' }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>Help Center</span>
          <span
            style={{
              fontSize: 11,
              background: 'var(--primary, #6366f1)',
              color: '#fff',
              borderRadius: 20,
              padding: '2px 8px',
              fontWeight: 500,
            }}
          >
            AI Support
          </span>
        </div>

        {/* Open in new tab */}
        <a
          href={HELP_CENTER_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in new tab"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 13,
            color: 'var(--muted, #64748b)',
            textDecoration: 'none',
          }}
        >
          <ExternalLink size={14} />
          Open in new tab
        </a>
      </div>

      {/* ── Loading overlay ── */}
      {loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            gap: 12,
            color: 'var(--muted, #64748b)',
          }}
        >
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Loading Help Center…</span>
        </div>
      )}

      {/* ── Iframe ── */}
      <iframe
        ref={iframeRef}
        src={HELP_CENTER_URL}
        title="AirVoice Help Center"
        onLoad={handleIframeLoad}
        style={{
          flex: 1,
          width: '100%',
          border: 'none',
          display: loading ? 'none' : 'block',
          minHeight: 0,
        }}
        allow="clipboard-write"
      />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
