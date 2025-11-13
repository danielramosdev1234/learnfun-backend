# Firebase Cloud Messaging (FCM) API - Documentação

## 📋 Endpoints Disponíveis

### 1. Enviar Notificação Personalizada

**POST** `/api/notifications/send`

Envia uma notificação push personalizada para um usuário.

**Request Body:**
```json
{
  "userId": "user123",
  "notification": {
    "title": "Título da notificação",
    "body": "Corpo da notificação",
    "type": "general",
    "url": "/",
    "icon": "/pwa-192x192.png",
    "image": "https://example.com/image.jpg",
    "requireInteraction": false,
    "tag": "custom-notification",
    "data": {
      "customField": "valor"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "projects/xxx/messages/xxx"
}
```

---

### 2. Enviar Notificação para Múltiplos Usuários

**POST** `/api/notifications/send-multiple`

Envia uma notificação push para múltiplos usuários simultaneamente.

**Request Body:**
```json
{
  "userIds": ["user1", "user2", "user3"],
  "notification": {
    "title": "Notificação em massa",
    "body": "Esta notificação foi enviada para vários usuários",
    "type": "announcement",
    "url": "/"
  }
}
```

**Response:**
```json
{
  "success": true,
  "successCount": 2,
  "failureCount": 1,
  "responses": [...]
}
```

---

### 3. Lembrete Diário

**POST** `/api/notifications/daily-reminder`

Envia um lembrete diário para o usuário treinar.

**Request Body:**
```json
{
  "userId": "user123",
  "settings": {}
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "projects/xxx/messages/xxx"
}
```

---

### 4. Notificação de Inatividade

**POST** `/api/notifications/inactivity`

Notifica o usuário sobre dias sem atividade.

**Request Body:**
```json
{
  "userId": "user123",
  "daysWithoutActivity": 3
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "projects/xxx/messages/xxx"
}
```

---

### 5. Notificação de Streak

**POST** `/api/notifications/streak`

Lembra o usuário de manter sua sequência de dias.

**Request Body:**
```json
{
  "userId": "user123",
  "streak": 15
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "projects/xxx/messages/xxx"
}
```

---

### 6. Notificação de Conquista

**POST** `/api/notifications/achievement`

Parabeniza o usuário por uma conquista.

**Request Body:**
```json
{
  "userId": "user123",
  "achievementType": "levelUp",
  "details": {
    "level": 5,
    "xp": 1000
  }
}
```

**Tipos de conquista disponíveis:**
- `levelUp` - Usuário subiu de nível
- `xpMilestone` - Usuário alcançou um marco de XP
- `challengeCompleted` - Usuário completou um desafio

**Response:**
```json
{
  "success": true,
  "messageId": "projects/xxx/messages/xxx"
}
```

---

### 7. Desafio Semanal

**POST** `/api/notifications/weekly-challenge`

Notifica sobre novo desafio semanal disponível.

**Request Body:**
```json
{
  "userId": "user123"
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "projects/xxx/messages/xxx"
}
```

---

### 8. Atividade de Amigo

**POST** `/api/notifications/friend-activity`

Notifica sobre atividade de um amigo.

**Request Body:**
```json
{
  "userId": "user123",
  "friendName": "João",
  "action": "levelUp"
}
```

**Ações disponíveis:**
- `levelUp` - Amigo subiu de nível
- `challenge` - Amigo completou um desafio

**Response:**
```json
{
  "success": true,
  "messageId": "projects/xxx/messages/xxx"
}
```

---

### 9. Notificação de Revisão

**POST** `/api/notifications/review`

Lembra o usuário de revisar frases difíceis.

**Request Body:**
```json
{
  "userId": "user123",
  "difficultPhrasesCount": 5
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "projects/xxx/messages/xxx"
}
```

---

## 🔧 Exemplos de Uso

### Exemplo 1: Enviar notificação personalizada

```javascript
const response = await fetch('http://localhost:3001/api/notifications/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: 'user123',
    notification: {
      title: 'Bem-vindo!',
      body: 'Comece a treinar agora!',
      type: 'welcome',
      url: '/',
      data: {
        screen: 'dashboard'
      }
    }
  })
});

const result = await response.json();
console.log(result);
```

### Exemplo 2: Enviar notificação de conquista

```javascript
const response = await fetch('http://localhost:3001/api/notifications/achievement', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: 'user123',
    achievementType: 'levelUp',
    details: {
      level: 10,
      xp: 5000
    }
  })
});
```

### Exemplo 3: Enviar para múltiplos usuários

```javascript
const response = await fetch('http://localhost:3001/api/notifications/send-multiple', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userIds: ['user1', 'user2', 'user3'],
    notification: {
      title: 'Novo recurso disponível!',
      body: 'Confira as novas funcionalidades do app!',
      type: 'announcement',
      url: '/features'
    }
  })
});
```

## 🐛 Tratamento de Erros

Todos os endpoints retornam erros no seguinte formato:

```json
{
  "error": "Mensagem de erro"
}
```

**Códigos de status HTTP:**
- `400` - Bad Request (dados inválidos)
- `500` - Internal Server Error (erro no servidor)

**Erros comuns:**
- `Token não encontrado` - Usuário não tem token FCM registrado
- `Token inválido` - Token foi removido automaticamente do Firestore
- `Failed to send notification` - Erro ao enviar via FCM

## 📝 Notas Importantes

1. **Tokens inválidos são removidos automaticamente** do Firestore quando detectados
2. **Notificações multicast** são mais eficientes para múltiplos usuários
3. **Todos os endpoints** retornam informações sobre sucesso/falha
4. **Tokens FCM** são armazenados na coleção `fcm_tokens` do Firestore

## 🔐 Autenticação

Atualmente os endpoints não requerem autenticação. Recomenda-se adicionar autenticação JWT ou similar em produção.

