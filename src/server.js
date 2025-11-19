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
import { runScheduledGlobalNotifications } from './services/globalNotifications.js';
import { synthesizeSpeech, RECOMMENDED_VOICES, listAvailableVoices } from './services/edgeTTSService.js';

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
// 🎤 ROTAS TTS (Text-to-Speech) - VERSÃO MELHORADA
// Substitua as rotas TTS existentes no server.js por estas
// ============================================

/**
 * GET /api/tts/voices
 * Lista vozes disponíveis do Edge TTS
 */
app.get('/api/tts/voices', async (req, res) => {
  try {
    const { language } = req.query;

    let voices = RECOMMENDED_VOICES;

    // Filtrar por idioma se especificado
    if (language) {
      voices = voices.filter(v => v.language === language);
    }

    res.json({
      success: true,
      voices,
      total: voices.length
    });

  } catch (error) {
    console.error('❌ Erro ao listar vozes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list voices'
    });
  }
});

/**
 * POST /api/tts/synthesize
 * Sintetiza texto em áudio usando Edge TTS
 *
 * Body:
 * {
 *   "text": "Hello, how are you?",
 *   "voice": "en-US-JennyNeural",
 *   "rate": 0.9,
 *   "pitch": 0
 * }
 */
app.post('/api/tts/synthesize', async (req, res) => {
  try {
    const { text, voice = 'en-US-JennyNeural', rate = 0.9, pitch = 0 } = req.body;

    // Validações
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    if (text.length > 5000) {
      return res.status(400).json({
        success: false,
        error: 'Text too long (max 5000 characters)'
      });
    }

    // Limpar texto (remover emojis e markdown)
    const cleanText = text
      .replace(/[#*_~`]/g, '')
      .replace(/\*\*/g, '')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove caracteres de controle
      .replace(/[📝💡✅🎯📚👍❤️🤔🔥]/g, '')
      .split('---')[0] // Pegar apenas a parte principal
      .trim();

    if (cleanText.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Text is empty after cleaning'
      });
    }

    console.log('🎤 [TTS API] Synthesizing speech...');
    console.log('📝 [TTS API] Text length:', cleanText.length);
    console.log('🗣️ [TTS API] Voice requested:', voice);

    // Sintetizar áudio (com fallback automático)
    const audioBuffer = await synthesizeSpeech(cleanText, voice, rate, pitch);

    // Retornar áudio como base64
    const audioBase64 = audioBuffer.toString('base64');

    res.json({
      success: true,
      audio: audioBase64,
      voice,
      rate,
      pitch,
      textLength: cleanText.length,
      audioSize: audioBuffer.length
    });

  } catch (error) {
    console.error('❌ [TTS API] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to synthesize speech',
      details: error.message
    });
  }
});

/**
 * POST /api/tts/synthesize-stream
 * Alternativa: retorna áudio diretamente como stream (mais eficiente)
 */
app.post('/api/tts/synthesize-stream', async (req, res) => {
  try {
    const { text, voice = 'en-US-JennyNeural', rate = 0.9, pitch = 0 } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Limpar texto
    const cleanText = text
      .replace(/[#*_~`]/g, '')
      .replace(/\*\*/g, '')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/[📝💡✅🎯📚👍❤️🤔🔥]/g, '')
      .split('---')[0]
      .trim();

    // Sintetizar áudio
    const audioBuffer = await synthesizeSpeech(cleanText, voice, rate, pitch);

    // Configurar headers para áudio
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Content-Disposition': 'inline; filename="speech.mp3"',
      'Cache-Control': 'public, max-age=3600' // Cache por 1 hora
    });

    res.send(audioBuffer);

  } catch (error) {
    console.error('❌ [TTS STREAM] Error:', error);
    res.status(500).json({ error: 'Failed to synthesize speech', details: error.message });
  }
});

/**
 * GET /api/tts/test
 * Endpoint de teste MELHORADO
 * Testa múltiplas vozes e retorna diagnóstico completo
 */
app.get('/api/tts/test', async (req, res) => {
  try {
    console.log('🧪 [TTS TEST] Iniciando teste completo do sistema TTS...');

    const results = {
      systemStatus: 'unknown',
      edgeTTSInstalled: false,
      voicesAvailable: 0,
      testResults: []
    };

    // 1. Verificar se edge-tts está instalado
    try {
      await execAsync('edge-tts --version', { timeout: 5000 });
      results.edgeTTSInstalled = true;
      console.log('✅ [TTS TEST] Edge TTS instalado');
    } catch (error) {
      results.systemStatus = 'edge-tts não instalado';
      console.error('❌ [TTS TEST] Edge TTS não instalado');
      return res.json(results);
    }

    // 2. Listar vozes disponíveis
    try {
      const voices = await listAvailableVoices();
      results.voicesAvailable = voices.length;
      console.log(`✅ [TTS TEST] ${voices.length} vozes disponíveis`);
    } catch (error) {
      console.error('❌ [TTS TEST] Erro ao listar vozes:', error);
    }

    // 3. Testar vozes de fallback
    const testText = "Hello! This is a test.";
    const testVoices = [
      'en-US-JennyNeural',
      'en-US-GuyNeural',
      'en-GB-SoniaNeural',
      'en-AU-NatashaNeural'
    ];

    for (const voiceName of testVoices) {
      try {
        console.log(`🧪 [TTS TEST] Testando voz: ${voiceName}...`);
        const startTime = Date.now();

        const audioBuffer = await synthesizeSpeech(testText, voiceName, 1.0, 0);
        const duration = Date.now() - startTime;

        results.testResults.push({
          voice: voiceName,
          status: 'success',
          audioSize: audioBuffer.length,
          audioSizeKB: (audioBuffer.length / 1024).toFixed(2),
          duration: `${duration}ms`
        });

        console.log(`✅ [TTS TEST] ${voiceName}: ${(audioBuffer.length / 1024).toFixed(2)} KB em ${duration}ms`);
      } catch (error) {
        results.testResults.push({
          voice: voiceName,
          status: 'failed',
          error: error.message
        });
        console.error(`❌ [TTS TEST] ${voiceName} falhou:`, error.message);
      }
    }

    // Determinar status geral
    const successCount = results.testResults.filter(r => r.status === 'success').length;
    if (successCount === testVoices.length) {
      results.systemStatus = 'excellent';
    } else if (successCount > 0) {
      results.systemStatus = 'partial';
    } else {
      results.systemStatus = 'failed';
    }

    console.log(`🏁 [TTS TEST] Teste concluído: ${successCount}/${testVoices.length} vozes funcionando`);

    res.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
      message: `Sistema TTS ${results.systemStatus === 'excellent' ? 'funcionando perfeitamente' :
                results.systemStatus === 'partial' ? 'funcionando parcialmente' : 'com problemas'}`
    });

  } catch (error) {
    console.error('❌ [TTS TEST] Erro geral:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      hint: 'Make sure edge-tts is installed: pip install edge-tts'
    });
  }
});

/**
 * POST /api/tts/validate-voice
 * Valida se uma voz específica está disponível
 */
app.post('/api/tts/validate-voice', async (req, res) => {
  try {
    const { voice } = req.body;

    if (!voice) {
      return res.status(400).json({ error: 'Voice name is required' });
    }

    console.log(`🔍 [TTS VALIDATE] Verificando voz: ${voice}...`);

    // Tenta sintetizar um texto curto
    try {
      const testText = "Test";
      await synthesizeSpeech(testText, voice, 1.0, 0);

      res.json({
        success: true,
        voice,
        available: true,
        message: 'Voice is available and working'
      });
    } catch (error) {
      res.json({
        success: false,
        voice,
        available: false,
        message: 'Voice not available or not working',
        error: error.message
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
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

// ============================================
// ⏰ ROTA: POST /api/notifications/schedule-global
// Executa notificações globais agendadas (cron job)
// Horários fixos: 9:30, 12:00, 20:00
// ============================================

/**
 * POST /api/notifications/schedule-global
 * Executa notificações globais agendadas em horários fixos
 * Protegido por token secreto (para uso com cron jobs externos)
 * 
 * Horários:
 * - 9:30: Lembrete para treinar
 * - 12:00: Lembrete de streak
 * - 20:00: Mensagem motivadora
 */
app.post('/api/notifications/schedule-global', async (req, res) => {
  try {
    // Verifica token secreto para proteger o endpoint
    const scheduleToken = process.env.SCHEDULE_TOKEN || 'change-me-in-production';
    const providedToken = req.headers['x-schedule-token'] || req.body.token;
    
    if (!providedToken || providedToken !== scheduleToken) {
      console.warn('❌ [SCHEDULE-GLOBAL] Tentativa de acesso sem token válido');
      return res.status(401).json({
        error: 'Token inválido',
        message: 'Forneça um token válido no header x-schedule-token'
      });
    }

    // Extrai currentHour e currentMinute do body (se fornecidos)
    const { currentHour, currentMinute } = req.body;

    console.log('⏰ [SCHEDULE-GLOBAL] Executando notificações globais agendadas...');
    console.log('📅 [SCHEDULE-GLOBAL] Data/Hora:', new Date().toISOString());

    if (currentHour !== undefined && currentMinute !== undefined) {
      console.log(`🕒 [SCHEDULE-GLOBAL] Horário recebido: ${currentHour}:${currentMinute}`);
    }

    // Passa os parâmetros para a função
    const results = await runScheduledGlobalNotifications(currentHour, currentMinute);
    
    if (results.executed) {
      console.log('✅ [SCHEDULE-GLOBAL] Execução concluída:', {
        type: results.type,
        sent: results.result?.sent || 0,
        total: results.result?.total || 0
      });
    } else {
      console.log('⏭️ [SCHEDULE-GLOBAL] Nenhuma notificação agendada para este horário');
    }
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      executed: results.executed,
      type: results.type,
      result: results.result
    });
  } catch (error) {
    console.error('❌ [SCHEDULE-GLOBAL] Erro ao executar notificações globais:', error);
    res.status(500).json({
      error: 'Failed to run scheduled global notifications',
      details: error.message
    });
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
  console.log(`⏰ Global scheduled notifications endpoint:`);
  console.log(`   - POST /api/notifications/schedule-global (9:30, 12:00, 20:00)`);
  console.log(`📋 Environment variables:`);
  console.log(`   - PORT: ${PORT}`);
  console.log(`   - ALLOWED_ORIGINS: ${process.env.ALLOWED_ORIGINS || 'default'}`);
  console.log(`   - FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID ? '✅ configurado' : '❌ não configurado'}`);
});