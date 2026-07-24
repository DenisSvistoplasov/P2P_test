import { useCallback, useEffect } from 'react';

import ringtoneUrl from '../assets/ringtone.mp3';

// Глобальные переменные для переиспользования ресурсов
let audioCtx: AudioContext | null = null;
let ringtoneBuffer: AudioBuffer | null = null;
let ringtoneBufferPromise: Promise<AudioBuffer | undefined> =
  Promise.resolve(undefined);
let currentSource: AudioBufferSourceNode | null = null;

// Инициализируем контекст и загружаем файл ОДИН раз при загрузке JS-модуля
const initAudio = async () => {
  if (ringtoneBuffer) return; // Уже инициализировано

  try {
    // 1. Создаем аудио-контекст
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();

    // 2. Читаем локальный импортированный файл как бинарный поток (ArrayBuffer)
    const response = await fetch(ringtoneUrl);
    const arrayBuffer = await response.arrayBuffer();

    // 3. Декодируем сжатый MP3 в сырые аудио-данные для быстрой игры
    ringtoneBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    return ringtoneBuffer;
  } catch (error) {
    console.error('[Web Audio] Не удалось предзагрузить рингтон:', error);
  }
};

// Запускаем предзагрузку мгновенно при старте приложения
ringtoneBufferPromise = initAudio();

export const usePlayIncomingCallRing = () => {
  const play = useCallback(async () => {
    try {
      // Подстраховка, если initAudio еще не завершился
      await ringtoneBufferPromise;
      if (!audioCtx || !ringtoneBuffer) return;

      // Если контекст "заснул" из-за политик автоплея браузера — будим его
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // Если рингтон уже играет, сначала тушим старый, чтобы не было наложения звуков
      if (currentSource) {
        try {
          currentSource.stop();
        } catch {}
      }

      // Создаем узел-источник (его нужно создавать заново для каждого проигрывания)
      currentSource = audioCtx.createBufferSource();
      currentSource.buffer = ringtoneBuffer;
      currentSource.loop = true;

      // Подключаем напрямую к колонкам / наушникам устройства
      currentSource.connect(audioCtx.destination);

      // Мгновенный старт без задержек на загрузку
      currentSource.start(0);
    } catch (error) {
      console.warn('Автоплей заблокирован браузером до первого клика', error);
      alert('Входящий звонок');
    }
  }, []);

  const stop = useCallback(() => {
    if (currentSource) {
      try {
        currentSource.stop();
        currentSource.disconnect();
      } catch (e) {
        // Игнорируем ошибку, если источник не успел запуститься
      }
      currentSource = null;
    }
  }, []);

  // Гарантированная очистка при размонтировании хука
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return [play, stop] as const;
};
