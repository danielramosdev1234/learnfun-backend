import { supabase } from '../config/supabase.js';

export const syncProfileFromFirebase = async (firebaseUser, additionalData = {}) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: firebaseUser.uid,
        username: additionalData.username || firebaseUser.displayName || `user_${firebaseUser.uid.slice(0, 8)}`,
        avatar_url: firebaseUser.photoURL,
        bio: additionalData.bio || null,
        current_level: additionalData.currentLevel || 1,
        total_phrases: additionalData.totalPhrases || 0,
        online: true,
        last_seen: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, profile: data };
  } catch (error) {
    console.error('Error syncing profile:', error);
    return { success: false, error: error.message };
  }
};

export const setUserOnlineStatus = async (userId, online) => {
  try {
    await supabase
      .from('profiles')
      .update({
        online,
        last_seen: new Date().toISOString()
      })
      .eq('id', userId);
  } catch (error) {
    console.error('Error updating online status:', error);
  }
};

export const getUserProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  return error ? null : data;
};