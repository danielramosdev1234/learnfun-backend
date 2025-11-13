import { verifyFirebaseToken } from '../config/firebase.js';

/**
 * Middleware de autenticação usando Firebase JWT
 * Valida o token e adiciona informações do usuário ao request
 */
export const authenticate = async (req, res, next) => {
  try {
    console.log('🔐 [AUTH] Verificando autenticação para:', req.method, req.path);
    console.log('🔐 [AUTH] Headers:', {
      authorization: req.headers.authorization ? 'Bearer ***' : 'não fornecido',
      origin: req.headers.origin,
      'user-agent': req.headers['user-agent']?.substring(0, 50)
    });
    
    // Extrai o token do header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      console.error('❌ [AUTH] Token não fornecido');
      return res.status(401).json({
        error: 'Token não fornecido',
        message: 'Adicione o header Authorization: Bearer <token>'
      });
    }

    // Verifica formato Bearer token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      console.error('❌ [AUTH] Formato de token inválido');
      return res.status(401).json({
        error: 'Formato de token inválido',
        message: 'Use o formato: Bearer <token>'
      });
    }

    const token = parts[1];
    console.log('🔐 [AUTH] Token recebido (primeiros 20 chars):', token.substring(0, 20) + '...');

    // Verifica o token com Firebase Admin
    const result = await verifyFirebaseToken(token);

    if (!result.success) {
      console.error('❌ [AUTH] Token inválido:', result.error);
      return res.status(401).json({
        error: 'Token inválido',
        message: result.error || 'Token expirado ou inválido'
      });
    }

    console.log('✅ [AUTH] Token válido para usuário:', result.uid);

    // Adiciona informações do usuário ao request
    req.user = {
      uid: result.uid,
      email: result.email
    };

    // Continua para o próximo middleware/route handler
    next();
  } catch (error) {
    console.error('❌ [AUTH] Erro no middleware de autenticação:', error);
    console.error('❌ [AUTH] Stack:', error.stack);
    return res.status(500).json({
      error: 'Erro ao processar autenticação',
      message: error.message
    });
  }
};

/**
 * Middleware opcional: Verifica se o usuário é o dono do recurso
 * Útil para endpoints que modificam dados de um usuário específico
 */
export const authorizeUser = (req, res, next) => {
  const { userId } = req.body;
  const { uid } = req.user;

  // Se não especificou userId, permite (será validado no endpoint)
  if (!userId) {
    return next();
  }

  // Verifica se o usuário autenticado é o dono do recurso
  if (userId !== uid) {
    return res.status(403).json({
      error: 'Acesso negado',
      message: 'Você só pode acessar seus próprios recursos'
    });
  }

  next();
};

/**
 * Middleware para verificar se o usuário é admin
 * Requer um campo 'role' no token customizado do Firebase
 */
export const requireAdmin = async (req, res, next) => {
  try {
    // Verifica se o usuário tem role de admin
    // Isso requer que você adicione claims customizados no Firebase Auth
    const authHeader = req.headers.authorization;
    const token = authHeader.split(' ')[1];
    
    // Aqui você pode verificar claims customizados do Firebase
    // Por enquanto, vamos verificar uma variável de ambiente de admins
    const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
    
    if (!req.user || !adminEmails.includes(req.user.email)) {
      return res.status(403).json({
        error: 'Acesso negado',
        message: 'Apenas administradores podem acessar este recurso'
      });
    }

    next();
  } catch (error) {
    console.error('❌ Erro ao verificar permissões de admin:', error);
    return res.status(500).json({
      error: 'Erro ao verificar permissões',
      message: error.message
    });
  }
};

