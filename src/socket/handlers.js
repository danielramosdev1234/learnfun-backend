import { verifyFirebaseToken } from '../config/firebase.js';
import {
  syncProfileFromFirebase,
  setUserOnlineStatus,
  getUserProfile
} from '../services/profileService.js';
import {
  createRoom,
  getActiveRooms,
  getRoomDetails,
  joinRoom,
  leaveRoom,
  promoteUserToSpeaker,
  updateUserMuteStatus,
  closeRoom
} from '../services/roomService.js';
import { supabase } from '../config/supabase.js';
import { WebRTCService } from '../services/webrtcService.js';

export const setupSocketHandlers = (io) => {
const webrtcService = new WebRTCService(io);
  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    // Autenticação
    socket.on('auth', async ({ firebaseToken, userData }) => {
      try {
        const result = await verifyFirebaseToken(firebaseToken);

        if (!result.success) {
          socket.emit('auth-error', { error: 'Invalid token' });
          return;
        }

        socket.userId = result.uid;
        socket.join(`user:${socket.userId}`);

        // Sync profile no Supabase
        await syncProfileFromFirebase(
          { uid: result.uid, ...userData },
          {
            currentLevel: userData.currentLevel,
            totalPhrases: userData.totalPhrases
          }
        );

        // Set online status
        await setUserOnlineStatus(socket.userId, true);

        socket.emit('auth-success', { userId: socket.userId });
        console.log('✅ User authenticated:', socket.userId);
      } catch (error) {
        console.error('Auth error:', error);
        socket.emit('auth-error', { error: error.message });
      }
    });

    // ✨ MODIFICADO: Criar sala e entrar automaticamente
    socket.on('create-room', async (roomData) => {
      if (!socket.userId) {
        socket.emit('room-error', { error: 'Not authenticated' });
        return;
      }

      const result = await createRoom(socket.userId, roomData);

      if (result.success) {
        // Entrar na sala automaticamente
        socket.join(`room:${result.room.id}`);
        socket.currentRoomId = result.room.id;

        // Broadcast para todos sobre a nova sala
        io.emit('room-created', result.room);

        // Buscar detalhes completos da sala para o criador
        const fullRoom = await getRoomDetails(result.room.id);
        const profile = await getUserProfile(socket.userId);

        // Enviar dados completos da sala para o criador
        socket.emit('room-joined', fullRoom);

        console.log('✅ Room created and creator joined:', result.room.id);
        console.log('👤 Creator is now speaker:', socket.userId);
      } else {
        socket.emit('room-error', { error: result.error });
      }
    });

    // Listar salas
    socket.on('get-rooms', async () => {
      const rooms = await getActiveRooms();
      socket.emit('rooms-list', rooms);
    });

    // Entrar em sala
    socket.on('join-room', async ({ roomId }) => {
      if (!socket.userId) {
        socket.emit('room-error', { error: 'Not authenticated' });
        return;
      }

      const result = await joinRoom(roomId, socket.userId);

      if (result.success) {
        socket.join(`room:${roomId}`);
        socket.currentRoomId = roomId;

        webrtcService.addPeer(roomId, socket.userId, socket.id);

        const room = await getRoomDetails(roomId);
        const profile = await getUserProfile(socket.userId);

        // Enviar lista de peers existentes QUE SÃO SPEAKERS para o novo usuário
        const existingPeers = webrtcService.getRoomPeers(roomId)
          .filter(id => id !== socket.userId);

        socket.emit('existing-peers', { peers: existingPeers });

        socket.emit('room-joined', room);

        // ✨ MODIFICAR: Notificar a sala sobre o novo usuário
        socket.to(`room:${roomId}`).emit('user-joined', {
          userId: socket.userId,
          username: profile.username,
          avatar: profile.avatar_url
        });



        console.log(`✅ User ${socket.userId} joined room ${roomId}`);
      } else {
        socket.emit('room-error', { error: result.error });
      }
    });

    // ✨ MODIFICADO: Sair de sala com verificação de criador
    socket.on('leave-room', async ({ roomId }) => {
      if (!socket.userId) return;

      webrtcService.removePeer(roomId, socket.userId);

      // ✅ Remover usuário da sala no banco de dados
      await leaveRoom(roomId, socket.userId);
      const profile = await getUserProfile(socket.userId);

      // ✅ Notificar outros usuários sobre a saída
      socket.to(`room:${roomId}`).emit('user-left', {
        userId: socket.userId,
        username: profile.username
      });

      console.log(`👋 User ${socket.userId} left room ${roomId}`);

      // ✅ Remover socket da sala do Socket.IO
      socket.leave(`room:${roomId}`);
      socket.currentRoomId = null;

      // ✅ Verificar quantos usuários ainda estão na sala
      const socketsInRoom = await io.in(`room:${roomId}`).fetchSockets();
      const usersInRoom = socketsInRoom.filter(s => s.userId).length;

      // ✅ Se não há mais ninguém na sala, fechar
      if (usersInRoom === 0) {
        console.log('🚪 Last user left, closing room:', roomId);

        io.to(`room:${roomId}`).emit('room-closed', {
          roomId: roomId,
          message: 'Room closed - no users remaining'
        });

        await closeRoom(roomId);

        // Broadcast atualização da lista de salas
        const rooms = await getActiveRooms();
        io.emit('rooms-list', rooms);

        console.log('🔒 Room closed:', roomId);
      } else {
        console.log(`👥 ${usersInRoom} user(s) still in room:`, roomId);
      }
    });

    socket.on('send-emotion', async (data) => {
      try {
        // ✅ Buscar perfil do usuário para pegar o username
        const profile = await getUserProfile(data.userId);

        if (!profile) {
          console.error('❌ Profile not found for user:', data.userId);
          return;
        }

        const emotionData = {
          userId: data.userId,
          identity: profile.username, // ✅ ADICIONAR IDENTITY
          emotion: data.emotion,
          roomId: data.roomId
        };

        console.log('😊 Broadcasting emotion:', emotionData);

        // ✅ Emitir para TODA a sala (incluindo o remetente)
        io.to(`room:${data.roomId}`).emit('emotion', emotionData);

      } catch (error) {
        console.error('❌ Error sending emotion:', error);
      }
    });

    socket.on('promote-to-speaker', async ({ roomId, userId }) => {
      if (!socket.userId) return;

      const room = await getRoomDetails(roomId);
      if (room.creator_id !== socket.userId) {
        socket.emit('room-error', { error: 'Only room creator can promote users' });
        return;
      }

      const result = await promoteUserToSpeaker(roomId, userId);

      if (result.success) {
        const profile = await getUserProfile(userId);

        // ✨ ADICIONAR peer ao WebRTC
        webrtcService.addPeer(roomId, userId,
          Array.from(io.sockets.sockets.values())
            .find(s => s.userId === userId)?.id
        );

        // ✨ MODIFICADO: Broadcast para TODOS na sala
        io.to(`room:${roomId}`).emit('user-promoted', {
          userId: userId,
          username: profile.username,
          avatar: profile.avatar_url
        });

        console.log(`🎤 User ${userId} promoted to speaker in room ${roomId}`);
      } else {
        socket.emit('room-error', { error: result.error });
      }
    });

    // ✨ NOVO: Handler para requisitar lista de peers
    socket.on('request-peers', ({ roomId }) => {
      if (!socket.userId) return;

      const existingPeers = webrtcService.getRoomPeers(roomId)
        .filter(id => id !== socket.userId);

      socket.emit('existing-peers', { peers: existingPeers });

      console.log(`📋 Sent peer list to ${socket.userId}:`, existingPeers);
    });

    // Mensagem na sala
    socket.on('room-message', async ({ roomId, content, messageType, metadata }) => {
      if (!socket.userId) return;

      try {
        const { data, error } = await supabase
          .from('room_messages')
          .insert({
            room_id: roomId,
            user_id: socket.userId,
            content,
            message_type: messageType || 'text',
            metadata: metadata || null
          })
          .select(`
            *,
            profiles (username, avatar_url)
          `)
          .single();

        if (error) throw error;

        io.to(`room:${roomId}`).emit('message', data);
        console.log(`💬 Message sent in room ${roomId}`);
      } catch (error) {
        console.error('Message error:', error);
        socket.emit('message-error', { error: error.message });
      }
    });

    // Levantar mão
    socket.on('raise-hand', async ({ roomId }) => {
      if (!socket.userId) return;

      const profile = await getUserProfile(socket.userId);

      io.to(`room:${roomId}`).emit('raise-hand', {
        userId: socket.userId,
        username: profile.username,
        avatar: profile.avatar_url
      });

      console.log(`✋ User ${socket.userId} raised hand in room ${roomId}`);
    });


    // Toggle mute
    socket.on('toggle-mute', async ({ roomId, muted }) => {
      if (!socket.userId) return;

      await updateUserMuteStatus(roomId, socket.userId, muted);

      io.to(`room:${roomId}`).emit('user-muted', {
        userId: socket.userId,
        muted
      });

      console.log(`🔇 User ${socket.userId} ${muted ? 'muted' : 'unmuted'} in room ${roomId}`);
    });

    // 🎤 WebRTC Signaling
        socket.on('webrtc-offer', async ({ roomId, targetUserId, offer }) => {
          if (!socket.userId) return;

          console.log(`📞 Routing offer from ${socket.userId} to ${targetUserId}`);

          // ✨ ADICIONAR: Buscar todos os sockets conectados
          const sockets = await io.fetchSockets();
          const targetSocket = sockets.find(s => s.userId === targetUserId);

          if (targetSocket) {
            targetSocket.emit('webrtc-offer', {
              fromUserId: socket.userId,
              offer
            });
            console.log(`✅ Offer delivered to ${targetUserId}`);
          } else {
            console.warn(`⚠️ Target user ${targetUserId} not found`);
            socket.emit('webrtc-error', {
              error: 'Target user not connected',
              targetUserId
            });
          }
        });

        socket.on('webrtc-answer', async ({ roomId, targetUserId, answer }) => {
          if (!socket.userId) return;

          console.log(`📞 Routing answer from ${socket.userId} to ${targetUserId}`);

          const sockets = await io.fetchSockets();
          const targetSocket = sockets.find(s => s.userId === targetUserId);

          if (targetSocket) {
            targetSocket.emit('webrtc-answer', {
              fromUserId: socket.userId,
              answer
            });
            console.log(`✅ Answer delivered to ${targetUserId}`);
          } else {
            console.warn(`⚠️ Target user ${targetUserId} not found`);
          }
        });

        socket.on('webrtc-ice-candidate', async ({ roomId, targetUserId, candidate }) => {
          if (!socket.userId) return;

          const sockets = await io.fetchSockets();
          const targetSocket = sockets.find(s => s.userId === targetUserId);

          if (targetSocket) {
            targetSocket.emit('webrtc-ice-candidate', {
              fromUserId: socket.userId,
              candidate
            });
          }
        });

        // 🔊 Audio Level Updates (para animação dos avatares)
        socket.on('audio-level', ({ roomId, level }) => {
          if (!socket.userId) return;

          // Broadcast apenas para o room, não para si mesmo
          socket.to(`room:${roomId}`).emit('user-audio-level', {
            userId: socket.userId,
            level
          });
        });

    // ✨ MODIFICADO: Disconnect com verificação de criador
    socket.on('disconnect', async () => {
      if (socket.userId) {
        if (socket.currentRoomId) {
          webrtcService.removePeer(socket.currentRoomId, socket.userId);
        }

        // ✅ Timeout antes de marcar offline
        setTimeout(async () => {
          // Verificar se reconectou nesse tempo
          const stillDisconnected = !Array.from(io.sockets.sockets.values())
            .some(s => s.userId === socket.userId && s.connected);

          if (stillDisconnected) {
            await setUserOnlineStatus(socket.userId, false);

            // Se estava em uma sala E continua desconectado, processa saída
            if (socket.currentRoomId) {
              const room = await getRoomDetails(socket.currentRoomId);

              // ✅ NOVA LÓGICA: Remover usuário da sala
              await leaveRoom(socket.currentRoomId, socket.userId);
              const profile = await getUserProfile(socket.userId);

              // Notificar outros usuários que esse saiu
              socket.to(`room:${socket.currentRoomId}`).emit('user-left', {
                userId: socket.userId,
                username: profile.username
              });

              // ✅ Verificar quantos usuários ainda estão na sala
              const socketsInRoom = await io.in(`room:${socket.currentRoomId}`).fetchSockets();
              const usersInRoom = socketsInRoom.filter(s => s.userId).length;

              // ✅ Se não há mais ninguém na sala, fechar
              if (usersInRoom === 0) {
                console.log('🚪 Last user left, closing room:', socket.currentRoomId);

                io.to(`room:${socket.currentRoomId}`).emit('room-closed', {
                  roomId: socket.currentRoomId,
                  message: 'Room closed - no users remaining'
                });

                await closeRoom(socket.currentRoomId);

                const rooms = await getActiveRooms();
                io.emit('rooms-list', rooms);
              } else {
                console.log(`👥 ${usersInRoom} user(s) still in room:`, socket.currentRoomId);
              }
            }

            console.log('👋 User disconnected (confirmed):', socket.userId);
          } else {
            console.log('🔄 User reconnected, keeping session:', socket.userId);
          }
        }, 500); // Esperar 500ms antes de processar desconexão
      }
    });
  });
};