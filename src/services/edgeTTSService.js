// src/services/edgeTTSService.js
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🎤 Lista de vozes recomendadas (mantém sua lista original)
export const RECOMMENDED_VOICES = [
  // INGLÊS AMERICANO
  { name: 'en-US-JennyNeural', gender: 'Female', language: 'en-US', description: 'Jenny (US) - Warm, friendly female voice', quality: 'premium' },
  { name: 'en-US-GuyNeural', gender: 'Male', language: 'en-US', description: 'Guy (US) - Professional male voice', quality: 'premium' },
  { name: 'en-US-AriaNeural', gender: 'Female', language: 'en-US', description: 'Aria (US) - Clear, articulate female', quality: 'premium' },
  { name: 'en-US-DavisNeural', gender: 'Male', language: 'en-US', description: 'Davis (US) - Young, casual male', quality: 'premium' },
  { name: 'en-US-JaneNeural', gender: 'Female', language: 'en-US', description: 'Jane (US) - Confident female voice', quality: 'premium' },
  { name: 'en-US-JasonNeural', gender: 'Male', language: 'en-US', description: 'Jason (US) - Energetic male voice', quality: 'premium' },
  { name: 'en-US-SaraNeural', gender: 'Female', language: 'en-US', description: 'Sara (US) - Soft, gentle female', quality: 'premium' },
  { name: 'en-US-TonyNeural', gender: 'Male', language: 'en-US', description: 'Tony (US) - Authoritative male', quality: 'premium' },
  { name: 'en-US-NancyNeural', gender: 'Female', language: 'en-US', description: 'Nancy (US) - Mature, professional female', quality: 'premium' },
  { name: 'en-US-AmberNeural', gender: 'Female', language: 'en-US', description: 'Amber (US) - Youthful female voice', quality: 'premium' },
  { name: 'en-US-AshleyNeural', gender: 'Female', language: 'en-US', description: 'Ashley (US) - Casual, friendly female', quality: 'premium' },
  { name: 'en-US-BrandonNeural', gender: 'Male', language: 'en-US', description: 'Brandon (US) - Young adult male', quality: 'premium' },
  { name: 'en-US-ChristopherNeural', gender: 'Male', language: 'en-US', description: 'Christopher (US) - Mature male voice', quality: 'premium' },
  { name: 'en-US-CoraNeural', gender: 'Female', language: 'en-US', description: 'Cora (US) - Warm, empathetic female', quality: 'premium' },
  { name: 'en-US-ElizabethNeural', gender: 'Female', language: 'en-US', description: 'Elizabeth (US) - Sophisticated female', quality: 'premium' },
  { name: 'en-US-EricNeural', gender: 'Male', language: 'en-US', description: 'Eric (US) - Clear, articulate male', quality: 'premium' },
  { name: 'en-US-JacobNeural', gender: 'Male', language: 'en-US', description: 'Jacob (US) - Friendly male voice', quality: 'premium' },
  { name: 'en-US-MichelleNeural', gender: 'Female', language: 'en-US', description: 'Michelle (US) - Professional female', quality: 'premium' },
  { name: 'en-US-MonicaNeural', gender: 'Female', language: 'en-US', description: 'Monica (US) - Calm, soothing female', quality: 'premium' },

  // INGLÊS BRITÂNICO
  { name: 'en-GB-SoniaNeural', gender: 'Female', language: 'en-GB', description: 'Sonia (UK) - British female voice', quality: 'premium' },
  { name: 'en-GB-RyanNeural', gender: 'Male', language: 'en-GB', description: 'Ryan (UK) - British male voice', quality: 'premium' },
  { name: 'en-GB-LibbyNeural', gender: 'Female', language: 'en-GB', description: 'Libby (UK) - Young British female', quality: 'premium' },
  { name: 'en-GB-AbbiNeural', gender: 'Female', language: 'en-GB', description: 'Abbi (UK) - Casual British female', quality: 'premium' },
  { name: 'en-GB-AlfieNeural', gender: 'Male', language: 'en-GB', description: 'Alfie (UK) - Young British male', quality: 'premium' },
  { name: 'en-GB-BellaNeural', gender: 'Female', language: 'en-GB', description: 'Bella (UK) - Elegant British female', quality: 'premium' },
  { name: 'en-GB-ElliotNeural', gender: 'Male', language: 'en-GB', description: 'Elliot (UK) - Professional British male', quality: 'premium' },
  { name: 'en-GB-EthanNeural', gender: 'Male', language: 'en-GB', description: 'Ethan (UK) - Mature British male', quality: 'premium' },
  { name: 'en-GB-HollieNeural', gender: 'Female', language: 'en-GB', description: 'Hollie (UK) - Friendly British female', quality: 'premium' },
  { name: 'en-GB-MaisieNeural', gender: 'Female', language: 'en-GB', description: 'Maisie (UK) - Energetic British female', quality: 'premium' },
  { name: 'en-GB-NoahNeural', gender: 'Male', language: 'en-GB', description: 'Noah (UK) - Clear British male', quality: 'premium' },
  { name: 'en-GB-OliverNeural', gender: 'Male', language: 'en-GB', description: 'Oliver (UK) - Refined British male', quality: 'premium' },
  { name: 'en-GB-OliviaNeural', gender: 'Female', language: 'en-GB', description: 'Olivia (UK) - Sophisticated British female', quality: 'premium' },
  { name: 'en-GB-ThomasNeural', gender: 'Male', language: 'en-GB', description: 'Thomas (UK) - Authoritative British male', quality: 'premium' },

  // INGLÊS AUSTRALIANO
  { name: 'en-AU-NatashaNeural', gender: 'Female', language: 'en-AU', description: 'Natasha (AU) - Australian female voice', quality: 'premium' },
  { name: 'en-AU-WilliamNeural', gender: 'Male', language: 'en-AU', description: 'William (AU) - Australian male voice', quality: 'premium' },
  { name: 'en-AU-AnnetteNeural', gender: 'Female', language: 'en-AU', description: 'Annette (AU) - Mature Australian female', quality: 'premium' },
  { name: 'en-AU-CarlyNeural', gender: 'Female', language: 'en-AU', description: 'Carly (AU) - Young Australian female', quality: 'premium' },
  { name: 'en-AU-DarrenNeural', gender: 'Male', language: 'en-AU', description: 'Darren (AU) - Energetic Australian male', quality: 'premium' },
  { name: 'en-AU-DuncanNeural', gender: 'Male', language: 'en-AU', description: 'Duncan (AU) - Professional Australian male', quality: 'premium' },
  { name: 'en-AU-ElsieNeural', gender: 'Female', language: 'en-AU', description: 'Elsie (AU) - Friendly Australian female', quality: 'premium' },
  { name: 'en-AU-FreyaNeural', gender: 'Female', language: 'en-AU', description: 'Freya (AU) - Clear Australian female', quality: 'premium' },
  { name: 'en-AU-JoanneNeural', gender: 'Female', language: 'en-AU', description: 'Joanne (AU) - Warm Australian female', quality: 'premium' },
  { name: 'en-AU-KenNeural', gender: 'Male', language: 'en-AU', description: 'Ken (AU) - Mature Australian male', quality: 'premium' },
  { name: 'en-AU-KimNeural', gender: 'Female', language: 'en-AU', description: 'Kim (AU) - Casual Australian female', quality: 'premium' },
  { name: 'en-AU-NeilNeural', gender: 'Male', language: 'en-AU', description: 'Neil (AU) - Authoritative Australian male', quality: 'premium' },
  { name: 'en-AU-TimNeural', gender: 'Male', language: 'en-AU', description: 'Tim (AU) - Friendly Australian male', quality: 'premium' },
  { name: 'en-AU-TinaNeural', gender: 'Female', language: 'en-AU', description: 'Tina (AU) - Professional Australian female', quality: 'premium' },

  // INGLÊS CANADENSE
  { name: 'en-CA-ClaraNeural', gender: 'Female', language: 'en-CA', description: 'Clara (CA) - Canadian female voice', quality: 'premium' },
  { name: 'en-CA-LiamNeural', gender: 'Male', language: 'en-CA', description: 'Liam (CA) - Canadian male voice', quality: 'premium' },

  // INGLÊS INDIANO
  { name: 'en-IN-NeerjaNeural', gender: 'Female', language: 'en-IN', description: 'Neerja (IN) - Indian English female', quality: 'premium' },
  { name: 'en-IN-PrabhatNeural', gender: 'Male', language: 'en-IN', description: 'Prabhat (IN) - Indian English male', quality: 'premium' },

  // INGLÊS IRLANDÊS
  { name: 'en-IE-EmilyNeural', gender: 'Female', language: 'en-IE', description: 'Emily (IE) - Irish female voice', quality: 'premium' },
  { name: 'en-IE-ConnorNeural', gender: 'Male', language: 'en-IE', description: 'Connor (IE) - Irish male voice', quality: 'premium' }
];

// 🎯 Vozes de fallback (testadas e confiáveis)
const FALLBACK_VOICES = [
  'en-US-JennyNeural',
  'en-US-GuyNeural',
  'en-GB-SoniaNeural',
  'en-GB-RyanNeural'
];

// 📝 Cache de vozes disponíveis
let availableVoicesCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

/**
 * 🔍 Verifica se uma voz está disponível no sistema
 */
async function isVoiceAvailable(voiceName) {
  try {
    // Atualiza cache se necessário
    if (!availableVoicesCache || (Date.now() - cacheTimestamp) > CACHE_DURATION) {
      console.log('🔄 [TTS] Atualizando cache de vozes...');
      const { stdout } = await execAsync('edge-tts --list-voices', { timeout: 10000 });
      availableVoicesCache = stdout;
      cacheTimestamp = Date.now();
    }

    const available = availableVoicesCache.includes(voiceName);
    console.log(`${available ? '✅' : '❌'} [TTS] Voz ${voiceName}: ${available ? 'disponível' : 'indisponível'}`);
    return available;
  } catch (error) {
    console.error('⚠️ [TTS] Erro ao verificar voz disponível:', error.message);
    return false;
  }
}

/**
 * 🎯 Encontra uma voz funcional (usa fallback se necessário)
 */
async function getFunctionalVoice(requestedVoice) {
  // Tenta usar a voz solicitada
  if (await isVoiceAvailable(requestedVoice)) {
    return requestedVoice;
  }

  console.warn(`⚠️ [TTS] Voz ${requestedVoice} não disponível, tentando fallback...`);

  // Tenta cada voz de fallback
  for (const fallbackVoice of FALLBACK_VOICES) {
    if (await isVoiceAvailable(fallbackVoice)) {
      console.log(`✅ [TTS] Usando voz de fallback: ${fallbackVoice}`);
      return fallbackVoice;
    }
  }

  // Se nenhuma funcionar, usa a primeira disponível
  console.warn('⚠️ [TTS] Nenhuma voz de fallback disponível, usando voz padrão');
  return 'en-US-JennyNeural'; // Última tentativa
}

/**
 * 🎙️ Sintetiza texto em áudio usando Edge TTS
 * VERSÃO OTIMIZADA com validação e fallback automático
 */
export async function synthesizeSpeech(text, voice = 'en-US-JennyNeural', rate = 1.0, pitch = 0) {
  return new Promise(async (resolve, reject) => {
    try {
      // ✅ VALIDAÇÕES
      if (!text || text.trim().length === 0) {
        return reject(new Error('Text cannot be empty'));
      }

      // Limita rate entre 0.5 e 2.0
      rate = Math.max(0.5, Math.min(2.0, rate));

      // Limita pitch entre -50 e +50
      pitch = Math.max(-50, Math.min(50, pitch));

      // 🎯 Encontra uma voz funcional
      const functionalVoice = await getFunctionalVoice(voice);

      // Converter rate para formato do Edge TTS
      const ratePercent = Math.round((rate - 1) * 100);
      const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

      // Converter pitch para formato do Edge TTS
      const pitchHz = Math.round(pitch);
      const pitchStr = pitchHz >= 0 ? `+${pitchHz}Hz` : `${pitchHz}Hz`;

      console.log('🎤 [TTS] Synthesizing speech...');
      console.log('📝 [TTS] Text:', text.substring(0, 50) + '...');
      console.log('🗣️ [TTS] Voice:', functionalVoice, voice !== functionalVoice ? `(fallback from ${voice})` : '');
      console.log('⚡ [TTS] Rate:', rateStr);
      console.log('🎵 [TTS] Pitch:', pitchStr);

      // Limpa o texto (remove caracteres problemáticos)
      const cleanText = text
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove caracteres de controle
        .replace(/[#*_~`]/g, '') // Remove markdown
        .replace(/\*\*/g, '')
        .trim();

      if (cleanText.length === 0) {
        return reject(new Error('Text is empty after cleaning'));
      }

      const args = [
        '--voice', functionalVoice,
        `--rate=${rateStr}`,
        `--pitch=${pitchStr}`,
        '--text', cleanText
      ];

      console.log('💻 [TTS] Command: edge-tts', args.slice(0, -2).join(' '), '--text', '"..."');

      const process = spawn('edge-tts', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      });

      const chunks = [];
      let errorOutput = '';

      process.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });

      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          console.error('❌ [TTS] Process exited with code:', code);
          console.error('❌ [TTS] Error output:', errorOutput);

          // Se falhou, tenta com voz padrão como última tentativa
          if (functionalVoice !== 'en-US-JennyNeural') {
            console.log('🔄 [TTS] Tentando última vez com voz padrão...');
            return synthesizeSpeech(text, 'en-US-JennyNeural', 1.0, 0)
              .then(resolve)
              .catch(reject);
          }

          return reject(new Error(`Edge TTS failed with code ${code}: ${errorOutput}`));
        }

        if (chunks.length === 0) {
          return reject(new Error('No audio data received from Edge TTS'));
        }

        const audioBuffer = Buffer.concat(chunks);

        console.log('✅ [TTS] Audio generated successfully');
        console.log('📦 [TTS] Size:', (audioBuffer.length / 1024).toFixed(2), 'KB');

        resolve(audioBuffer);
      });

      process.on('error', (error) => {
        console.error('❌ [TTS] Process error:', error);
        reject(new Error(`Failed to start Edge TTS: ${error.message}`));
      });

      // Timeout de segurança (30 segundos)
      setTimeout(() => {
        process.kill();
        reject(new Error('Edge TTS timeout (30s)'));
      }, 30000);

    } catch (error) {
      console.error('❌ [TTS] Error:', error);
      reject(error);
    }
  });
}

/**
 * 🎭 Lista todas as vozes disponíveis do Edge TTS
 */
export async function listAvailableVoices() {
  try {
    console.log('📋 [TTS] Fetching available voices...');

    const { stdout } = await execAsync('edge-tts --list-voices', { timeout: 15000 });

    const voices = [];
    const lines = stdout.split('\n');

    let currentVoice = {};
    for (const line of lines) {
      if (line.startsWith('Name:')) {
        if (currentVoice.name) voices.push(currentVoice);
        currentVoice = { name: line.replace('Name:', '').trim() };
      } else if (line.includes('Gender:')) {
        currentVoice.gender = line.split('Gender:')[1].trim().split(',')[0];
      } else if (line.includes('Locale:')) {
        currentVoice.language = line.split('Locale:')[1].trim();
      }
    }

    if (currentVoice.name) voices.push(currentVoice);

    console.log(`✅ [TTS] Found ${voices.length} voices`);

    // Atualiza cache
    availableVoicesCache = stdout;
    cacheTimestamp = Date.now();

    return voices;

  } catch (error) {
    console.error('❌ [TTS] Error listing voices:', error);
    return RECOMMENDED_VOICES;
  }
}

/**
 * 🎯 Obter vozes filtradas por idioma
 */
export function getVoicesByLanguage(language) {
  return RECOMMENDED_VOICES.filter(v => v.language === language);
}

/**
 * 🔍 Encontrar voz por nome
 */
export function findVoiceByName(name) {
  return RECOMMENDED_VOICES.find(v => v.name === name) || null;
}