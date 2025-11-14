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
    
    // Para notificações globais, usa URL absoluta do frontend
    // Isso garante que o ícone funcione mesmo quando o app está fechado
    const frontendUrl = process.env.FRONTEND_URL || 'https://learnfun-sigma.vercel.app';
    const defaultIcon = `${frontendUrl}/pwa-192x192.png`;
    
    const notification = {
      title,
      body,
      type: options.type || 'global',
      url: options.url || '/',
      icon: options.icon || defaultIcon, // Usa URL absoluta por padrão
      badge: options.badge || defaultIcon,
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
        console.log(`📦 Enviando lote ${Math.floor(i / batchSize) + 1} com ${batch.length} usuários...`);
        const result = await sendMulticastNotification(batch, notification);
        
        if (result.success) {
          totalSent += result.successCount || 0;
          totalFailed += result.failureCount || 0;
          console.log(`✅ Lote ${Math.floor(i / batchSize) + 1}: ${result.successCount || 0} sucesso, ${result.failureCount || 0} falhas`);
        } else {
          totalFailed += batch.length;
          console.error(`❌ Lote ${Math.floor(i / batchSize) + 1}: Falha ao enviar - ${result.error || 'Erro desconhecido'}`);
        }
      } catch (error) {
        console.error(`❌ Erro ao enviar lote ${Math.floor(i / batchSize) + 1}:`, {
          message: error.message,
          stack: error.stack,
          code: error.code
        });
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
  
  const frontendUrl = process.env.FRONTEND_URL || 'https://learnfun-sigma.vercel.app';
  
  return await sendGlobalNotification(title, body, {
    type: 'training_reminder',
    tag: 'training-reminder-0930',
    url: '/',
    icon: `${frontendUrl}/pwa-192x192.png`,
    badge: `${frontendUrl}/pwa-192x192.png`
  });
};

/**
 * Notificação para continuar sequência de streak (12:00)
 * Verifica se o usuário já fez streak hoje (xpSystem.lastUpdated) antes de enviar
 */
export const sendStreakReminder = async () => {
  try {
    console.log('📢 Enviando notificação de streak (12:00)');
    
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

    console.log(`🔍 Verificando ${tokens.length} usuários para ver se já fizeram streak hoje...`);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera horas para comparar apenas a data
    
    const validTokens = [];
    let skippedCount = 0;
    
    // Verifica cada usuário antes de adicionar à lista de envio
    for (const tokenData of tokens) {
      try {
        const userRef = admin.firestore().collection('users').doc(tokenData.userId);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
          console.log(`⚠️ Usuário ${tokenData.userId} não encontrado, pulando...`);
          skippedCount++;
          continue;
        }
        
        const userData = userDoc.data();
        const xpSystem = userData.xpSystem || {};
        const lastUpdated = xpSystem.lastUpdated;
        
        // Se não tem lastUpdated, pode enviar (usuário novo ou sem XP ainda)
        if (!lastUpdated) {
          console.log(`✅ Usuário ${tokenData.userId}: Sem lastUpdated, enviando notificação`);
          validTokens.push(tokenData);
          continue;
        }
        
        // Converte Timestamp do Firestore para Date
        let lastUpdatedDate = null;
        if (lastUpdated.toDate) {
          lastUpdatedDate = lastUpdated.toDate();
        } else if (lastUpdated instanceof Date) {
          lastUpdatedDate = lastUpdated;
        } else {
          // Se for string ou outro formato, tenta converter
          lastUpdatedDate = new Date(lastUpdated);
        }
        
        // Zera horas para comparar apenas a data
        const lastUpdatedDay = new Date(lastUpdatedDate);
        lastUpdatedDay.setHours(0, 0, 0, 0);
        
        // Compara apenas as datas (sem horas)
        const isToday = lastUpdatedDay.getTime() === today.getTime();
        
        if (isToday) {
          console.log(`⏭️ Usuário ${tokenData.userId}: Já fez streak hoje (lastUpdated: ${lastUpdatedDay.toISOString()}), pulando notificação`);
          skippedCount++;
        } else {
          console.log(`✅ Usuário ${tokenData.userId}: Não fez streak hoje (lastUpdated: ${lastUpdatedDay.toISOString()}), enviando notificação`);
          validTokens.push(tokenData);
        }
      } catch (error) {
        console.error(`❌ Erro ao verificar usuário ${tokenData.userId}:`, error.message);
        // Em caso de erro, adiciona mesmo assim para não perder a notificação
        validTokens.push(tokenData);
      }
    }
    
    console.log(`📊 Resultado da verificação: ${validTokens.length} usuários receberão notificação, ${skippedCount} já fizeram streak hoje`);
    
    if (validTokens.length === 0) {
      console.log('✅ Todos os usuários já fizeram streak hoje, nenhuma notificação enviada');
      return {
        success: true,
        sent: 0,
        skipped: skippedCount,
        total: tokens.length,
        message: 'Todos os usuários já fizeram streak hoje'
      };
    }
    
    const title = 'Não perca sua sequência! 🔥';
    const body = 'Continue sua sequência de treinos! Cada dia te aproxima mais da fluência!';
    
    const frontendUrl = process.env.FRONTEND_URL || 'https://learnfun-sigma.vercel.app';
    
    const userIds = validTokens.map(t => t.userId);
    
    const notification = {
      title,
      body,
      type: 'streak_reminder',
      url: '/',
      icon: `${frontendUrl}/pwa-192x192.png`,
      badge: `${frontendUrl}/pwa-192x192.png`,
      tag: 'streak-reminder-1200'
    };
    
    // Divide em lotes de 500 (limite do FCM)
    const batchSize = 500;
    let totalSent = 0;
    let totalFailed = 0;
    
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      try {
        console.log(`📦 Enviando lote ${Math.floor(i / batchSize) + 1} com ${batch.length} usuários...`);
        const result = await sendMulticastNotification(batch, notification);
        
        if (result.success) {
          totalSent += result.successCount || 0;
          totalFailed += result.failureCount || 0;
          console.log(`✅ Lote ${Math.floor(i / batchSize) + 1}: ${result.successCount || 0} sucesso, ${result.failureCount || 0} falhas`);
        } else {
          totalFailed += batch.length;
          console.error(`❌ Lote ${Math.floor(i / batchSize) + 1}: Falha ao enviar - ${result.error || 'Erro desconhecido'}`);
        }
      } catch (error) {
        console.error(`❌ Erro ao enviar lote ${Math.floor(i / batchSize) + 1}:`, {
          message: error.message,
          stack: error.stack,
          code: error.code
        });
        totalFailed += batch.length;
      }
    }
    
    console.log(`📊 Resumo final: ${totalSent} enviadas, ${totalFailed} falharam, ${skippedCount} já fizeram streak hoje, de ${tokens.length} total`);
    
    return {
      success: totalSent > 0,
      sent: totalSent,
      failed: totalFailed,
      skipped: skippedCount,
      total: tokens.length
    };
  } catch (error) {
    console.error('❌ Erro ao enviar notificação de streak:', error);
    throw error;
  }
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
  
  const frontendUrl = process.env.FRONTEND_URL || 'https://learnfun-sigma.vercel.app';
  
  return await sendGlobalNotification(randomMessage.title, randomMessage.body, {
    type: 'motivational',
    tag: 'motivational-2000',
    url: '/',
    icon: `${frontendUrl}/pwa-192x192.png`,
    badge: `${frontendUrl}/pwa-192x192.png`
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

