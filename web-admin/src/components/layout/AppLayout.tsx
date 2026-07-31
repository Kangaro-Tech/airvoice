import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore, UserRole } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, authApi } from '@/services/api';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { ROLES } from '@/config/roles';
import { LanguageSelector } from '@/components/TranslationWidget';
import {
  LayoutDashboard, Bell, FileText, Users, CreditCard, Package, Truck, Phone,
  BarChart2, DollarSign, RefreshCcw, Shield, Briefcase, TrendingUp,
  Upload, Cpu, Smartphone, LogOut, Menu, AlertCircle, Sun, Moon,
  Settings, Printer, ScrollText, MapPin, BookOpen, BarChart3, Building, Wallet, Camera, Loader2,
  ClipboardList, CalendarCheck, UserCog, BadgeDollarSign, Scissors
} from 'lucide-react';
import logoImg from '@/assets/logo.png';

type BadgeKey =
  | 'applications'
  | 'inventory'
  | 'notifications'
  | 'stock_orders'
  | 'installments'
  | 'expenses'
  | 'payroll'
  | 'recovery'
  | 'guarantors'
  | 'finance'
  | 'customers';

export interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  roles?: UserRole[];
  badgeKey?: BadgeKey;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      {
        label: 'Dashboard',
        to: '/dashboard',
        icon: <LayoutDashboard size={16} />,
        roles: ['finance_officer', 'accountant', 'recovery_officer', 'camp_officer', 'sales_officer', 'inventory_manager', 'guarantor', 'customer', 'admin', 'super_admin']
      },
      {
        label: 'Notifications',
        to: '/notifications',
        icon: <Bell size={16} />,
        badgeKey: 'notifications',
        roles: ['finance_officer', 'accountant', 'recovery_officer', 'camp_officer', 'sales_officer', 'inventory_manager', 'admin', 'super_admin']
      },
      {
        label: 'Schedule',
        to: '/schedule',
        icon: <ScrollText size={16} />
      },
    ],
  },
  {
    title: 'HR & Payroll',
    items: [
      {
        label: 'Staff Directory',
        to: '/hr/staff',
        icon: <UserCog size={16} />,
        roles: ['system_operator', 'admin', 'super_admin']
      },
      {
        label: 'Attendance',
        to: '/hr/attendance',
        icon: <CalendarCheck size={16} />,
        roles: ['system_operator', 'admin', 'super_admin']
      },
      {
        label: 'Leave Management',
        to: '/hr/leaves',
        icon: <ClipboardList size={16} />,
        roles: ['system_operator', 'admin', 'super_admin']
      },
      {
        label: 'Salary Advances',
        to: '/hr/advances',
        icon: <BadgeDollarSign size={16} />,
        roles: ['system_operator', 'admin', 'super_admin']
      },
      {
        label: 'Salary Deductions',
        to: '/hr/deductions',
        icon: <Scissors size={16} />,
        roles: ['system_operator', 'admin', 'super_admin']
      },
    ],
  },
  {
    title: 'Operations',
    items: [
      {
        label: 'Applications',
        to: '/applications',
        icon: <FileText size={16} />,
        badgeKey: 'applications',
        roles: ['camp_officer', 'sales_officer', 'admin', 'super_admin']
      },
      {
        label: 'Customers',
        to: '/customers',
        icon: <Users size={16} />,
        badgeKey: 'customers',
        roles: ['finance_officer', 'accountant', 'recovery_officer', 'camp_officer', 'sales_officer', 'admin', 'super_admin']
      },
      {
        label: 'Installments',
        to: '/installments',
        icon: <CreditCard size={16} />,
        badgeKey: 'installments',
        roles: ['finance_officer', 'accountant', 'camp_officer', 'admin', 'super_admin']
      },
      {
        label: 'Inventory',
        to: '/inventory',
        icon: <Package size={16} />,
        badgeKey: 'inventory',
        roles: ['inventory_manager', 'admin', 'super_admin']
      },
      {
        label: 'Stock Orders',
        to: '/stock-orders',
        icon: <Truck size={16} />,
        badgeKey: 'stock_orders',
        roles: ['inventory_manager', 'admin', 'super_admin']
      },
      {
        label: 'Phone Catalogue',
        to: '/phones',
        icon: <Phone size={16} />,
        roles: ['sales_officer', 'inventory_manager', 'admin', 'super_admin']
      },
    ],
  },

  {
    title: 'Finance & Recovery',
    items: [
      {
        label: 'Finance',
        to: '/finance',
        icon: <BarChart3 size={16} />,
        badgeKey: 'finance',
        roles: ['finance_officer', 'accountant', 'admin', 'super_admin']
      },
      {
        label: 'Expenses',
        to: '/expenses',
        icon: <BookOpen size={16} />,
        badgeKey: 'expenses',
        roles: ['finance_officer', 'accountant', 'admin', 'super_admin']
      },
      
      {
        label: 'Recovery',
        to: '/recovery',
        icon: <RefreshCcw size={16} />,
        badgeKey: 'recovery',
        roles: ['recovery_officer', 'finance_officer', 'admin', 'super_admin']
      },
      {
        label: 'Donations',
        to: '/donations',
        icon: <CreditCard size={16} />,
        roles: ['finance_officer', 'accountant', 'admin', 'super_admin']
      },
      {
        label: 'Guarantors',
        to: '/guarantors',
        icon: <Shield size={16} />,
        badgeKey: 'guarantors',
        roles: ['finance_officer', 'recovery_officer', 'admin', 'super_admin']
      },
      {
        label: 'Cheque Printer',
        to: '/cheque',
        icon: <Printer size={16} />,
        roles: ['finance_officer', 'accountant', 'admin', 'super_admin']
      },
      {
        label: 'Company Payments',
        to: '/company-payments',
        icon: <Building size={16} />,
        roles: ['finance_officer', 'accountant', 'admin', 'super_admin']
      },
      {
        label: 'Petty Cash',
        to: '/petty-cash',
        icon: <Wallet size={16} />,
        roles: ['finance_officer', 'accountant', 'admin', 'super_admin']
      },
    ],
  },

  {
    title: 'Audit & Reports',
    items: [
      {
        label: 'Audit Log',
        to: '/admin/audit-logs',
        icon: <ScrollText size={16} />,
        roles: ['finance_officer', 'accountant', 'admin', 'super_admin', 'system_operator']
      },
      {
        label: 'Reports',
        to: '/reports',
        icon: <FileText size={16} />,
        roles: ['finance_officer', 'accountant', 'camp_officer', 'admin', 'super_admin']
      },
    ],
  },
 
  {
    title: 'Portals',
    items: [
      {
        label: 'Camp Portal',
        to: '/camp',
        icon: <MapPin size={16} />,
        roles: ['camp_officer', 'super_admin']
      },
      {
        label: 'Sales Officer',
        to: '/sales',
        icon: <TrendingUp size={16} />,
        roles: ['sales_officer', 'admin', 'super_admin']
      },
    ],
  },
  
  
  {
    title: 'Intelligence',
    items: [
      {
        label: 'Legacy Records',
        to: '/legacy-import',
        icon: <Upload size={16} />,
        roles: ['finance_officer', 'admin', 'super_admin']
      },
      {
        label: 'AI Risk Engine',
        to: '/admin/ai-risk',
        icon: <Cpu size={16} />,
        roles: ['admin', 'super_admin']
      },
      {
        label: 'Customer App',
        to: '/admin/customer-app',
        icon: <Smartphone size={16} />,
        roles: ['admin', 'super_admin']
      },
    ],
  },

  {
    title: 'Admin',
    items: [
      {
        label: 'Admin Panel',
        to: '/admin',
        icon: <Shield size={16} />,
        roles: ['admin', 'super_admin']
      },
      {
        label: 'Camp Setup',
        to: '/admin/camps',
        icon: <Briefcase size={16} />,
        roles: ['super_admin']
      },
      {
        label: 'Users',
        to: '/admin/users',
        icon: <Users size={16} />,
        roles: ['admin', 'super_admin']
      },
      {
        label: 'Settings',
        to: '/settings',
        icon: <Settings size={16} />,
        roles: ['admin', 'super_admin']
      },
    ],
  },
];

const DICTIONARY: Record<string, Record<string, string>> = {
  si: {
    'Dashboard': 'පුවරුව',
    'Notifications': 'දැනුම්දීම්',
    'Applications': 'අයදුම්පත්',
    'Customers': 'ගනුදෙනුකරුවන්',
    'Installments': 'වාරික',
    'Inventory': 'තොග',
    'Stock Orders': 'තොග ඇණවුම්',
    'Phone Catalogue': 'දුරකථන නාමාවලිය',
    'Finance': 'මූල්‍ය',
    'Expenses': 'වියදම්',
    'Payroll': 'වැටුප් ලේඛනය',
    'Recovery': 'නැවත අයකර ගැනීම්',
    'Guarantors': 'ඇපකරුවන්',
    'Cheque Printer': 'චෙක්පත් මුද්‍රණ යන්ත්‍රය',
    'Reports': 'වාර්තා',
    'Audit Log': 'විගණන ලොගය',
    'Settings': 'සැකසුම්',
    'P&L Report': 'ලාභ හා අලාභ වාර්තාව',
    'Add Expense': 'වියදමක් එක් කරන්න',
    'Sign out': 'පිටවෙන්න',
    'Schedule': 'කාලසටහන',
    'Petty Cash': 'සුළු මුදල්',
    'Company Payments': 'සමාගමේ ගෙවීම්',
    'Active Plans': 'සක්‍රීය සැලසුම්',
    'Collection Rate': 'එකතු කිරීමේ අනුපාතය',
    'Overdue Customers': 'හිඟ මුදල් ඇති ගනුදෙනුකරුවන්',
    'Monthly Collected': 'මාසිකව එකතු කළ මුදල',
    'Reports & Export Center': 'වාර්තා සහ අපනයන මධ්‍යස්ථානය',
    'Download operational and financial reports in Excel or CSV format': 'මෙහෙයුම් සහ මූල්‍ය වාර්තා Excel හෝ CSV ආකෘතියෙන් බාගත කරන්න',
    'Export Reports': 'වාර්තා අපනයනය',
    'Scheduled Reports': 'සැලසුම් කළ වාර්තා',
    'Export Format': 'අපනයන ආකෘතිය',
    'Excel recommended for analysis, CSV for raw data imports': 'විශ්ලේෂණය සඳහා Excel නිර්දේශ කෙරේ, අමු දත්ත සඳහා CSV',
    'Monthly Deduction Sheet': 'මාසික අඩු කිරීම් පත්‍රය',
    'All installment deductions for a given month/camp. Filterable by year, month, and camp.': 'දී ඇති මාසයක්/කඳවුරක් සඳහා සියලුම වාරික අඩු කිරීම්. වර්ෂය, මාසය සහ කඳවුර අනුව පෙරහන් කළ හැක.',
    'Arrears Report': 'හිඟ මුදල් වාර්තාව',
    'All customers with outstanding arrears, sorted by amount.': 'හිඟ මුදල් ඇති සියලුම ගනුදෙනුකරුවන්, ප්‍රමාණය අනුව වර්ග කර ඇත.',
    'Sales Commissions': 'විකුණුම් කොමිස්',
    'Sales officer commissions — payable, pending and paid.': 'විකුණුම් නිලධාරී කොමිස් - ගෙවිය යුතු, පොරොත්තුවෙන් සහ ගෙවන ලද.',
    'Risk Report': 'අවදානම් වාර්තාව',
    'All customers by risk score. Filter by HIGH / MEDIUM / LOW.': 'අවදානම් ලකුණු අනුව සියලුම ගනුදෙනුකරුවන්. ඉහළ / මධ්‍යම / අඩු ලෙස පෙරන්න.',
    'Retirement Risk': 'විශ්‍රාම අවදානම',
    'Customers retiring within 24 months with active phone plans.': 'සක්‍රීය දුරකථන සැලසුම් සහිත මාස 24ක් ඇතුළත විශ්‍රාම යන ගනුදෙනුකරුවන්.',
    'Report Guide': 'වාර්තා මාර්ගෝපදේශය',
    'Deduction Sheet': 'අඩු කිරීම් පත්‍රය',
    'Best for monthly camp reconciliation. Share with payroll officers.': 'මාසික කඳවුරු සංසන්දනය සඳහා හොඳම වේ. වැටුප් නිලධාරීන් සමඟ බෙදා ගන්න.',
    'Use for recovery follow-up and guarantor notifications.': 'නැවත අයකර ගැනීමේ පසු විපරම් සහ ඇපකරුවන් දැනුවත් කිරීම සඳහා භාවිතා කරන්න.',
    'Verify payable commissions before running bank transfers.': 'බැංකු මාරු කිරීම් සිදු කිරීමට පෙර ගෙවිය යුතු කොමිස් මුදල් සත්‍යාපනය කරන්න.',
    'Prioritise high-risk customers for monthly review meetings.': 'මාසික සමාලෝචන රැස්වීම් සඳහා ඉහළ අවදානම් සහිත ගනුදෙනුකරුවන්ට ප්‍රමුඛත්වය දෙන්න.',
    'Critical: check before approving new applications.': 'තීරණාත්මකයි: නව අයදුම්පත් අනුමත කිරීමට පෙර පරීක්ෂා කරන්න.',
  },
  ta: {
    'Dashboard': 'டாஷ்போர்டு',
    'Notifications': 'அறிவிப்புகள்',
    'Applications': 'விண்ணப்பங்கள்',
    'Customers': 'வாடிக்கையாளர்கள்',
    'Installments': 'தவணைகள்',
    'Inventory': 'சரக்கு',
    'Stock Orders': 'சரக்கு ஆர்டர்கள்',
    'Phone Catalogue': 'தொலைபேசி பட்டியல்',
    'Finance': 'நிதி',
    'Expenses': 'செலவுகள்',
    'Payroll': 'சம்பள பட்டியல்',
    'Recovery': 'மீட்பு',
    'Guarantors': 'ஜாமீன் தாரர்கள்',
    'Cheque Printer': 'காசோலை அச்சுப்பொறி',
    'Reports': 'அறிக்கைகள்',
    'Audit Log': 'தணிக்கை பதிவு',
    'Settings': 'அமைப்புகள்',
    'P&L Report': 'லாப நஷ்ட அறிக்கை',
    'Add Expense': 'செலவைச் சேர்க்கவும்',
    'Sign out': 'வெளியேறு',
    'Active Plans': 'செயலில் உள்ள திட்டங்கள்',
    'Collection Rate': 'சேகரிப்பு விகிதம்',
    'Overdue Customers': 'தவணை கடந்த வாடிக்கையாளர்கள்',
    'Monthly Collected': 'மாதாந்திர வசூல்',
    'Reports & Export Center': 'அறிக்கைகள் மற்றும் ஏற்றுமதி மையம்',
    'Download operational and financial reports in Excel or CSV format': 'செயல்பாட்டு மற்றும் நிதி அறிக்கைகளை எக்செல் அல்லது சிஎஸ்வி வடிவத்தில் பதிவிறக்கவும்',
    'Export Reports': 'ஏற்றுமதி அறிக்கைகள்',
    'Scheduled Reports': 'திட்டமிடப்பட்ட அறிக்கைகள்',
    'Export Format': 'ஏற்றுமதி வடிவம்',
    'Excel recommended for analysis, CSV for raw data imports': 'பகுப்பாய்விற்கு எக்செல் பரிந்துரைக்கப்படுகிறது, மூல தரவுக்கு சிஎஸ்வி',
  }
};

export default function AppLayout() {
  const { user, logout } = useAuthStore();
  const { role } = useRoleAccess();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('app-language') || 'en';
  });

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    localStorage.setItem('app-language', newLanguage);
    // Trigger translation if needed
    window.dispatchEvent(new CustomEvent('languageChange', { detail: { language: newLanguage } }));
  };

  const location = useLocation();
  const [seenCounts, setSeenCounts] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('badge-seen-counts') || '{}');
    } catch {
      return {};
    }
  });
  // ── File Upload Handler ───────────────────────────────
  // Moved to MyProfilePage
  const translationCache = useRef<Record<string, string>>({});

  useEffect(() => {
    localStorage.setItem('previous-language', language);

    const dictionary = DICTIONARY[language] || {};

    const translateNode = async (node: Node) => {
      // 1. Handle text nodes
      if (node.nodeType === Node.TEXT_NODE) {
        let originalText = (node as any)._originalText;
        if (!originalText) {
          originalText = node.textContent?.trim();
          if (!originalText || originalText.length < 2) return;
          (node as any)._originalText = originalText;
        }

        const text = originalText;

        // Skip numbers, currencies, dates
        if (/^\d+$/.test(text) || /^[LKR\s\d,.]+$/i.test(text) || /^\d{4}-\d{2}-\d{2}$/.test(text) || text.includes(':') || text.includes('/') || text.length > 150) return;

        if (language === 'en') {
          if (node.textContent !== text) node.textContent = text;
          return;
        }

        // Try dictionary first
        if (dictionary[text]) {
          node.textContent = dictionary[text];
          return;
        }

        // Try cache
        const cacheKey = `${language}:${text}`;
        if (translationCache.current[cacheKey]) {
          node.textContent = translationCache.current[cacheKey];
          return;
        }

        // Translate via Google API direct call
        try {
          const apiKey = import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY;
          if (!apiKey) return;
          const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: text, target: language, source: 'en', format: 'text' })
          });
          const data = await res.json();
          if (data?.data?.translations?.[0]?.translatedText) {
            const decoded = (() => {
              const txt = document.createElement('textarea');
              txt.innerHTML = data.data.translations[0].translatedText;
              return txt.value;
            })();
            translationCache.current[cacheKey] = decoded;
            node.textContent = decoded;
          }
        } catch {
          // Fallback silently if API is offline
        }
        return;
      }

      // 2. Handle element children
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'CODE', 'PRE'].includes(el.tagName)) return;

        // If it's a badge, active role pill, or excluded class, do not translate
        if (el.classList.contains('font-mono') || el.classList.contains('badge') || el.classList.contains('role-pill') || el.classList.contains('no-translate') || el.closest?.('.no-translate')) return;

        for (let i = 0; i < el.childNodes.length; i++) {
          translateNode(el.childNodes[i]);
        }
      }
    };

    // Translate current page content
    translateNode(document.body);

    // Watch for dynamic content changes
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach(node => translateNode(node));
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [language]);

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const { idToken } = useAuthStore();
  const queryClient = useQueryClient();

  // ── Live badge counts (initial fetch and cache) ───────────────────
  const { data: countsRes } = useQuery({
    queryKey: ['badge-counts'],
    queryFn: () => api.get('/notifications/counts').then(r => r.data),
  });
  const pendingApps = (countsRes?.pending_applications ?? 0) as number;
  const lowStock = (countsRes?.low_stock ?? 0) as number;
  const unreadNotifs = (countsRes?.unread_notifications ?? 0) as number;
  const stockOrdersPending = (countsRes?.stock_orders_pending ?? 0) as number;
  const pendingInstallments = (countsRes?.pending_installments ?? 0) as number;
  const expensesPending = (countsRes?.expenses_pending ?? 0) as number;
  const payrollDrafts = (countsRes?.payroll_drafts ?? 0) as number;
  const recoveryOverdue = (countsRes?.recovery_overdue ?? 0) as number;
  const guarantorRequestsPending = (countsRes?.guarantor_requests_pending ?? 0) as number;
  const newCustomersToday = (countsRes?.new_customers_today ?? 0) as number;
  const financeTasks = (countsRes?.finance_tasks ?? 0) as number;

  // ── Establish Real-time SSE Connection ───────────────────
  useEffect(() => {
    if (!idToken) return;

    // Use full API base URL (VITE_API_URL or defaults to host)
    const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const sseUrl = `${apiBaseUrl}/notifications/stream?token=${encodeURIComponent(idToken)}`;

    let eventSource: EventSource;
    let reconnectTimeout: any;

    const connect = () => {
      eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'notification') {
            // Invalidate badge counts and other notification related queries
            queryClient.invalidateQueries({ queryKey: ['badge-counts'] });
            queryClient.invalidateQueries({ queryKey: ['notifications'] });

            // Fire native browser notification
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(payload.data.title, {
                body: payload.data.body,
                icon: '/favicon.ico',
              });
            }

            // If this is a legacy import completion, auto-refresh the data tables
            if (payload.data?.type === 'legacy_import') {
              queryClient.invalidateQueries({ queryKey: ['customers'] });
              queryClient.invalidateQueries({ queryKey: ['applications'] });
              queryClient.invalidateQueries({ queryKey: ['camp-sheet'] });
              queryClient.invalidateQueries({ queryKey: ['installments-dash'] });
            }
          }
        } catch (err) {
          console.error('[SSE] Failed to parse event data:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.warn('[SSE] Connection lost. Reconnecting in 5s...', err);
        eventSource.close();
        reconnectTimeout = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [idToken, queryClient]);

  // ── Browser Desktop Notifications ────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const getBadge = (key?: NavItem['badgeKey']): number => {
    if (!key) return 0;

    let apiCount = 0;
    switch (key) {
      case 'applications': apiCount = pendingApps; break;
      case 'inventory': apiCount = lowStock; break;
      case 'notifications': apiCount = unreadNotifs; break;
      case 'stock_orders': apiCount = stockOrdersPending; break;
      case 'installments': apiCount = pendingInstallments; break;
      case 'expenses': apiCount = expensesPending; break;
      case 'payroll': apiCount = payrollDrafts; break;
      case 'recovery': apiCount = recoveryOverdue; break;
      case 'guarantors': apiCount = guarantorRequestsPending; break;
      case 'finance': apiCount = financeTasks; break;
      case 'customers': apiCount = newCustomersToday; break;
      default: apiCount = 0;
    }

    const seen = seenCounts[key] || 0;
    return Math.max(0, apiCount - seen);
  };

  // Clear badge when visiting the route
  useEffect(() => {
    // Find if current path matches any nav item with a badge
    const matchedItem = NAV_SECTIONS.flatMap(s => s.items).find(item => location.pathname.startsWith(item.to));
    if (matchedItem && matchedItem.badgeKey) {
      const key = matchedItem.badgeKey;
      let apiCount = 0;
      switch (key) {
        case 'applications': apiCount = pendingApps; break;
        case 'inventory': apiCount = lowStock; break;
        case 'notifications': apiCount = unreadNotifs; break;
        case 'stock_orders': apiCount = stockOrdersPending; break;
        case 'installments': apiCount = pendingInstallments; break;
        case 'expenses': apiCount = expensesPending; break;
        case 'payroll': apiCount = payrollDrafts; break;
        case 'recovery': apiCount = recoveryOverdue; break;
        case 'guarantors': apiCount = guarantorRequestsPending; break;
        case 'finance': apiCount = financeTasks; break;
        case 'customers': apiCount = newCustomersToday; break;
      }

      if (seenCounts[key] !== apiCount) {
        const newSeen = { ...seenCounts, [key]: apiCount };
        setSeenCounts(newSeen);
        localStorage.setItem('badge-seen-counts', JSON.stringify(newSeen));
      }
    }
  }, [location.pathname, pendingApps, lowStock, unreadNotifs, stockOrdersPending, pendingInstallments, expensesPending, payrollDrafts, recoveryOverdue, guarantorRequestsPending, financeTasks, newCustomersToday, seenCounts]);

  const isVisible = (item: NavItem) => {
    if (!user) return false;
    if (Array.isArray(user.custom_modules)) {
      return user.custom_modules.includes(item.to) || item.to === '/dashboard' || item.to === '/notifications';
    }
    return !item.roles || item.roles.includes(user.role);
  };

  useEffect(() => {
    if (user && Array.isArray(user.custom_modules)) {
      const allowedPaths = [...user.custom_modules, '/dashboard', '/notifications'];
      // Allow exact match or if path starts with allowed path (e.g. /customers/1)
      const isAllowed = allowedPaths.some(p => location.pathname === p || location.pathname.startsWith(`${p}/`));
      if (!isAllowed) {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [location.pathname, user, navigate]);

  const isDark = theme === 'dark';

  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* Sidebar */}
      <aside
        className={`flex flex-col shrink-0 overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-60'}`}
        style={{ backgroundColor: theme === 'light' ? '#0f172a' : 'var(--bg-sidebar)' }}
      >
        {/* Logo */}
        <div
          className="h-14 flex items-center justify-center px-2 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          {!isCollapsed ? (
            <div className="flex items-center justify-center w-full py-1.5 px-2 rounded-lg shadow-sm" style={{ backgroundColor: '#ffffff' }}>
              <img src={logoImg} alt="AIRVOICE" className="h-7 w-full object-contain" />
            </div>
          ) : (
            <div className="w-9 h-9 flex items-center justify-center rounded-lg shadow-sm overflow-hidden" style={{ backgroundColor: '#ffffff' }}>
              <img src={logoImg} alt="AV" className="h-7 w-auto object-contain" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav flex-1 py-1 px-2 overflow-y-auto">
          <div className="flex flex-col">
            {NAV_SECTIONS.map(section => {
              const visibleItems = section.items.filter(isVisible);
              if (visibleItems.length === 0) return null;
              return (
                <div key={section.title}>
                  {!isCollapsed && (
                    <div className="px-2 pt-1.5 pb-0">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{section.title}</span>
                    </div>
                  )}
                  <div>
                    {visibleItems.map(item => {
                      const badge = getBadge(item.badgeKey);
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={true}
                          className={({ isActive }) =>
                            `flex items-center rounded-md font-medium transition-colors relative ${isCollapsed ? 'justify-center p-1.5 my-px' : 'gap-2 px-2 py-1 text-xs'
                            } ${isActive
                              ? 'bg-blue-800 text-white shadow-sm'
                              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                            }`
                          }
                          title={isCollapsed ? item.label : undefined}
                        >
                          <span className="shrink-0">{item.icon}</span>
                          {!isCollapsed && <span className="truncate">{item.label}</span>}

                          {!isCollapsed && badge > 0 && (
                            <span className={`ml-auto text-[10px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ${item.badgeKey === 'inventory'
                              ? 'bg-red-500 text-white animate-pulse'
                              : 'bg-blue-600 text-white animate-pulse'
                              }`}>
                              {badge > 99 ? '99+' : badge}
                            </span>
                          )}

                          {isCollapsed && badge > 0 && (
                            <span className={`absolute -top-1 -right-1 text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center shadow-md animate-pulse ${item.badgeKey === 'inventory'
                              ? 'bg-red-500 text-white'
                              : 'bg-blue-600 text-white'
                              }`}>
                              {badge > 9 ? '9+' : badge}
                            </span>
                          )}
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        {/* User info */}
        <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {!isCollapsed ? (
            <div className="space-y-3">
              {/* Enhanced User Profile Card */}
              <div
                className={`rounded-lg p-3 cursor-pointer transition-all hover:shadow-lg bg-slate-800/50 hover:bg-slate-800`}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  // If clicking on the avatar area, navigate to profile
                  if (target.closest('.profile-avatar-btn')) {
                    navigate('/profile');
                  } else {
                    setShowProfileMenu(!showProfileMenu);
                  }
                }}
              >
                {/* Profile Header */}
                <div className="flex items-start gap-2.5 mb-3 relative group">
                  <div
                    className="profile-avatar-btn w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center text-base font-bold shrink-0 text-blue-400 relative overflow-hidden ring-2 ring-transparent group-hover:ring-blue-500/50 transition-all cursor-pointer"
                    title="Edit Profile"
                  >
                    {user?.profile_photo_url ? (
                      <img src={user.profile_photo_url} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      user?.full_name ? user.full_name.charAt(0).toUpperCase() : (user?.phone_number?.slice(-2) || '?')
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-white truncate leading-tight">{user?.full_name || user?.phone_number}</div>
                    {user?.full_name && (
                      <div className="text-[10px] text-slate-400 truncate">{user?.phone_number}</div>
                    )}
                    <div className="text-xs text-slate-300 capitalize mt-0.5">
                      {user?.role?.replace(/_/g, ' ')}
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2 mb-2 text-xs text-white">
                  <div className={`w-2 h-2 rounded-full ${user?.is_active ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                  <span>{user?.is_active ? 'Active' : 'Inactive'}</span>
                </div>

                {/* Role Info - Expandable */}
                {showProfileMenu && user?.role && ROLES[user.role as UserRole] && (
                  <div className="mt-3 pt-3 border-t border-slate-700 space-y-2 text-xs text-slate-300">
                    <div>
                      <p className="text-slate-400 text-xs">Role</p>
                      <p className="font-semibold text-white">{ROLES[user.role as UserRole].displayName}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs">Responsibilities</p>
                      <p className="text-xs leading-relaxed">{ROLES[user.role as UserRole].description}</p>
                    </div>
                    {user?.is_verified && (
                      <div className="flex items-center gap-2 text-green-400">
                        <span>✓</span>
                        <span>Verified</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              {/* Collapsed mode - profile avatar with tooltip */}
              <div
                className="relative group cursor-pointer"
                title={`${user?.full_name || user?.phone_number} (${user?.role}) - Click to edit profile`}
                onClick={() => navigate('/profile')}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-blue-500/20 text-blue-400 overflow-hidden ring-2 ring-transparent hover:ring-blue-500/50 transition-all">
                  {user?.profile_photo_url ? (
                    <img src={user.profile_photo_url} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    user?.full_name ? user.full_name.charAt(0).toUpperCase() : (user?.phone_number?.slice(-2) || '?')
                  )}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header
          className="h-14 flex items-center justify-between px-6 shrink-0"
          style={{ backgroundColor: 'var(--header-bg)', borderBottom: '1px solid var(--header-border)' }}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              <Menu size={18} />
            </button>
            <div id="page-title" className="text-base font-semibold" style={{ color: 'var(--text-primary)' }} />
          </div>
          <div className="flex items-center gap-2">
            {/* Pending apps pill */}
            {pendingApps > 0 && (
              <NavLink to="/applications" className="flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-700 font-semibold px-3 py-1.5 rounded-full hover:bg-amber-100 transition-colors">
                <FileText size={12} />
                {pendingApps} pending review
              </NavLink>
            )}
            {/* Low stock pill */}
            {lowStock > 0 && (
              <NavLink to="/inventory" className="flex items-center gap-1.5 text-xs bg-red-50 border border-red-200 text-red-700 font-semibold px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors">
                <AlertCircle size={12} />
                {lowStock} low stock
              </NavLink>
            )}

            {/* ── Theme toggle ── */}
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200"
              style={{
                backgroundColor: isDark ? '#1c2333' : '#f1f5f9',
                color: isDark ? '#e6edf3' : '#475569',
                border: '1px solid var(--border-color)',
              }}
            >
              {isDark ? (
                <><Sun size={13} className="text-amber-400" /><span>Light</span></>
              ) : (
                <><Moon size={13} className="text-slate-500" /><span>Dark</span></>
              )}
            </button>

            {/* ── Language Selector ── */}
            <LanguageSelector
              currentLanguage={language}
              onChange={handleLanguageChange}
              size="sm"
            />

            {/* Notification bell */}
            <NavLink to="/notifications" className="relative p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}>
              <Bell size={18} />
              {unreadNotifs > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-bounce">
                  {unreadNotifs > 9 ? '9+' : unreadNotifs}
                </span>
              )}
            </NavLink>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

        {/* Global Footer — Kangaro-Tech Australia */}
        <footer
          className="shrink-0 flex items-center justify-center gap-2 py-2 px-4 text-[10px] font-medium select-none"
          style={{
            borderTop: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-muted)',
          }}
        >
          <span>Developed by</span>
          <span
            className="font-bold tracking-wide"
            style={{
              background: 'linear-gradient(90deg, #3b82f6, #6366f1)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Kangaro-Tech
          </span>

          <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Australia</span>
          <span className="mx-1 opacity-30">·</span>
          <span>© {new Date().getFullYear()} AirVoice Management System</span>
        </footer>
      </div>
    </div>
  );
}
