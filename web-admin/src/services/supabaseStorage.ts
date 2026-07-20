import { createClient } from '@supabase/supabase-js';


const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let _client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (!_client) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set');
      return null;
    }
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

// ── Bucket name for customer documents ──────────────────────────────────────
export const DOCUMENTS_BUCKET = 'customer_documents';

// ── Document types (must match backend) ─────────────────────────────────────
export type DocumentType =
  | 'nic_front'
  | 'nic_back'
  | 'military_id'
  | 'selfie'
  | 'paysheet_1'
  | 'paysheet_2'
  | 'paysheet_3';

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  nic_front:   'NIC (Front)',
  nic_back:    'NIC (Back)',
  military_id: 'Military / Service ID',
  selfie:      'Selfie / Photo',
  paysheet_1:  'Paysheet – Month 1',
  paysheet_2:  'Paysheet – Month 2',
  paysheet_3:  'Paysheet – Month 3',
};

// ── Upload a file via the backend API ───────────────────────────────────────
// Returns the uploaded document record from the backend.
export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export async function uploadDocumentViaApi(
  customerId: string,
  documentType: DocumentType,
  file: File,
  onProgress?: (p: UploadProgress) => void,
  authToken?: string,
): Promise<{ id: string; signed_url: string; document_type: string }> {
  const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
  const url = `${baseURL}/customers/${customerId}/documents`;

  const form = new FormData();
  form.append('file', file);
  form.append('document_type', documentType);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress({ loaded: e.loaded, total: e.total, percent: Math.round((e.loaded / e.total) * 100) });
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res.data);
        } catch {
          reject(new Error('Invalid response from server'));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.message || err.error || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    xhr.open('POST', url);
    if (authToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
    }
    xhr.send(form);
  });
}

// ── File validation helpers ──────────────────────────────────────────────────
export const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
];

export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export function validateFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|heic|heif|pdf)$/i)) {
    return `Unsupported file type. Please use JPEG, PNG, WEBP, PDF.`;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`;
  }
  return null;
}

export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
