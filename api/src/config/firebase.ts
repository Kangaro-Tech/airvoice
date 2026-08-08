import * as admin from 'firebase-admin';

let firebaseApp: any = null;

function parseServiceAccountKey(raw: string): any {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const unwrapped = trimmed.replace(/^(['"])(.*)\1$/s, '$2');
  const value = unwrapped.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');

  const getStringValue = (key: string): string | null => {
    const match = value.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'm'));
    if (!match) return null;

    return match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  };

  const projectId = getStringValue('project_id');
  const clientEmail = getStringValue('client_email');
  const privateKey = getStringValue('private_key');
  const privateKeyId = getStringValue('private_key_id');
  const clientId = getStringValue('client_id');
  const tokenUri = getStringValue('token_uri');
  const authProviderCertUrl = getStringValue('auth_provider_x509_cert_url');
  const clientCertUrl = getStringValue('client_x509_cert_url');
  const universeDomain = getStringValue('universe_domain');

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    type: 'service_account',
    project_id: projectId,
    private_key_id: privateKeyId || '',
    private_key: privateKey,
    client_email: clientEmail,
    client_id: clientId || '',
    token_uri: tokenUri || '',
    auth_provider_x509_cert_url: authProviderCertUrl || '',
    client_x509_cert_url: clientCertUrl || '',
    universe_domain: universeDomain || 'googleapis.com',
  };
}

export function initFirebase(): any {
  if (firebaseApp) return firebaseApp;

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    console.warn('[Firebase] FIREBASE_SERVICE_ACCOUNT_KEY not set — running WITHOUT Firebase. Token verification will be skipped.');
    return null;
  }

  const parsed = parseServiceAccountKey(serviceAccountKey);
  if (!parsed) {
    console.warn('[Firebase] FIREBASE_SERVICE_ACCOUNT_KEY could not be parsed as JSON. Running WITHOUT Firebase.');
    return null;
  }

  try {
    const cred = admin.cert(parsed);
    firebaseApp = admin.initializeApp({
      credential: cred,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  } catch (error) {
    console.warn(`[Firebase] Invalid service account credentials: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  return firebaseApp;
}

export function getFirebaseAdmin(): any {
  return firebaseApp;
}

export function getFirebaseAuth(): any {
  return firebaseApp ? firebaseApp.auth() : null;
}

export function getFirebaseStorage(): any {
  return firebaseApp ? firebaseApp.storage() : null;
}

export function getFirebaseMessaging(): any {
  return firebaseApp ? firebaseApp.messaging() : null;
}

export async function verifyFirebaseToken(idToken: string): Promise<any> {
  if (process.env.NODE_ENV === 'production' && !getFirebaseAuth()) {
    throw new Error('Firebase authentication is REQUIRED in production. Set FIREBASE_SERVICE_ACCOUNT_KEY.');
  }
  const authInstance = getFirebaseAuth();
  if (!authInstance) {
    // Dev mode — parse the token claims without verification
    // This allows local testing without Firebase credentials
    console.warn('[Firebase] Skipping token verification in dev mode');
    const [, payload] = idToken.split('.');
    const decoded = JSON.parse(Buffer.from(payload + '==', 'base64').toString());
    return {
      uid: decoded.user_id || decoded.sub || 'dev-uid',
      phone_number: decoded.phone_number || '+94000000000',
      ...decoded,
    };
  }
  return authInstance.verifyIdToken(idToken, true);
}

export async function getSignedUrl(storagePath: string, expirySeconds = 900): Promise<string> {
  const storage = getFirebaseStorage();
  if (!storage) {
    // Dev fallback — return a placeholder
    return `http://localhost:3000/dev-storage/${encodeURIComponent(storagePath)}`;
  }
  const [url] = await storage.bucket().file(storagePath).getSignedUrl({
    action: 'read',
    expires: Date.now() + expirySeconds * 1000,
  });
  return url;
}

export async function uploadToStorage(buffer: Buffer, storagePath: string, contentType: string): Promise<string> {
  const storage = getFirebaseStorage();
  if (!storage) {
    console.warn(`[Firebase] Storage not configured — file NOT uploaded: ${storagePath}`);
    return storagePath;
  }
  const file = storage.bucket().file(storagePath);
  await file.save(buffer, { metadata: { contentType }, predefinedAcl: 'private' });
  return storagePath;
}
