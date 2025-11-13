import { verifyFirebaseToken } from '../config/firebase.js';

/**
 * Middleware de autenticação usando Firebase JWT
 * Valida o token e adiciona informações do usuário ao request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Extrai o token do header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        error: 'Token não fornecido',
        message: 'Adicione o header Authorization: Bearer <token>'
      });
    }

    // Verifica formato Bearer token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        error: 'Formato de token inválido',
        message: 'Use o formato: Bearer <token>'
      });
    }

    const token = parts[1];

    // Verifica o token com Firebase Admin
    const result = await verifyFirebaseToken(token);

    if (!result.success) {
      return res.status(401).json({
        error: 'Token inválido',
        message: result.error || 'Token expirado ou inválido'
      });
    }

    // Adiciona informações do usuário ao request
    req.user = {
      uid: result.uid,
      email: result.email
    };

    // Continua para o próximo middleware/route handler
    next();
  } catch (error) {
    console.error('❌ Erro no middleware de autenticação:', error);
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

