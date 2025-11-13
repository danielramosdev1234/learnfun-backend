import admin from '../config/firebase.js';
import {
  sendDailyReminder,
  sendInactivityReminder,
  sendStreakReminder
} from './fcmService.js';

/**
 * Verifica usuários inativos e envia notificações
 */
export const checkInactiveUsers = async () => {
  try {
    console.log('🔍 Verificando usuários inativos...');
    
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .get();
    
    const now = new Date();
    const results = {
      checked: 0,
      notified: 0,
      errors: 0
    };
    
    for (const userDoc of usersSnapshot.docs) {
      try {
        const userData = userDoc.data();
        const userId = userDoc.id;
        
        // Verifica se tem configurações de notificação
        const notificationSettings = userData.notificationSettings;
        if (!notificationSettings?.enabled || !notificationSettings?.inactivityReminders?.enabled) {
          continue;
        }
        
        // Verifica última atividade
        const lastActivityDate = userData.stats?.streak?.lastActivityDate;
        if (!lastActivityDate) {
          continue;
        }
        
        const daysSinceActivity = Math.floor(
          (now.getTime() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        
        const daysThreshold = notificationSettings.inactivityReminders.daysWithoutActivity || 1;
        
        if (daysSinceActivity >= daysThreshold) {
          await sendInactivityReminder(userId, daysSinceActivity);
          results.notified++;
          console.log(`✅ Notificação de inatividade enviada para ${userId} (${daysSinceActivity} dias)`);
        }
        
        results.checked++;
      } catch (error) {
        console.error(`❌ Erro ao processar usuário ${userDoc.id}:`, error);
        results.errors++;
      }
    }
    
    console.log(`✅ Verificação concluída: ${results.checked} verificados, ${results.notified} notificados, ${results.errors} erros`);
    return results;
  } catch (error) {
    console.error('❌ Erro ao verificar usuários inativos:', error);
    throw error;
  }
};

/**
 * Verifica streaks e envia notificações
 */
export const checkStreaks = async () => {
  try {
    console.log('🔍 Verificando streaks...');
    
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .get();
    
    const now = new Date();
    const results = {
      checked: 0,
      notified: 0,
      errors: 0
    };
    
    for (const userDoc of usersSnapshot.docs) {
      try {
        const userData = userDoc.data();
        const userId = userDoc.id;
        
        // Verifica se tem configurações de notificação
        const notificationSettings = userData.notificationSettings;
        if (!notificationSettings?.enabled || !notificationSettings?.streakReminders?.enabled) {
          continue;
        }
        
        // Verifica streak
        const streak = userData.stats?.streak?.current || 0;
        const lastActivityDate = userData.stats?.streak?.lastActivityDate;
        
        if (!lastActivityDate || streak === 0) {
          continue;
        }
        
        const daysSinceActivity = Math.floor(
          (now.getTime() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        
        // Se está prestes a perder o streak (1 dia sem atividade)
        if (daysSinceActivity === 1) {
          const reminderTime = notificationSettings.streakReminders.reminderTime || '20:00';
          const [hours, minutes] = reminderTime.split(':').map(Number);
          
          // Verifica se está no horário correto
          if (now.getHours() === hours && now.getMinutes() === minutes) {
            await sendStreakReminder(userId, streak);
            results.notified++;
            console.log(`✅ Notificação de streak enviada para ${userId} (streak: ${streak})`);
          }
        }
        
        results.checked++;
      } catch (error) {
        console.error(`❌ Erro ao processar usuário ${userDoc.id}:`, error);
        results.errors++;
      }
    }
    
    console.log(`✅ Verificação de streaks concluída: ${results.checked} verificados, ${results.notified} notificados, ${results.errors} erros`);
    return results;
  } catch (error) {
    console.error('❌ Erro ao verificar streaks:', error);
    throw error;
  }
};

/**
 * Envia lembretes diários para usuários que têm configurado
 */
export const sendDailyReminders = async () => {
  try {
    console.log('🔍 Enviando lembretes diários...');
    
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .get();
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay();
    
    const results = {
      checked: 0,
      notified: 0,
      errors: 0
    };
    
    for (const userDoc of usersSnapshot.docs) {
      try {
        const userData = userDoc.data();
        const userId = userDoc.id;
        
        // Verifica se tem configurações de notificação
        const notificationSettings = userData.notificationSettings;
        if (!notificationSettings?.enabled || !notificationSettings?.dailyReminders?.enabled) {
          continue;
        }
        
        const dailyReminders = notificationSettings.dailyReminders;
        const daysOfWeek = dailyReminders.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
        
        // Verifica se é um dia válido
        if (!daysOfWeek.includes(currentDay)) {
          continue;
        }
        
        // Verifica se está em um horário configurado
        const times = dailyReminders.times || [];
        const shouldNotify = times.some(timeStr => {
          const [hours, minutes] = timeStr.split(':').map(Number);
          return hours === currentHour && minutes === currentMinute;
        });
        
        if (shouldNotify) {
          await sendDailyReminder(userId, notificationSettings);
          results.notified++;
          console.log(`✅ Lembrete diário enviado para ${userId}`);
        }
        
        results.checked++;
      } catch (error) {
        console.error(`❌ Erro ao processar usuário ${userDoc.id}:`, error);
        results.errors++;
      }
    }
    
    console.log(`✅ Lembretes diários concluídos: ${results.checked} verificados, ${results.notified} notificados, ${results.errors} erros`);
    return results;
  } catch (error) {
    console.error('❌ Erro ao enviar lembretes diários:', error);
    throw error;
  }
};

/**
 * Executa todas as verificações de notificações agendadas
 * Deve ser chamado periodicamente (ex: a cada minuto via cron)
 */
export const runScheduledNotifications = async () => {
  try {
    console.log('⏰ Executando notificações agendadas...');
    
    const results = {
      dailyReminders: await sendDailyReminders(),
      inactivity: await checkInactiveUsers(),
      streaks: await checkStreaks()
    };
    
    return results;
  } catch (error) {
    console.error('❌ Erro ao executar notificações agendadas:', error);
    throw error;
  }
};

