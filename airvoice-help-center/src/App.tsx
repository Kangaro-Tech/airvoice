import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import axios from 'axios'
import {
  IoSend,
  IoTrashOutline,
  IoCloudUploadOutline,
  IoPhonePortraitOutline,
  IoBusiness,
  IoCashOutline,
  IoPeopleOutline,
  IoWarningOutline,
  IoDownloadOutline,
  IoCalendarOutline,
  IoHelpCircleOutline,
  IoCheckmarkCircle,
  IoAlertCircleOutline,
  IoSparkles,
  IoChatbubbleEllipsesOutline,
  IoTimeOutline,
  IoShieldCheckmarkOutline,
  IoMenuOutline,
  IoCloseOutline,
} from 'react-icons/io5'
import { MdSupportAgent } from 'react-icons/md'

// ─── Types ───────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  error?: boolean
  timestamp: Date
}

// ─── FAQ quick-start topics (with react-icons) ────────────────────────────────
const FAQ_TOPICS = [
  { Icon: IoCloudUploadOutline, label: 'Uploads', text: 'How do I upload a Deduction Sheet?' },
  { Icon: IoCloudUploadOutline, label: 'Uploads', text: 'How do I upload a Unit Wise Summary?' },
  { Icon: IoPhonePortraitOutline, label: 'Sales', text: 'How do I add a new phone sale?' },
  { Icon: IoBusiness, label: 'Camps', text: 'How do I add or manage a camp?' },
  { Icon: IoCashOutline, label: 'Finance', text: 'How do company payment deductions work?' },
  { Icon: IoPeopleOutline, label: 'HR', text: 'How do I manage attendance records?' },
  { Icon: IoWarningOutline, label: 'Risk', text: 'What does a red flag on a customer mean?' },
  { Icon: IoDownloadOutline, label: 'Templates', text: 'How do I download the Excel template?' },
  { Icon: IoCalendarOutline, label: 'Reports', text: 'How do I generate a monthly report?' },
  { Icon: IoHelpCircleOutline, label: 'General', text: 'What can AirVoice help me with?' },
]

const CATEGORIES = ['All', 'Uploads', 'Sales', 'Camps', 'Finance', 'HR', 'Risk', 'Templates', 'Reports', 'General']

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2)

function formatTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n/g, '<br/>')
}

// ─── Component ───────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 60_000,
})

export default function App() {
  // Auth state
  const [user, setUser] = useState<{name: string, role: string} | null>(null)

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState('All')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  // Translation state
  const [language, setLanguage] = useState('en')
  const translationCache = useRef<Record<string, string>>({})

  const parseStoredAuth = (raw: string | null) => {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      const state = parsed.state ?? parsed
      return state.emailToken || state.idToken || null
    } catch {
      return null
    }
  }

  const getStoredToken = () => {
    const token = parseStoredAuth(localStorage.getItem('airvoice-auth')) || localStorage.getItem('av_token')
    if (token) return token

    try {
      const parentRaw = window.parent?.sessionStorage?.getItem('airvoice-auth')
      return parseStoredAuth(parentRaw)
    } catch {
      return null
    }
  }

  useEffect(() => {
    const restoreSession = async () => {
      const token = getStoredToken()
      if (!token) {
        return
      }

      try {
        const response = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        })

        const userData = response.data?.data
        if (userData?.role) {
          setUser({ name: userData.full_name || userData.email || 'Staff Member', role: userData.role })
          localStorage.setItem('av_token', token)
        }
      } catch (err) {
        console.warn('Help Center session restore failed', err)
      }
    }

    restoreSession()
  }, [])

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'LANGUAGE_CHANGE') {
        setLanguage(e.data.language)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  useEffect(() => {
    const translateNode = async (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        let originalText = (node as any)._originalText
        if (!originalText) {
          originalText = node.textContent?.trim()
          if (!originalText || originalText.length < 2) return
          (node as any)._originalText = originalText
        }

        const text = originalText

        if (/^\d+$/.test(text) || /^[LKR\s\d,.]+$/i.test(text) || text.length > 150) return

        if (language === 'en') {
          if (node.textContent !== text) node.textContent = text
          return
        }

        const cacheKey = `${language}:${text}`
        if (translationCache.current[cacheKey]) {
          node.textContent = translationCache.current[cacheKey]
          return
        }

        try {
          const apiKey = import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY
          if (!apiKey) return
          const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: text, target: language, source: 'en', format: 'text' })
          })
          const data = await res.json()
          if (data?.data?.translations?.[0]?.translatedText) {
            const decoded = (() => {
              const txt = document.createElement('textarea')
              txt.innerHTML = data.data.translations[0].translatedText
              return txt.value
            })()
            translationCache.current[cacheKey] = decoded
            node.textContent = decoded
          }
        } catch {
          // ignore
        }
        return
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element
        if (['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'CODE', 'PRE'].includes(el.tagName)) return
        Array.from(node.childNodes).forEach(translateNode)
      }
    }

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          translateNode(node)
        })
      })
    })

    translateNode(document.body)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [language])

  useEffect(() => {
    const restoreSession = async () => {
      const token = getStoredToken()
      if (!token) {
        return
      }

      try {
        const response = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        })

        const userData = response.data?.data
        if (userData?.role) {
          setUser({ name: userData.full_name || userData.email || 'Staff Member', role: userData.role })
        }
      } catch (err) {
        console.warn('Help Center session restore failed', err)
      }
    }

    restoreSession()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`
  }, [input])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: ChatMessage = {
      id: uid(), role: 'user', content: trimmed, timestamp: new Date()
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const { data } = await api.post('/chat/', { message: trimmed, history })
      setMessages(prev => [...prev, {
        id: uid(), role: 'assistant', content: data.reply, timestamp: new Date()
      }])
    } catch (err: any) {
      console.error("Chat Error:", err);
      const apiError = err.response?.data?.error;
      const displayMsg = apiError 
        ? `⚠️ Error: ${apiError}`
        : '⚠️ Could not reach the AirVoice AI service. Make sure the API server is running.';
        
      setMessages(prev => [...prev, {
        id: uid(),
        role: 'assistant',
        content: displayMsg,
        error: true,
        timestamp: new Date()
      }])
    } finally {
      setLoading(false)
    }
  }, [messages, loading])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
    // Close sidebar on mobile after selecting a category
    if (window.innerWidth <= 768) {
      setSidebarOpen(false)
    }
  }

  const filteredTopics = category === 'All'
    ? FAQ_TOPICS
    : FAQ_TOPICS.filter(t => t.label === category)

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <button className="menu-btn" onClick={() => setSidebarOpen(p => !p)}>
            {sidebarOpen ? <IoCloseOutline size={22} /> : <IoMenuOutline size={22} />}
          </button>
          <div className="header-logo">
            <IoShieldCheckmarkOutline size={22} />
          </div>
          <div className="header-title">
            <h1>{import.meta.env.VITE_APP_NAME ?? 'AirVoice Help Center'}</h1>
            {user ? <p>Welcome, {user.name} ({user.role})</p> : <p>Welcome to AirVoice Help Center</p>}
          </div>
        </div>
        <div className="header-right">
          <select 
            value={language} 
            onChange={e => setLanguage(e.target.value)}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text-main)',
              fontSize: '12px',
              marginRight: '12px',
              cursor: 'pointer'
            }}
          >
            <option value="en" style={{ backgroundColor: '#1e293b', color: '#fff' }}>English</option>
            <option value="si" style={{ backgroundColor: '#1e293b', color: '#fff' }}>සිංහල (Sinhala)</option>
            <option value="ta" style={{ backgroundColor: '#1e293b', color: '#fff' }}>தமிழ் (Tamil)</option>
          </select>
          <div className="ai-badge">
            <IoSparkles size={13} />
            <span>GPT-4o Powered</span>
          </div>
          {user && (
            <button className="logout-btn" onClick={handleLogout} title="Logout">
              Logout
            </button>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="body">
        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
        )}
        
        {/* ── Sidebar ── */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-inner">
            <p className="section-label">Topics</p>

            {/* Category pills */}
            <div className="cat-pills">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  className={`cat-pill ${category === c ? 'active' : ''}`}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>

            <p className="section-label" style={{ marginTop: 16 }}>Quick Ask</p>
            <div className="faq-list">
              {filteredTopics.map(({ Icon, text }) => (
                <button
                  key={text}
                  className="faq-btn"
                  onClick={() => sendMessage(text)}
                  disabled={loading}
                >
                  <span className="faq-icon"><Icon size={16} /></span>
                  <span className="faq-text">{text}</span>
                </button>
              ))}
            </div>

            {messages.length > 0 && (
              <button className="clear-btn" onClick={() => setMessages([])}>
                <IoTrashOutline size={14} />
                Clear Chat
              </button>
            )}
          </div>
        </aside>

        {/* ── Chat ── */}
        <div className="chat-wrap">
          <div className="messages">
            {messages.length === 0 ? (
              <div className="welcome">
                <div className="welcome-orb">
                  <MdSupportAgent size={48} />
                </div>
                <h2>Hello! How can I help you?</h2>
                <p>
                  I'm your AirVoice AI assistant. Ask me anything about deduction uploads,
                  phone sales, camps, attendance, or any other system feature.
                </p>
                <div className="welcome-chips">
                  <span onClick={() => sendMessage('How do I upload a Deduction Sheet?')} className="chip">
                    <IoCloudUploadOutline size={13} /> Upload Guide
                  </span>
                  <span onClick={() => sendMessage('How does the red flag system work?')} className="chip">
                    <IoWarningOutline size={13} /> Red Flags
                  </span>
                  <span onClick={() => sendMessage('How do I download the Excel template?')} className="chip">
                    <IoDownloadOutline size={13} /> Templates
                  </span>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`message-row ${msg.role}`}>
                  <div className={`avatar ${msg.role}`}>
                    {msg.role === 'user'
                      ? <IoPeopleOutline size={16} />
                      : <MdSupportAgent size={18} />
                    }
                  </div>
                  <div className="msg-col">
                    <div className={`bubble ${msg.role} ${msg.error ? 'error' : ''}`}>
                      {msg.error
                        ? <span className="err-icon"><IoAlertCircleOutline size={15} /></span>
                        : null
                      }
                      <div
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      />
                    </div>
                    <span className="ts">
                      <IoTimeOutline size={11} />
                      {formatTime(msg.timestamp)}
                      {msg.role === 'assistant' && !msg.error && (
                        <span className="verified">
                          <IoCheckmarkCircle size={11} /> AI
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              ))
            )}

            {/* Typing indicator */}
            {loading && (
              <div className="message-row assistant">
                <div className="avatar assistant"><MdSupportAgent size={18} /></div>
                <div className="msg-col">
                  <div className="bubble assistant typing-bubble">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Input ── */}
          <div className="input-bar">
            <div className={`input-box ${loading ? 'disabled' : ''}`}>
              <IoChatbubbleEllipsesOutline size={18} className="input-icon" />
              <textarea
                ref={textareaRef}
                className="msg-input"
                placeholder="Ask about any AirVoice feature…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={loading}
              />
              <button
                className="send-btn"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
              >
                <IoSend size={17} />
              </button>
            </div>
            <p className="input-hint">
              Enter to send &nbsp;·&nbsp; Shift+Enter for new line &nbsp;·&nbsp;
              <span style={{ color: 'var(--accent)' }}>Powered by OpenAI + Supabase</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
