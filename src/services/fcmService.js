import admin from '../config/firebase.js';

/**
 * Busca o token FCM de um usuário no Firestore
 */
export const getFCMToken = async (userId) => {
  try {
    const tokenDoc = await admin.firestore()
      .collection('fcm_tokens')
      .doc(userId)
      .get();

    if (!tokenDoc.exists) {
      return null;
    }

    const data = tokenDoc.data();
    return data.token || null;
  } catch (error) {
    console.error('❌ Erro ao buscar token FCM:', error);
    throw error;
  }
};

/**
 * Busca tokens FCM de múltiplos usuários
 */
export const getFCMTokens = async (userIds) => {
  try {
    const tokens = [];
    
    for (const userId of userIds) {
      const token = await getFCMToken(userId);
      if (token) {
        tokens.push({ userId, token });
      }
    }
    
    return tokens;
  } catch (error) {
    console.error('❌ Erro ao buscar tokens FCM:', error);
    throw error;
  }
};

/**
 * Envia notificação push para um usuário
 */
export const sendNotification = async (userId, notification) => {
  try {
    const token = await getFCMToken(userId);
    
    if (!token) {
      console.warn(`⚠️ Token FCM não encontrado para usuário: ${userId}`);
      return { success: false, error: 'Token não encontrado' };
    }

    // Converte caminho relativo do ícone para URL absoluta se necessário
    const getAbsoluteIconUrl = (iconPath) => {
      if (!iconPath) return '/pwa-192x192.png';
      // Se já é URL absoluta, retorna como está
      if (iconPath.startsWith('http://') || iconPath.startsWith('https://')) {
        return iconPath;
      }
      // Se é caminho relativo, retorna como está (o Service Worker vai converter)
      return iconPath;
    };

    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        icon: getAbsoluteIconUrl(notification.icon || '/pwa-192x192.png'),
        ...(notification.image && { image: notification.image })
      },
      data: {
        ...notification.data,
        type: notification.type || 'general',
        timestamp: new Date().toISOString(),
        icon: getAbsoluteIconUrl(notification.icon || '/pwa-192x192.png'), // Também envia nos dados para garantir
        badge: getAbsoluteIconUrl(notification.badge || '/pwa-192x192.png')
      },
      token,
      webpush: {
        fcmOptions: {
          link: notification.url || '/'
        },
        notification: {
          icon: getAbsoluteIconUrl(notification.icon || '/pwa-192x192.png'),
          badge: getAbsoluteIconUrl(notification.badge || '/pwa-192x192.png'),
          requireInteraction: notification.requireInteraction || false,
          vibrate: notification.vibrate || [200, 100, 200],
          tag: notification.tag || 'learnfun-notification'
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ Notificação enviada para ${userId}:`, response);
    
    return { success: true, messageId: response };
  } catch (error) {
    console.error('❌ Erro ao enviar notificação:', error);
    
    // Se o token é inválido, remove do Firestore
    if (error.code === 'messaging/invalid-registration-token' || 
        error.code === 'messaging/registration-token-not-registered') {
      try {
        await admin.firestore()
          .collection('fcm_tokens')
          .doc(userId)
          .update({ token: null, removedAt: new Date().toISOString() });
        console.log(`🗑️ Token inválido removido para usuário: ${userId}`);
      } catch (removeError) {
        console.error('❌ Erro ao remover token inválido:', removeError);
      }
    }
    
    return { success: false, error: error.message };
  }
};

/**
 * Envia notificação push para múltiplos usuários
 */
export const sendMulticastNotification = async (userIds, notification) => {
  try {
    const tokens = await getFCMTokens(userIds);
    
    if (tokens.length === 0) {
      console.warn('⚠️ Nenhum token FCM encontrado para os usuários fornecidos');
      return { success: false, error: 'Nenhum token encontrado' };
    }

    // Converte caminho relativo do ícone para URL absoluta se necessário
    const getAbsoluteIconUrl = (iconPath) => {
      if (!iconPath) return '/pwa-192x192.png';
      // Se já é URL absoluta, retorna como está
      if (iconPath.startsWith('http://') || iconPath.startsWith('https://')) {
        return iconPath;
      }
      // Se é caminho relativo, retorna como está (o Service Worker vai converter)
      return iconPath;
    };

    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        icon: getAbsoluteIconUrl(notification.icon || '/pwa-192x192.png'),
        ...(notification.image && { image: notification.image })
      },
      data: {
        ...notification.data,
        type: notification.type || 'general',
        timestamp: new Date().toISOString(),
        icon: getAbsoluteIconUrl(notification.icon || '/pwa-192x192.png'), // Também envia nos dados para garantir
        badge: getAbsoluteIconUrl(notification.badge || '/pwa-192x192.png')
      },
      tokens: tokens.map(t => t.token),
      webpush: {
        fcmOptions: {
          link: notification.url || '/'
        },
        notification: {
          icon: getAbsoluteIconUrl(notification.icon || '/pwa-192x192.png'),
          badge: getAbsoluteIconUrl(notification.badge || '/pwa-192x192.png'),
          requireInteraction: notification.requireInteraction || false,
          vibrate: notification.vibrate || [200, 100, 200],
          tag: notification.tag || 'learnfun-notification'
        }
      }
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log(`✅ Notificações enviadas: ${response.successCount} sucesso, ${response.failureCount} falhas`);
    
    // Remove tokens inválidos
    if (response.failureCount > 0) {
      const invalidTokens = [];
      response.responses.forEach((resp, index) => {
        if (!resp.success) {
          const error = resp.error;
          if (error.code === 'messaging/invalid-registration-token' || 
              error.code === 'messaging/registration-token-not-registered') {
            invalidTokens.push(tokens[index].userId);
          }
        }
      });
      
      // Remove tokens inválidos do Firestore
      for (const userId of invalidTokens) {
        try {
          await admin.firestore()
            .collection('fcm_tokens')
            .doc(userId)
            .update({ token: null, removedAt: new Date().toISOString() });
        } catch (removeError) {
          console.error(`❌ Erro ao remover token inválido para ${userId}:`, removeError);
        }
      }
    }
    
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses
    };
  } catch (error) {
    console.error('❌ Erro ao enviar notificações multicast:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Envia notificação de lembrete diário
 */
export const sendDailyReminder = async (userId, settings) => {
  return sendNotification(userId, {
    title: 'Hora de treinar! 🎯',
    body: 'Que tal praticar um pouco de inglês agora?',
    type: 'daily_reminder',
    tag: 'daily-reminder',
    url: '/',
    data: {
      type: 'daily_reminder',
      url: '/'
    }
  });
};

/**
 * Envia notificação de inatividade
 */
export const sendInactivityReminder = async (userId, daysWithoutActivity) => {
  const message = `Você está sem treinar há ${daysWithoutActivity} dia(s)! Volte e mantenha sua sequência! 🔥`;
  
  return sendNotification(userId, {
    title: 'Você está sem treinar!',
    body: message,
    type: 'inactivity_reminder',
    tag: 'inactivity-reminder',
    url: '/',
    requireInteraction: true,
    data: {
      type: 'inactivity_reminder',
      days: daysWithoutActivity.toString(),
      url: '/'
    }
  });
};

/**
 * Envia notificação de streak
 */
export const sendStreakReminder = async (userId, streak) => {
  const message = `Não perca sua sequência de ${streak} dias! Treine hoje para manter o fogo! 🔥`;
  
  return sendNotification(userId, {
    title: 'Não perca sua sequência!',
    body: message,
    type: 'streak_reminder',
    tag: 'streak-reminder',
    url: '/',
    requireInteraction: true,
    data: {
      type: 'streak_reminder',
      streak: streak.toString(),
      url: '/'
    }
  });
};

/**
 * Envia notificação de conquista
 */
export const sendAchievementNotification = async (userId, achievementType, details = {}) => {
  const messages = {
    levelUp: {
      title: 'Parabéns! 🎉',
      body: `Você subiu para o nível ${details.level || 'novo'}! Continue assim!`
    },
    xpMilestone: {
      title: 'Marco alcançado! 🏆',
      body: `Você alcançou ${details.xp || 0} XP! Incrível!`
    },
    challengeCompleted: {
      title: 'Desafio completo! 🎯',
      body: 'Você completou um desafio! Parabéns!'
    }
  };

  const message = messages[achievementType] || {
    title: 'Nova conquista! 🎉',
    body: 'Parabéns! Você alcançou uma nova conquista!'
  };

  return sendNotification(userId, {
    ...message,
    type: 'achievement',
    tag: `achievement-${achievementType}`,
    url: '/',
    data: {
      type: 'achievement',
      achievementType,
      ...details,
      url: '/'
    }
  });
};

/**
 * Envia notificação de desafio semanal
 */
export const sendWeeklyChallengeNotification = async (userId) => {
  return sendNotification(userId, {
    title: 'Novo desafio semanal! 🏆',
    body: 'Teste suas habilidades com o novo desafio semanal!',
    type: 'weekly_challenge',
    tag: 'weekly-challenge',
    url: '/',
    data: {
      type: 'weekly_challenge',
      url: '/'
    }
  });
};

/**
 * Envia notificação de atividade de amigo
 */
export const sendFriendActivityNotification = async (userId, friendName, action) => {
  const messages = {
    levelUp: `Seu amigo ${friendName} subiu de nível! Vamos competir? 👥`,
    challenge: `Seu amigo ${friendName} completou um desafio! Vamos competir? 👥`
  };

  const body = messages[action] || `Seu amigo ${friendName} acabou de ${action}! Vamos competir? 👥`;

  return sendNotification(userId, {
    title: 'Atividade de amigo!',
    body,
    type: 'friend_activity',
    tag: 'friend-activity',
    url: '/',
    data: {
      type: 'friend_activity',
      friendName,
      action,
      url: '/'
    }
  });
};

/**
 * Envia notificação de revisão
 */
export const sendReviewReminder = async (userId, difficultPhrasesCount) => {
  return sendNotification(userId, {
    title: 'Tempo de revisar! 📚',
    body: `Você tem ${difficultPhrasesCount} frase(s) para revisar. Pratique as que você teve dificuldade!`,
    type: 'review_reminder',
    tag: 'review-reminder',
    url: '/',
    data: {
      type: 'review_reminder',
      count: difficultPhrasesCount.toString(),
      url: '/'
    }
  });
};

