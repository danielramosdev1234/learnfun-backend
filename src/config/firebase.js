import admin from 'firebase-admin';
import dotenv from 'dotenv';

// Força o reload do .env
dotenv.config();

// Debug: Verificar se as variáveis estão sendo carregadas
console.log('🔍 Checking environment variables...');
console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? '✅ Loaded' : '❌ Missing');
console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? '✅ Loaded' : '❌ Missing');
console.log('FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? '✅ Loaded (length: ' + process.env.FIREBASE_PRIVATE_KEY.length + ')' : '❌ Missing');

// Validar variáveis obrigatórias
if (!process.env.FIREBASE_PROJECT_ID) {
  throw new Error('❌ FIREBASE_PROJECT_ID is not defined in .env file');
}
if (!process.env.FIREBASE_CLIENT_EMAIL) {
  throw new Error('❌ FIREBASE_CLIENT_EMAIL is not defined in .env file');
}
if (!process.env.FIREBASE_PRIVATE_KEY) {
  throw new Error('❌ FIREBASE_PRIVATE_KEY is not defined in .env file');
}

// Processar a private key
const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

// Criar credenciais
const credential = {
  project_id: process.env.FIREBASE_PROJECT_ID,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  private_key: privateKey
};

// Inicializar Firebase Admin
try {
  admin.initializeApp({
    credential: admin.credential.cert(credential)
  });
  console.log('✅ Firebase Admin initialized successfully');
  console.log('📦 Project ID:', process.env.FIREBASE_PROJECT_ID);
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin:', error.message);
  throw error;
}

export const verifyFirebaseToken = async (token) => {
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return { success: true, uid: decoded.uid, email: decoded.email };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export default admin;