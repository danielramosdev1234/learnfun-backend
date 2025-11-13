/**
 * Rate Limiting simples em memória
 * Para produção, considere usar Redis ou um serviço dedicado
 */

const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuto
const MAX_REQUESTS_PER_WINDOW = 60; // 60 requisições por minuto

/**
 * Limpa contadores antigos periodicamente
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.windowStart > RATE_LIMIT_WINDOW) {
      requestCounts.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW);

/**
 * Middleware de rate limiting
 */
export const rateLimit = (maxRequests = MAX_REQUESTS_PER_WINDOW, windowMs = RATE_LIMIT_WINDOW) => {
  return (req, res, next) => {
    // Usa IP + userId (se autenticado) como chave
    const identifier = req.user?.uid || req.ip || req.connection.remoteAddress;
    const key = `rate_limit_${identifier}`;
    
    const now = Date.now();
    const record = requestCounts.get(key);

    if (!record) {
      // Primeira requisição
      requestCounts.set(key, {
        count: 1,
        windowStart: now
      });
      return next();
    }

    // Verifica se ainda está na mesma janela
    if (now - record.windowStart < windowMs) {
      record.count++;
      
      if (record.count > maxRequests) {
        const resetTime = Math.ceil((windowMs - (now - record.windowStart)) / 1000);
        return res.status(429).json({
          error: 'Muitas requisições',
          message: `Limite de ${maxRequests} requisições por minuto excedido. Tente novamente em ${resetTime} segundos.`,
          retryAfter: resetTime
        });
      }
    } else {
      // Nova janela
      requestCounts.set(key, {
        count: 1,
        windowStart: now
      });
    }

    next();
  };
};

/**
 * Rate limiting específico para notificações (mais restritivo)
 */
export const notificationRateLimit = rateLimit(10, 60 * 1000); // 10 requisições por minuto

