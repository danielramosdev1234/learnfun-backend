import dotenv from 'dotenv';
dotenv.config();

import { runScheduledNotifications } from '../services/notificationScheduler.js';

/**
 * Script para executar notificações agendadas
 * 
 * Uso:
 * - Executar manualmente: node src/scripts/scheduleNotifications.js
 * - Agendar via cron: */1 * * * * node /path/to/src/scripts/scheduleNotifications.js
 * 
 * Recomendado: Executar a cada minuto para verificar horários de lembretes
 */

const main = async () => {
  try {
    console.log('🚀 Iniciando execução de notificações agendadas...');
    console.log('📅 Data/Hora:', new Date().toISOString());
    
    const results = await runScheduledNotifications();
    
    console.log('✅ Execução concluída:', JSON.stringify(results, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  }
};

main();

