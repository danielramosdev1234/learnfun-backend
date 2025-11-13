# 🔔 Sistema de Notificações Push - Guia de Configuração

## 📋 Visão Geral

O backend implementa um sistema completo de notificações push usando Firebase Cloud Messaging (FCM) REST API. O sistema permite enviar notificações para usuários individuais ou múltiplos, com suporte a diferentes tipos de notificações.

## 🚀 Funcionalidades

### Endpoints Disponíveis

1. **Notificação Personalizada** - `/api/notifications/send`
2. **Notificação Múltipla** - `/api/notifications/send-multiple`
3. **Lembrete Diário** - `/api/notifications/daily-reminder`
4. **Notificação de Inatividade** - `/api/notifications/inactivity`
5. **Notificação de Streak** - `/api/notifications/streak`
6. **Notificação de Conquista** - `/api/notifications/achievement`
7. **Desafio Semanal** - `/api/notifications/weekly-challenge`
8. **Atividade de Amigo** - `/api/notifications/friend-activity`
9. **Notificação de Revisão** - `/api/notifications/review`

### Agendamento Automático

O sistema inclui um agendador que verifica e envia notificações automaticamente:
- **Lembretes Diários** - Baseado nos horários configurados pelos usuários
- **Inatividade** - Detecta usuários sem atividade e notifica
- **Streaks** - Lembra usuários de manter suas sequências

## 📦 Estrutura de Arquivos

```
src/
├── services/
│   ├── fcmService.js              # Serviço principal de FCM
│   └── notificationScheduler.js  # Agendador de notificações
├── scripts/
│   └── scheduleNotifications.js   # Script para executar agendamentos
└── server.js                      # Endpoints REST
```

## 🔧 Configuração

### 1. Variáveis de Ambiente

Certifique-se de que as seguintes variáveis estão configuradas no `.env`:

```env
FIREBASE_PROJECT_ID=seu-project-id
FIREBASE_CLIENT_EMAIL=seu-client-email
FIREBASE_PRIVATE_KEY="sua-private-key"
```

### 2. Estrutura do Firestore

O sistema espera que os tokens FCM estejam armazenados em:

**Coleção:** `fcm_tokens`
**Documento:** `{userId}`
**Campos:**
```javascript
{
  token: "fcm_token_aqui",
  userId: "user123",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
}
```

**Coleção:** `users`
**Documento:** `{userId}`
**Campos relevantes:**
```javascript
{
  notificationSettings: {
    enabled: true,
    dailyReminders: { ... },
    inactivityReminders: { ... },
    streakReminders: { ... }
  },
  stats: {
    streak: {
      current: 5,
      lastActivityDate: "2024-01-01T00:00:00.000Z"
    }
  }
}
```

## 📡 Uso dos Endpoints

### Exemplo 1: Enviar Notificação Personalizada

```bash
curl -X POST http://localhost:3001/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "notification": {
      "title": "Bem-vindo!",
      "body": "Comece a treinar agora!",
      "type": "welcome",
      "url": "/"
    }
  }'
```

### Exemplo 2: Enviar Notificação de Conquista

```bash
curl -X POST http://localhost:3001/api/notifications/achievement \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "achievementType": "levelUp",
    "details": {
      "level": 10,
      "xp": 5000
    }
  }'
```

### Exemplo 3: Enviar para Múltiplos Usuários

```bash
curl -X POST http://localhost:3001/api/notifications/send-multiple \
  -H "Content-Type: application/json" \
  -d '{
    "userIds": ["user1", "user2", "user3"],
    "notification": {
      "title": "Novo recurso!",
      "body": "Confira as novas funcionalidades!",
      "type": "announcement",
      "url": "/features"
    }
  }'
```

## ⏰ Agendamento Automático

### Execução Manual

```bash
npm run schedule-notifications
```

### Agendamento via Cron (Linux/Mac)

Adicione ao crontab para executar a cada minuto:

```bash
* * * * * cd /path/to/learnfun-backend && npm run schedule-notifications
```

### Agendamento via Task Scheduler (Windows)

1. Abra o Task Scheduler
2. Crie uma nova tarefa
3. Configure para executar: `node src/scripts/scheduleNotifications.js`
4. Configure o agendamento para executar a cada minuto

### Agendamento via Node.js (Recomendado)

Você pode usar bibliotecas como `node-cron` para agendar dentro do próprio servidor:

```javascript
import cron from 'node-cron';
import { runScheduledNotifications } from './services/notificationScheduler.js';

// Executa a cada minuto
cron.schedule('* * * * *', async () => {
  await runScheduledNotifications();
});
```

## 🔍 Monitoramento

### Logs

O sistema gera logs detalhados:
- ✅ Sucesso ao enviar notificações
- ⚠️ Avisos (tokens não encontrados)
- ❌ Erros (falhas ao enviar)

### Métricas

Cada execução do agendador retorna:
```javascript
{
  dailyReminders: {
    checked: 100,
    notified: 5,
    errors: 0
  },
  inactivity: {
    checked: 100,
    notified: 2,
    errors: 0
  },
  streaks: {
    checked: 100,
    notified: 3,
    errors: 0
  }
}
```

## 🐛 Troubleshooting

### Token não encontrado

- Verifique se o usuário tem token FCM salvo no Firestore
- Verifique se o userId está correto
- Confirme que o frontend está registrando tokens corretamente

### Token inválido

- Tokens inválidos são removidos automaticamente
- O usuário precisa gerar um novo token no frontend
- Verifique se o VAPID_KEY está configurado corretamente

### Notificações não chegam

- Verifique se o Firebase Admin está configurado corretamente
- Confirme que as permissões de notificação foram concedidas no navegador
- Verifique os logs do Service Worker no navegador

## 📚 Documentação Adicional

- [FCM_API_DOCS.md](./FCM_API_DOCS.md) - Documentação completa da API
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [FCM REST API](https://firebase.google.com/docs/cloud-messaging/send-message)

## 🔐 Segurança

**⚠️ IMPORTANTE:** Atualmente os endpoints não requerem autenticação. Para produção:

1. Adicione autenticação JWT
2. Valide tokens Firebase nos endpoints
3. Implemente rate limiting
4. Adicione logs de auditoria

Exemplo de middleware de autenticação:

```javascript
import { verifyFirebaseToken } from './config/firebase.js';

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  
  const result = await verifyFirebaseToken(token);
  
  if (!result.success) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  
  req.user = result;
  next();
};

app.post('/api/notifications/send', authenticate, async (req, res) => {
  // ...
});
```

