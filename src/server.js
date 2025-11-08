import dotenv from 'dotenv';

// IMPORTANTE: Carregar variáveis de ambiente ANTES de qualquer outra importação
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSocketHandlers } from './socket/handlers.js';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';

const app = express();
const server = createServer(app);


// ✅ Configuração LiveKit (variáveis de ambiente)
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY; // Ex: APIxxx
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET; // Ex: secretxxx
const LIVEKIT_URL = process.env.LIVEKIT_URL; // Ex: wss://your-project.livekit.cloud

// CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());

// Socket.io com CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
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


// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.io ready`);
  console.log(`🌐 CORS allowed origins:`, allowedOrigins);
});