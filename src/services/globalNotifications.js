import admin from '../config/firebase.js';
import { sendMulticastNotification } from './fcmService.js';

/**
 * Busca todos os tokens FCM válidos da coleção
 */
export const getAllFCMTokens = async () => {
  try {
    console.log('🔍 Buscando todos os tokens FCM...');
    
    const tokensSnapshot = await admin.firestore()
      .collection('fcm_tokens')
      .where('token', '!=', null)
      .get();

    const tokens = [];
    
    tokensSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.token && data.token.trim() !== '') {
        tokens.push({
          userId: doc.id,
          token: data.token
        });
      }
    });

    console.log(`✅ Encontrados ${tokens.length} tokens FCM válidos`);
    return tokens;
  } catch (error) {
    console.error('❌ Erro ao buscar tokens FCM:', error);
    throw error;
  }
};

/**
 * Envia notificação para todos os usuários com token FCM
 */
export const sendGlobalNotification = async (title, body, options = {}) => {
  try {
    console.log(`📢 Enviando notificação global: ${title}`);
    
    const tokens = await getAllFCMTokens();
    
    if (tokens.length === 0) {
      console.warn('⚠️ Nenhum token FCM encontrado');
      return {
        success: false,
        sent: 0,
        total: 0,
        error: 'Nenhum token encontrado'
      };
    }

    const userIds = tokens.map(t => t.userId);
    
    const notification = {
      title,
      body,
      type: options.type || 'global',
      url: options.url || '/',
      icon: options.icon || '/pwa-192x192.png',
      tag: options.tag || 'global-notification',
      ...options
    };

    // Divide em lotes de 500 (limite do FCM)
    const batchSize = 500;
    let totalSent = 0;
    let totalFailed = 0;

    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      try {
        const result = await sendMulticastNotification(batch, notification);
        
        if (result.success) {
          totalSent += result.successCount || batch.length;
          totalFailed += result.failureCount || 0;
          console.log(`✅ Lote ${Math.floor(i / batchSize) + 1}: ${result.successCount || batch.length} enviadas`);
        } else {
          totalFailed += batch.length;
          console.error(`❌ Lote ${Math.floor(i / batchSize) + 1}: Falha ao enviar`);
        }
      } catch (error) {
        console.error(`❌ Erro ao enviar lote ${Math.floor(i / batchSize) + 1}:`, error);
        totalFailed += batch.length;
      }
    }

    console.log(`📊 Resumo: ${totalSent} enviadas, ${totalFailed} falharam de ${tokens.length} total`);

    return {
      success: totalSent > 0,
      sent: totalSent,
      failed: totalFailed,
      total: tokens.length
    };
  } catch (error) {
    console.error('❌ Erro ao enviar notificação global:', error);
    throw error;
  }
};

/**
 * Notificação de lembrete para treinar (9:30)
 */
export const sendTrainingReminder = async () => {
  const title = 'Hora de treinar! 🎯';
  const body = 'Que tal praticar um pouco de inglês agora? Cada minuto conta!';
  
  return await sendGlobalNotification(title, body, {
    type: 'training_reminder',
    tag: 'training-reminder-0930',
    url: '/'
  });
};

/**
 * Notificação para continuar sequência de streak (12:00)
 */
export const sendStreakReminder = async () => {
  const title = 'Não perca sua sequência! 🔥';
  const body = 'Continue sua sequência de treinos! Cada dia te aproxima mais da fluência!';
  
  return await sendGlobalNotification(title, body, {
    type: 'streak_reminder',
    tag: 'streak-reminder-1200',
    url: '/'
  });
};

/**
 * Notificação motivadora sobre consistência (20:00)
 */
export const sendMotivationalMessage = async () => {
  const messages = [
    {
      title: 'Inglês abre portas! 🚪✨',
      body: 'A consistência é a chave. Cada treino hoje constrói o futuro que você quer. Continue!'
    },
    {
      title: 'Seu futuro começa hoje! 🌟',
      body: 'O inglês que você pratica agora abrirá portas incríveis. Mantenha a consistência!'
    },
    {
      title: 'Consistência = Sucesso! 💪',
      body: 'Grandes oportunidades vêm para quem persiste. Seu inglês está melhorando a cada dia!'
    },
    {
      title: 'Você está no caminho certo! 🎯',
      body: 'A consistência transforma sonhos em realidade. Continue treinando e o futuro será brilhante!'
    }
  ];

  // Seleciona uma mensagem aleatória
  const randomMessage = messages[Math.floor(Math.random() * messages.length)];
  
  return await sendGlobalNotification(randomMessage.title, randomMessage.body, {
    type: 'motivational',
    tag: 'motivational-2000',
    url: '/'
  });
};

/**
 * Executa notificações agendadas baseado no horário atual
 */
export const runScheduledGlobalNotifications = async (hourParam, minuteParam) => {
  try {
    const now = new Date();
    // Usa os parâmetros se fornecidos, senão usa a hora atual
    const currentHour = hourParam !== undefined ? hourParam : now.getHours();
    const currentMinute = minuteParam !== undefined ? minuteParam : now.getMinutes();
    const timeString = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    
    console.log(`⏰ Verificando notificações agendadas para ${timeString}...`);
    console.log(hourParam);
    console.log(minuteParam);


    const results = {
      time: timeString,
      executed: false,
      type: null,
      result: null
    };

    // 9:30 - Lembrete para treinar
    if (currentHour === 9 && currentMinute === 30) {
      console.log('📅 Executando: Lembrete de treino (9:30)');
      results.executed = true;
      results.type = 'training_reminder';
      results.result = await sendTrainingReminder();
    }
    // 12:00 - Lembrete de streak
    else if (currentHour === 12 && currentMinute === 0) {
      console.log('📅 Executando: Lembrete de streak (12:00)');
      results.executed = true;
      results.type = 'streak_reminder';
      results.result = await sendStreakReminder();
    }
    // 20:00 - Mensagem motivadora
    else if (currentHour === 20 && currentMinute === 0) {
      console.log('📅 Executando: Mensagem motivadora (20:00)');
      results.executed = true;
      results.type = 'motivational';
      results.result = await sendMotivationalMessage();
    }
    else {
      console.log(`⏭️ Nenhuma notificação agendada para ${timeString}`);
    }

    return results;
  } catch (error) {
    console.error('❌ Erro ao executar notificações agendadas globais:', error);
    throw error;
  }
};

