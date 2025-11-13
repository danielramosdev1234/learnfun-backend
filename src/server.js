import dotenv from 'dotenv';

// IMPORTANTE: Carregar variáveis de ambiente ANTES de qualquer outra importação
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSocketHandlers } from './socket/handlers.js';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import {
  sendNotification,
  sendMulticastNotification,
  sendDailyReminder,
  sendInactivityReminder,
  sendStreakReminder,
  sendAchievementNotification,
  sendWeeklyChallengeNotification,
  sendFriendActivityNotification,
  sendReviewReminder
} from './services/fcmService.js';
import { authenticate, authorizeUser, requireAdmin } from './middleware/auth.js';
import { rateLimit, notificationRateLimit } from './middleware/rateLimit.js';
import { auditLogger } from './middleware/logger.js';

const app = express();
const server = createServer(app);


// ✅ Configuração LiveKit (variáveis de ambiente)
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY; // Ex: APIxxx
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET; // Ex: secretxxx
const LIVEKIT_URL = process.env.LIVEKIT_URL; // Ex: wss://your-project.livekit.cloud

// CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
                                                                    'http://localhost:5173',
                                                                    'https://learnfun-sigma.vercel.app'  // ✅ Adicione sua URL do Vercel
                                                                  ];;

app.use(cors({
  origin: (origin, callback) => {
    // Permite requisições sem origin (mobile apps, Postman, etc)
    if (!origin) {
      console.log('🌐 [CORS] Requisição sem origin (permitida)');
      return callback(null, true);
    }

    console.log('🌐 [CORS] Verificando origin:', origin);
    console.log('🌐 [CORS] Origens permitidas:', allowedOrigins);

    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('✅ [CORS] Origin permitida:', origin);
      callback(null, true);
    } else {
      console.warn('❌ [CORS] Origin bloqueada:', origin);
      console.warn('❌ [CORS] Origens permitidas:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Configura trust proxy para obter IP real em produção
app.set('trust proxy', true);

// Socket.io com CORS
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'], // ✅ Adiciona polling como fallback
  allowEIO3: true
});

// Setup Socket handlers
setupSocketHandlers(io);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// ROTA: POST /api/livekit/token
// ============================================
app.post('/api/livekit/token', async (req, res) => {
  try {
    const { roomName, participantName, participantMetadata } = req.body;

    // ✅ Validações
    if (!roomName || !participantName) {
      return res.status(400).json({
        error: 'roomName and participantName are required'
      });
    }

    // ✅ Criar token de acesso
    const at = new AccessToken(
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
      {
        identity: participantName,
        metadata: participantMetadata, // JSON com info do usuário
      }
    );

    // ✅ Permissões do token (APENAS ÁUDIO)
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,

      // 🔒 BLOQUEAR VÍDEO
      canPublishSources: [TrackSource.MICROPHONE], // Apenas microfone, SEM câmera
    });

    // ✅ Gerar JWT
    const token = await at.toJwt();

    console.log(`✅ Token gerado para ${participantName} na sala ${roomName}`);

    res.json({
      token,
      serverUrl: LIVEKIT_URL,
    });

  } catch (error) {
    console.error('❌ Erro ao gerar token LiveKit:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// ============================================
// ROTA: POST /api/livekit/room/create
// (Opcional) Criar sala programaticamente
// ============================================

app.post('/api/livekit/room/create', async (req, res) => {
  try {
    const { roomName, maxParticipants = 10 } = req.body;

    const roomService = new RoomServiceClient(
      LIVEKIT_URL,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET
    );

    const room = await roomService.createRoom({
      name: roomName,
      emptyTimeout: 300, // Fecha após 5min vazia
      maxParticipants: maxParticipants,

      // ✅ Configurações de áudio otimizadas
      metadata: JSON.stringify({
        type: 'audio-only',
        language: 'english',
      })
    });

    console.log(`✅ Sala criada: ${roomName}`);

    res.json({
      room: {
        id: room.sid,
        name: room.name,
        numParticipants: room.numParticipants,
        createdAt: room.creationTime,
      }
    });

  } catch (error) {
    console.error('❌ Erro ao criar sala:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// ============================================
// ROTA: DELETE /api/livekit/room/:roomName
// (Opcional) Fechar sala manualmente
// ============================================
app.delete('/api/livekit/room/:roomName', async (req, res) => {
  try {
    const { roomName } = req.params;

    const roomService = new RoomServiceClient(
      LIVEKIT_URL,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET
    );

    await roomService.deleteRoom(roomName);

    console.log(`✅ Sala fechada: ${roomName}`);

    res.json({ success: true, message: 'Room closed' });

  } catch (error) {
    console.error('❌ Erro ao fechar sala:', error);
    res.status(500).json({ error: 'Failed to close room' });
  }
});

// ============================================
// ROTA: GET /api/livekit/room/:roomName/participants
// (Opcional) Listar participantes
// ============================================
app.get('/api/livekit/room/:roomName/participants', async (req, res) => {
  try {
    const { roomName } = req.params;

    const roomService = new RoomServiceClient(
      LIVEKIT_URL,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET
    );

    const participants = await roomService.listParticipants(roomName);

    res.json({
      room: roomName,
      participants: participants.map(p => ({
        identity: p.identity,
        name: p.name,
        isSpeaking: p.isSpeaking,
        audioLevel: p.audioLevel,
        joinedAt: p.joinedAt,
        metadata: p.metadata ? JSON.parse(p.metadata) : null,
      }))
    });

  } catch (error) {
    console.error('❌ Erro ao listar participantes:', error);
    res.status(500).json({ error: 'Failed to list participants' });
  }
});

// ============================================
// ROTA: POST /api/livekit/participant/mute
// (Opcional) Mutar participante (apenas criador)
// ============================================
app.post('/api/livekit/participant/mute', async (req, res) => {
  try {
    const { roomName, participantIdentity, mute } = req.body;

    const roomService = new RoomServiceClient(
      LIVEKIT_URL,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET
    );

    await roomService.mutePublishedTrack(
      roomName,
      participantIdentity,
      'audio', // tipo de track
      mute
    );

    console.log(`✅ Participante ${participantIdentity} ${mute ? 'mutado' : 'desmutado'}`);

    res.json({ success: true });

  } catch (error) {
    console.error('❌ Erro ao mutar participante:', error);
    res.status(500).json({ error: 'Failed to mute participant' });
  }
});

// ============================================
// 🔔 ROTAS DE NOTIFICAÇÕES PUSH (FCM)
// ============================================

/**
 * POST /api/notifications/send
 * Envia notificação push para um usuário
 * Requer autenticação
 */
app.post('/api/notifications/send', authenticate, authorizeUser, notificationRateLimit, auditLogger, async (req, res) => {
  try {
    console.log('📨 [NOTIFICATION] Recebida requisição para enviar notificação');
    console.log('📋 [NOTIFICATION] Body:', JSON.stringify(req.body, null, 2));
    console.log('👤 [NOTIFICATION] User:', req.user);
    
    const { userId, notification } = req.body;

    if (!userId || !notification) {
      console.error('❌ [NOTIFICATION] Dados faltando:', { userId: !!userId, notification: !!notification });
      return res.status(400).json({
        error: 'userId e notification são obrigatórios'
      });
    }

    console.log('🚀 [NOTIFICATION] Enviando notificação para userId:', userId);
    const result = await sendNotification(userId, notification);
    console.log('📊 [NOTIFICATION] Resultado:', result);

    if (result.success) {
      res.json({ success: true, messageId: result.messageId });
    } else {
      console.error('❌ [NOTIFICATION] Falha ao enviar:', result.error);
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('❌ [NOTIFICATION] Erro ao enviar notificação:', error);
    console.error('❌ [NOTIFICATION] Stack:', error.stack);
    res.status(500).json({ error: 'Failed to send notification', details: error.message });
  }
});

/**
 * POST /api/notifications/send-multiple
 * Envia notificação push para múltiplos usuários
 * Requer autenticação e permissão de admin
 */
app.post('/api/notifications/send-multiple', authenticate, requireAdmin, rateLimit(5, 60 * 1000), auditLogger, async (req, res) => {
  try {
    const { userIds, notification } = req.body;

    if (!userIds || !Array.isArray(userIds) || !notification) {
      return res.status(400).json({
        error: 'userIds (array) e notification são obrigatórios'
      });
    }

    const result = await sendMulticastNotification(userIds, notification);

    res.json(result);
  } catch (error) {
    console.error('❌ Erro ao enviar notificações múltiplas:', error);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

/**
 * POST /api/notifications/daily-reminder
 * Envia lembrete diário
 * Requer autenticação
 */
app.post('/api/notifications/daily-reminder', authenticate, authorizeUser, notificationRateLimit, auditLogger, async (req, res) => {
  try {
    console.log('📅 [DAILY-REMINDER] Recebida requisição');
    console.log('📋 [DAILY-REMINDER] Body:', JSON.stringify(req.body, null, 2));
    
    const { userId, settings } = req.body;

    if (!userId) {
      console.error('❌ [DAILY-REMINDER] userId não fornecido');
      return res.status(400).json({ error: 'userId é obrigatório' });
    }

    console.log('🚀 [DAILY-REMINDER] Enviando para userId:', userId);
    const result = await sendDailyReminder(userId, settings);
    console.log('📊 [DAILY-REMINDER] Resultado:', result);

    res.json(result);
  } catch (error) {
    console.error('❌ [DAILY-REMINDER] Erro:', error);
    console.error('❌ [DAILY-REMINDER] Stack:', error.stack);
    res.status(500).json({ error: 'Failed to send daily reminder', details: error.message });
  }
});

/**
 * POST /api/notifications/inactivity
 * Envia notificação de inatividade
 * Requer autenticação
 */
app.post('/api/notifications/inactivity', authenticate, authorizeUser, notificationRateLimit, auditLogger, async (req, res) => {
  try {
    const { userId, daysWithoutActivity } = req.body;

    if (!userId || daysWithoutActivity === undefined) {
      return res.status(400).json({
        error: 'userId e daysWithoutActivity são obrigatórios'
      });
    }

    const result = await sendInactivityReminder(userId, daysWithoutActivity);

    res.json(result);
  } catch (error) {
    console.error('❌ Erro ao enviar notificação de inatividade:', error);
    res.status(500).json({ error: 'Failed to send inactivity notification' });
  }
});

/**
 * POST /api/notifications/streak
 * Envia notificação de streak
 * Requer autenticação
 */
app.post('/api/notifications/streak', authenticate, authorizeUser, notificationRateLimit, auditLogger, async (req, res) => {
  try {
    const { userId, streak } = req.body;

    if (!userId || streak === undefined) {
      return res.status(400).json({
        error: 'userId e streak são obrigatórios'
      });
    }

    const result = await sendStreakReminder(userId, streak);

    res.json(result);
  } catch (error) {
    console.error('❌ Erro ao enviar notificação de streak:', error);
    res.status(500).json({ error: 'Failed to send streak notification' });
  }
});

/**
 * POST /api/notifications/achievement
 * Envia notificação de conquista
 * Requer autenticação
 */
app.post('/api/notifications/achievement', authenticate, authorizeUser, notificationRateLimit, auditLogger, async (req, res) => {
  try {
    const { userId, achievementType, details } = req.body;

    if (!userId || !achievementType) {
      return res.status(400).json({
        error: 'userId e achievementType são obrigatórios'
      });
    }

    const result = await sendAchievementNotification(userId, achievementType, details);

    res.json(result);
  } catch (error) {
    console.error('❌ Erro ao enviar notificação de conquista:', error);
    res.status(500).json({ error: 'Failed to send achievement notification' });
  }
});

/**
 * POST /api/notifications/weekly-challenge
 * Envia notificação de desafio semanal
 * Requer autenticação
 */
app.post('/api/notifications/weekly-challenge', authenticate, authorizeUser, notificationRateLimit, auditLogger, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }

    const result = await sendWeeklyChallengeNotification(userId);

    res.json(result);
  } catch (error) {
    console.error('❌ Erro ao enviar notificação de desafio semanal:', error);
    res.status(500).json({ error: 'Failed to send weekly challenge notification' });
  }
});

/**
 * POST /api/notifications/friend-activity
 * Envia notificação de atividade de amigo
 * Requer autenticação
 */
app.post('/api/notifications/friend-activity', authenticate, authorizeUser, notificationRateLimit, auditLogger, async (req, res) => {
  try {
    const { userId, friendName, action } = req.body;

    if (!userId || !friendName || !action) {
      return res.status(400).json({
        error: 'userId, friendName e action são obrigatórios'
      });
    }

    const result = await sendFriendActivityNotification(userId, friendName, action);

    res.json(result);
  } catch (error) {
    console.error('❌ Erro ao enviar notificação de atividade de amigo:', error);
    res.status(500).json({ error: 'Failed to send friend activity notification' });
  }
});

/**
 * POST /api/notifications/review
 * Envia notificação de revisão
 * Requer autenticação
 */
app.post('/api/notifications/review', authenticate, authorizeUser, notificationRateLimit, auditLogger, async (req, res) => {
  try {
    const { userId, difficultPhrasesCount } = req.body;

    if (!userId || difficultPhrasesCount === undefined) {
      return res.status(400).json({
        error: 'userId e difficultPhrasesCount são obrigatórios'
      });
    }

    const result = await sendReviewReminder(userId, difficultPhrasesCount);

    res.json(result);
  } catch (error) {
    console.error('❌ Erro ao enviar notificação de revisão:', error);
    res.status(500).json({ error: 'Failed to send review notification' });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.io ready`);
  console.log(`🌐 CORS allowed origins:`, allowedOrigins);
  console.log(`🔔 Notification endpoints ready:`);
  console.log(`   - POST /api/notifications/send`);
  console.log(`   - POST /api/notifications/daily-reminder`);
  console.log(`   - POST /api/notifications/inactivity`);
  console.log(`   - POST /api/notifications/streak`);
  console.log(`   - POST /api/notifications/achievement`);
  console.log(`   - POST /api/notifications/weekly-challenge`);
  console.log(`   - POST /api/notifications/friend-activity`);
  console.log(`   - POST /api/notifications/review`);
  console.log(`📋 Environment variables:`);
  console.log(`   - PORT: ${PORT}`);
  console.log(`   - ALLOWED_ORIGINS: ${process.env.ALLOWED_ORIGINS || 'default'}`);
  console.log(`   - FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID ? '✅ configurado' : '❌ não configurado'}`);
});