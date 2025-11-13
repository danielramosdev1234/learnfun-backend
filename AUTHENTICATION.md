# 🔐 Autenticação e Segurança - Guia de Implementação

## 📋 Visão Geral

O sistema de notificações agora requer autenticação usando Firebase JWT tokens. Todos os endpoints estão protegidos e incluem rate limiting e auditoria.

## 🔑 Autenticação

### Como Funciona

1. **Frontend** obtém um token JWT do Firebase Auth
2. **Frontend** envia o token no header `Authorization: Bearer <token>`
3. **Backend** valida o token usando Firebase Admin SDK
4. **Backend** adiciona informações do usuário ao `req.user`

### Middleware Implementado

#### 1. `authenticate`
Valida o token Firebase e adiciona `req.user` com:
- `uid` - ID do usuário
- `email` - Email do usuário

#### 2. `authorizeUser`
Verifica se o usuário autenticado é o dono do recurso (userId no body deve corresponder ao uid do token).

#### 3. `requireAdmin`
Verifica se o usuário tem permissões de administrador (baseado em `ADMIN_EMAILS` no `.env`).

## 📡 Uso nos Endpoints

### Endpoint Público (sem autenticação)
Nenhum - todos os endpoints de notificações requerem autenticação.

### Endpoint de Usuário (autenticação obrigatória)
```javascript
app.post('/api/notifications/send', 
  authenticate,        // Valida token
  authorizeUser,       // Verifica se userId = uid
  notificationRateLimit, // Rate limiting
  auditLogger,        // Log de auditoria
  handler
);
```

### Endpoint de Admin (autenticação + admin)
```javascript
app.post('/api/notifications/send-multiple',
  authenticate,        // Valida token
  requireAdmin,        // Verifica se é admin
  rateLimit(5),       // Rate limiting mais restritivo
  auditLogger,        // Log de auditoria
  handler
);
```

## 🚀 Como Usar no Frontend

### 1. Obter Token Firebase

```javascript
import { getAuth } from 'firebase/auth';

const auth = getAuth();
const user = auth.currentUser;

if (user) {
  const token = await user.getIdToken();
  // Use o token nas requisições
}
```

### 2. Enviar Requisição com Token

```javascript
const sendNotification = async (userId, notification) => {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error('Usuário não autenticado');
  }
  
  const token = await user.getIdToken();
  
  const response = await fetch('http://localhost:3001/api/notifications/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      userId,
      notification
    })
  });
  
  return response.json();
};
```

### 3. Exemplo Completo

```javascript
import { getAuth } from 'firebase/auth';

const API_BASE_URL = 'http://localhost:3001';

async function sendAchievementNotification(userId, achievementType, details) {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error('Usuário não autenticado');
  }
  
  // Obtém token atualizado
  const token = await user.getIdToken();
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/notifications/achievement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        userId,
        achievementType,
        details
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Erro ao enviar notificação');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Erro ao enviar notificação:', error);
    throw error;
  }
}
```

## 🛡️ Rate Limiting

### Limites Implementados

- **Notificações individuais**: 10 requisições por minuto por usuário
- **Notificações múltiplas (admin)**: 5 requisições por minuto
- **Outros endpoints**: 60 requisições por minuto

### Resposta de Rate Limit

```json
{
  "error": "Muitas requisições",
  "message": "Limite de 10 requisições por minuto excedido. Tente novamente em 45 segundos.",
  "retryAfter": 45
}
```

## 📊 Auditoria

Todos os endpoints de notificações registram logs de auditoria incluindo:

- Timestamp
- Método HTTP e path
- ID e email do usuário
- IP do cliente
- Status code
- Duração da requisição
- Request body e response

**Exemplo de log:**
```
✅ [AUDIT] {
  "timestamp": "2024-01-01T12:00:00.000Z",
  "method": "POST",
  "path": "/api/notifications/send",
  "userId": "user123",
  "userEmail": "user@example.com",
  "ip": "192.168.1.1",
  "statusCode": 200,
  "duration": "150ms",
  "body": { ... },
  "response": { ... }
}
```

## ⚙️ Configuração

### Variáveis de Ambiente

Adicione ao `.env`:

```env
# Emails de administradores (separados por vírgula)
ADMIN_EMAILS=admin1@example.com,admin2@example.com
```

### Configurar Admins no Firebase

Para usar `requireAdmin`, você pode:

1. **Opção 1: Usar variável de ambiente** (já implementado)
   - Adicione emails em `ADMIN_EMAILS`

2. **Opção 2: Usar Custom Claims** (recomendado para produção)
   ```javascript
   // No Firebase Admin SDK
   await admin.auth().setCustomUserClaims(uid, { role: 'admin' });
   ```

## 🔒 Segurança Adicional

### 1. HTTPS em Produção

Sempre use HTTPS em produção para proteger tokens em trânsito.

### 2. Validação de Input

Todos os endpoints validam:
- Presença de campos obrigatórios
- Tipos de dados corretos
- Formato de dados válido

### 3. Tratamento de Erros

Erros não expõem informações sensíveis:
- Tokens inválidos: mensagem genérica
- Erros internos: não expõem stack traces
- Rate limiting: mensagens claras

### 4. CORS

CORS já está configurado no servidor. Certifique-se de que apenas origens confiáveis estão na lista.

## 🐛 Troubleshooting

### Erro 401: Token não fornecido

**Causa:** Header `Authorization` não foi enviado.

**Solução:**
```javascript
headers: {
  'Authorization': `Bearer ${token}`
}
```

### Erro 401: Token inválido

**Causa:** Token expirado ou inválido.

**Solução:**
```javascript
// Obtenha um novo token
const token = await user.getIdToken(true); // true força refresh
```

### Erro 403: Acesso negado

**Causa:** Usuário tentando acessar recurso de outro usuário ou endpoint de admin sem permissão.

**Solução:**
- Verifique se `userId` no body corresponde ao `uid` do token
- Para endpoints de admin, adicione o email em `ADMIN_EMAILS`

### Erro 429: Muitas requisições

**Causa:** Rate limit excedido.

**Solução:**
- Aguarde o tempo indicado em `retryAfter`
- Implemente retry com backoff exponencial no frontend

## 📚 Exemplos de Integração

### React Hook

```javascript
import { useState } from 'react';
import { getAuth } from 'firebase/auth';

export function useNotifications() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const sendNotification = async (userId, notification) => {
    setLoading(true);
    setError(null);
    
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error('Usuário não autenticado');
      }
      
      const token = await user.getIdToken();
      
      const response = await fetch('http://localhost:3001/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, notification })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao enviar notificação');
      }
      
      return await response.json();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };
  
  return { sendNotification, loading, error };
}
```

### Axios Interceptor

```javascript
import axios from 'axios';
import { getAuth } from 'firebase/auth';

const api = axios.create({
  baseURL: 'http://localhost:3001'
});

// Interceptor para adicionar token automaticamente
api.interceptors.request.use(async (config) => {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
});

// Uso
await api.post('/api/notifications/send', {
  userId: 'user123',
  notification: { title: 'Teste', body: 'Mensagem' }
});
```

## ✅ Checklist de Segurança

- [x] Autenticação JWT implementada
- [x] Validação de tokens Firebase
- [x] Rate limiting configurado
- [x] Logs de auditoria
- [x] Autorização de recursos
- [x] Tratamento de erros seguro
- [ ] HTTPS em produção (configurar no servidor)
- [ ] Custom claims para admins (opcional)
- [ ] Monitoramento de segurança (opcional)

