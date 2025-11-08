import { supabase } from '../config/supabase.js';

export const createRoom = async (creatorId, { title, description, maxParticipants, languageLevel }) => {
  try {
    const { data, error } = await supabase
      .from('rooms')
      .insert({
        title,
        description,
        creator_id: creatorId,
        max_participants: maxParticipants || 10,
        language_level: languageLevel || 'beginner',
        current_participants: 1,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    // ✨ MODIFICADO: Adiciona criador como participante e speaker
    await supabase
      .from('room_participants')
      .insert({
        room_id: data.id,
        user_id: creatorId,
        role: 'speaker',
        is_muted: false
      });

    console.log('✅ Room created with creator as speaker:', data.id);

    return { success: true, room: data };
  } catch (error) {
    console.error('Error creating room:', error);
    return { success: false, error: error.message };
  }
};

export const getActiveRooms = async () => {
  const { data, error } = await supabase
    .from('rooms')
    .select(`
      *,
      profiles:creator_id (username, avatar_url)
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(50);

  return error ? [] : data;
};

export const getRoomDetails = async (roomId) => {
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select(`
        *,
        profiles:creator_id (username, avatar_url),
        room_participants (
          user_id,
          role,
          is_muted,
          profiles (username, avatar_url)
        )
      `)
      .eq('id', roomId)
      .single();

    if (error) {
      console.error('❌ Error fetching room details:', error);
      return null;
    }

    // Se a sala não está ativa, não reativar automaticamente
    if (data && !data.is_active) {
      console.log('⚠️ Room is inactive:', roomId);
      return null;
    }

    return data;
  } catch (error) {
    console.error('❌ Error in getRoomDetails:', error);
    return null;
  }
};

export const joinRoom = async (roomId, userId) => {
  try {
    console.log(`🔍 Attempting to join room ${roomId} for user ${userId}`);

    // Verifica se sala existe e está ativa
    const room = await getRoomDetails(roomId);
    if (!room) {
      console.error('❌ Room not found or inactive:', roomId);
      throw new Error('Room not found or closed');
    }

    // ✨ NOVO: Verifica se o usuário é o criador
    const isCreator = room.creator_id === userId;

    if (isCreator) {
      console.log('👑 Creator rejoining their own room:', roomId);
      // Criador sempre pode entrar
      return { success: true };
    }

    console.log(`✅ Room found: ${room.title}, active: ${room.is_active}, participants: ${room.current_participants}/${room.max_participants}`);

    // Verifica se tem espaço
    if (room.current_participants >= room.max_participants) {
      throw new Error('Room is full');
    }

    // Verifica se já está na sala
    const { data: existing } = await supabase
      .from('room_participants')
      .select('*')
      .match({ room_id: roomId, user_id: userId })
      .single();

    if (existing) {
      console.log(`ℹ️ User ${userId} already in room ${roomId}`);
      return { success: true };
    }

    // Adiciona participante como listener
    const { error } = await supabase
      .from('room_participants')
      .insert({
        room_id: roomId,
        user_id: userId,
        role: 'listener',
        is_muted: true
      });

    if (error) throw error;

    // Atualiza contador de participantes
    const newParticipantCount = (room.room_participants?.length || 0) + 1;
    await supabase
      .from('rooms')
      .update({
        current_participants: newParticipantCount
      })
      .eq('id', roomId);

    console.log(`✅ User ${userId} joined room ${roomId}. New count: ${newParticipantCount}`);

    return { success: true };
  } catch (error) {
    console.error('Error joining room:', error);
    return { success: false, error: error.message };
  }
};

export const leaveRoom = async (roomId, userId) => {
  try {
    console.log(`🚪 User ${userId} leaving room ${roomId}`);

    // Remove participante
    await supabase
      .from('room_participants')
      .delete()
      .match({ room_id: roomId, user_id: userId });

    // Get updated room details
    const room = await getRoomDetails(roomId);
    if (room) {
      const remainingCount = room.room_participants?.length || 0;

      console.log(`📊 Remaining participants in room ${roomId}: ${remainingCount}`);

      // ✨ MODIFICADO: Não desativa automaticamente, só atualiza contador
      await supabase
        .from('rooms')
        .update({
          current_participants: Math.max(0, remainingCount)
        })
        .eq('id', roomId);
    }

    return { success: true };
  } catch (error) {
    console.error('Error leaving room:', error);
    return { success: false, error: error.message };
  }
};

// ✨ NOVO: Função para fechar sala (apenas criador)
export const closeRoom = async (roomId) => {
  try {
    console.log('🔒 Closing room:', roomId);

    // Remove todos os participantes
    await supabase
      .from('room_participants')
      .delete()
      .eq('room_id', roomId);

    // Desativa a sala
    const { error } = await supabase
      .from('rooms')
      .update({
        is_active: false,
        current_participants: 0
      })
      .eq('id', roomId);

    if (error) throw error;

    console.log('✅ Room closed successfully:', roomId);

    return { success: true };
  } catch (error) {
    console.error('Error closing room:', error);
    return { success: false, error: error.message };
  }
};

export const promoteUserToSpeaker = async (roomId, userId) => {
  try {
    console.log(`🎤 Promoting user ${userId} to speaker in room ${roomId}`);

    // Conta quantos speakers já existem
    const { data: speakers, error: countError } = await supabase
      .from('room_participants')
      .select('user_id')
      .eq('room_id', roomId)
      .eq('role', 'speaker');

    if (countError) {
      console.error('❌ Error counting speakers:', countError);
      throw countError;
    }

    // Máximo 8 speakers
    if (speakers && speakers.length >= 8) {
      console.warn('⚠️ Stage is full (max 8 speakers)');
      throw new Error('Stage is full (max 8 speakers)');
    }

    // Promove o usuário
    const { data, error } = await supabase
      .from('room_participants')
      .update({
        role: 'speaker',
        is_muted: false
      })
      .match({ room_id: roomId, user_id: userId })
      .select()
      .single();

    if (error) {
      console.error('❌ Error promoting user:', error);
      throw error;
    }

    console.log(`✅ User ${userId} promoted to speaker successfully`);

    return { success: true, data };
  } catch (error) {
    console.error('❌ Error in promoteUserToSpeaker:', error);
    return { success: false, error: error.message };
  }
};

export const demoteUserToListener = async (roomId, userId) => {
  try {
    console.log(`👤 Demoting user ${userId} to listener in room ${roomId}`);

    const { data, error } = await supabase
      .from('room_participants')
      .update({
        role: 'listener',
        is_muted: true
      })
      .match({ room_id: roomId, user_id: userId })
      .select()
      .single();

    if (error) {
      console.error('❌ Error demoting user:', error);
      throw error;
    }

    console.log(`✅ User ${userId} demoted to listener successfully`);

    return { success: true, data };
  } catch (error) {
    console.error('❌ Error in demoteUserToListener:', error);
    return { success: false, error: error.message };
  }
};

export const updateUserMuteStatus = async (roomId, userId, muted) => {
  try {
    console.log(`🔇 Updating mute status for user ${userId} in room ${roomId}: ${muted ? 'MUTED' : 'UNMUTED'}`);

    const { data, error } = await supabase
      .from('room_participants')
      .update({ is_muted: muted })
      .match({ room_id: roomId, user_id: userId })
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating mute status:', error);
      throw error;
    }

    console.log(`✅ User ${userId} ${muted ? 'muted' : 'unmuted'} successfully`);

    return { success: true, data };
  } catch (error) {
    console.error('❌ Error in updateUserMuteStatus:', error);
    return { success: false, error: error.message };
  }
};

export const getRoomParticipants = async (roomId) => {
  try {
    const { data, error } = await supabase
      .from('room_participants')
      .select(`
        *,
        profiles (username, avatar_url, current_level)
      `)
      .eq('room_id', roomId);

    if (error) throw error;

    return { success: true, participants: data };
  } catch (error) {
    console.error('❌ Error getting room participants:', error);
    return { success: false, error: error.message, participants: [] };
  }
};