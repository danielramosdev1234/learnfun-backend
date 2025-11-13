/**
 * Middleware de logging para auditoria
 * Registra todas as requisições de notificações
 */

export const auditLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Intercepta o response para logar após o envio
  const originalSend = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;
    
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      userId: req.user?.uid || 'anonymous',
      userEmail: req.user?.email || 'anonymous',
      ip: req.ip || req.connection.remoteAddress,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      body: req.body,
      response: data
    };
    
    // Log apenas em caso de sucesso ou erro importante
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅ [AUDIT]', JSON.stringify(logData));
    } else if (res.statusCode >= 400) {
      console.error('❌ [AUDIT]', JSON.stringify(logData));
    }
    
    // Restaura função original e chama
    res.json = originalSend;
    return originalSend.call(this, data);
  };
  
  next();
};

