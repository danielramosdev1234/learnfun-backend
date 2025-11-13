import admin from 'firebase-admin';
import dotenv from 'dotenv';

// Força o reload do .env
dotenv.config();

// Debug: Verificar se as variáveis estão sendo carregadas
console.log('🔍 Checking environment variables...');
console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? '✅ Loaded' : '❌ Missing');
console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? '✅ Loaded' : '❌ Missing');
console.log('FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? '✅ Loaded (length: ' + process.env.FIREBASE_PRIVATE_KEY.length + ')' : '❌ Missing');

// Debug: Verificar formato da chave privada
if (process.env.FIREBASE_PRIVATE_KEY) {
  const keyPreview = process.env.FIREBASE_PRIVATE_KEY.substring(0, 50);
  console.log('🔑 FIREBASE_PRIVATE_KEY preview:', keyPreview + '...');
  console.log('🔑 Has BEGIN marker:', process.env.FIREBASE_PRIVATE_KEY.includes('-----BEGIN'));
  console.log('🔑 Has \\n literals:', process.env.FIREBASE_PRIVATE_KEY.includes('\\n'));
}

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
// A chave privada pode vir com \n literal ou quebras de linha reais
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

// Se a chave não começa com -----BEGIN, pode estar em formato JSON (do arquivo de service account)
if (!privateKey.includes('-----BEGIN')) {
  // Se for JSON, tenta parsear
  try {
    const serviceAccount = JSON.parse(privateKey);
    privateKey = serviceAccount.private_key || privateKey;
  } catch (e) {
    // Não é JSON, continua com a chave original
  }
}

// Substitui \n literais por quebras de linha reais
privateKey = privateKey.replace(/\\n/g, '\n');

// Garante que a chave tem os marcadores corretos
if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
  // Se não tem os marcadores, adiciona (assumindo que é uma chave PEM)
  if (privateKey.trim().length > 0) {
    privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey.trim()}\n-----END PRIVATE KEY-----`;
  }
}

// Criar credenciais
const credential = {
  project_id: process.env.FIREBASE_PROJECT_ID,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  private_key: privateKey
};

// Inicializar Firebase Admin
try {
  // Validação adicional da chave privada
  if (!privateKey || privateKey.trim().length === 0) {
    throw new Error('Chave privada está vazia após processamento');
  }
  
  if (!privateKey.includes('BEGIN') || !privateKey.includes('END')) {
    console.warn('⚠️ Chave privada pode não ter os marcadores corretos');
    console.warn('⚠️ Tentando adicionar marcadores automaticamente...');
  }
  
  admin.initializeApp({
    credential: admin.credential.cert(credential)
  });
  console.log('✅ Firebase Admin initialized successfully');
  console.log('📦 Project ID:', process.env.FIREBASE_PROJECT_ID);
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin:', error.message);
  console.error('❌ Error details:', {
    name: error.name,
    code: error.code,
    details: error.details
  });
  
  // Dicas de troubleshooting
  if (error.message.includes('DECODER') || error.message.includes('unsupported')) {
    console.error('\n💡 DICA: O erro indica que a chave privada está em formato incorreto.');
    console.error('💡 Verifique o arquivo FIREBASE_PRIVATE_KEY_SETUP.md para instruções detalhadas.');
    console.error('💡 A chave deve ter os marcadores -----BEGIN PRIVATE KEY----- e -----END PRIVATE KEY-----');
    console.error('💡 E os \\n literais devem ser mantidos (ou quebras de linha reais).');
  }
  
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