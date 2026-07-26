import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import type { User as FirebaseUser, ConfirmationResult } from 'firebase/auth';
import { api } from '@/services/api';

// ── Firebase initialisation ───────────────────────────────────
const firebaseApp = initializeApp({
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
});

export const firebaseAuth = getAuth(firebaseApp);

// ── Types ─────────────────────────────────────────────────────
export type UserRole =
  | 'customer' | 'guarantor' | 'sales_officer' | 'camp_officer'
  | 'finance_officer' | 'recovery_officer' | 'inventory_manager'
  | 'accountant' | 'admin' | 'super_admin';

export type LoginMethod = 'phone' | 'email';

export interface StaffUser {
  id: string;
  firebase_uid?: string;
  phone_number?: string;
  email?: string;
  role: UserRole;
  is_active: boolean;
  is_verified: boolean;
  preferred_language: 'en' | 'si' | 'ta';
  full_name?: string;
  profile_photo_url?: string;
  auth_method?: 'phone' | 'email' | 'both';
  custom_modules?: string[];
}

interface AuthState {
  user: StaffUser | null;
  firebaseUser: FirebaseUser | null;
  idToken: string | null;          // Firebase token (phone users)
  emailToken: string | null;       // AIRVOICE JWT (email users)
  loginMethod: LoginMethod | null;
  loginTimestamp: number | null;
  isLoading: boolean;
  isInitializing: boolean;
  error: string | null;
  confirmationResult: ConfirmationResult | null;

  // Phone OTP flow
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;

  // Email/password flow
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, role?: string, phone_number?: string) => Promise<void>;

  logout: () => Promise<void>;
  setFirebaseUser: (user: FirebaseUser | null) => void;
  clearError: () => void;

  // Helper: returns the active Bearer token for API calls
  getActiveToken: () => string | null;
}

// ── Store ─────────────────────────────────────────────────────
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:               null,
      firebaseUser:       null,
      idToken:            null,
      emailToken:         null,
      loginMethod:        null,
      loginTimestamp:     null,
      isLoading:          false,
      isInitializing:     true,
      error:              null,
      confirmationResult: null,

      // ── Get active Bearer token ──────────────────────────────
      getActiveToken: () => {
        const { loginMethod, idToken, emailToken } = get();
        if (loginMethod === 'email') return emailToken;
        return idToken;
      },

      // ── Send OTP (phone login) ───────────────────────────────
      sendOtp: async (phone: string) => {
        set({ isLoading: true, error: null });
        try {
          if (!(window as any).recaptchaVerifier) {
            (window as any).recaptchaVerifier = new RecaptchaVerifier(
              firebaseAuth,
              'recaptcha-container',
              { size: 'invisible' }
            );
          }
          const verifier = (window as any).recaptchaVerifier as RecaptchaVerifier;
          const confirmation = await signInWithPhoneNumber(firebaseAuth, phone, verifier);
          set({ confirmationResult: confirmation, isLoading: false });
        } catch (err: unknown) {
          set({ error: (err as Error).message, isLoading: false });
        }
      },

      // ── Verify OTP + backend login ───────────────────────────
      verifyOtp: async (code: string) => {
        const { confirmationResult } = get();
        if (!confirmationResult) {
          set({ error: 'No OTP request found. Please request OTP first.' });
          return;
        }

        set({ isLoading: true, error: null });
        try {
          const result  = await confirmationResult.confirm(code);
          const fbUser  = result.user;
          const idToken = await fbUser.getIdToken();

          const response    = await api.post('/auth/register', { firebase_id_token: idToken });
          const backendUser = response.data.data as StaffUser;

          const staffRoles: UserRole[] = [
            'sales_officer', 'camp_officer', 'finance_officer', 'recovery_officer',
            'inventory_manager', 'accountant', 'admin', 'super_admin',
          ];

          if (!staffRoles.includes(backendUser.role)) {
            await signOut(firebaseAuth);
            set({
              error: 'Access denied. This portal is for staff only. Please use the AIRVOICE mobile app.',
              isLoading: false,
            });
            return;
          }

          set({
            user:          backendUser,
            firebaseUser:  fbUser,
            idToken,
            emailToken:    null,
            loginMethod:   'phone',
            loginTimestamp: Date.now(),
            isLoading:     false,
            error:         null,
          });
        } catch (err: unknown) {
          set({ error: (err as Error).message, isLoading: false });
        }
      },

      // ── Email + Password Login ───────────────────────────────
      loginWithEmail: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post('/auth/login-email', { email, password });
          const { data: backendUser, token } = response.data as { data: StaffUser; token: string };

          set({
            user:        backendUser,
            firebaseUser: null,
            idToken:     null,
            emailToken:  token,
            loginMethod: 'email',
            loginTimestamp: Date.now(),
            isLoading:   false,
            error:       null,
          });
        } catch (err: unknown) {
          const message =
            (err as any)?.response?.data?.error ??
            (err as Error).message ??
            'Login failed';
          set({ error: message, isLoading: false });
        }
      },

      // ── Email + Password Registration ────────────────────────
      registerWithEmail: async (email: string, password: string, role = 'sales_officer', phone_number?: string) => {
        set({ isLoading: true, error: null });
        try {
          await api.post('/auth/register-email', { email, password, role, phone_number });
          set({ isLoading: false, error: null });
        } catch (err: unknown) {
          const message =
            (err as any)?.response?.data?.error ??
            (err as Error).message ??
            'Registration failed';
          set({ error: message, isLoading: false });
        }
      },

      // ── Logout ───────────────────────────────────────────────
      logout: async () => {
        const { loginMethod } = get();
        if (loginMethod === 'phone') {
          await signOut(firebaseAuth);
        }
        set({
          user: null, firebaseUser: null,
          idToken: null, emailToken: null,
          confirmationResult: null, loginMethod: null, loginTimestamp: null,
        });
      },

      setFirebaseUser: (fbUser) => set({ firebaseUser: fbUser }),
      clearError:      ()       => set({ error: null }),
    }),
    {
      name: 'airvoice-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        user:        state.user,
        idToken:     state.idToken,
        emailToken:  state.emailToken,
        loginMethod: state.loginMethod,
        loginTimestamp: state.loginTimestamp,
      }),
    }
  )
);

// ── Firebase auth state listener ──────────────────────────────
onAuthStateChanged(firebaseAuth, async (fbUser) => {
  const { loginMethod } = useAuthStore.getState();

  // Only manage Firebase state for phone-login users
  if (fbUser) {
    try {
      const token = await fbUser.getIdToken(false);
      useAuthStore.setState({ firebaseUser: fbUser, idToken: token, isInitializing: false });
    } catch {
      useAuthStore.setState({
        user: null, firebaseUser: null, idToken: null, isInitializing: false,
      });
    }
  } else {
    if (loginMethod === 'email') {
      // Email login doesn't use Firebase — just mark init complete
      useAuthStore.setState({ isInitializing: false });
      return;
    }
    const { user } = useAuthStore.getState();
    if (user) {
      useAuthStore.setState({
        user: null, firebaseUser: null, idToken: null, isInitializing: false,
      });
    } else {
      useAuthStore.setState({ isInitializing: false });
    }
  }
});
