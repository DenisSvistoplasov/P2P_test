import { decrypt, encrypt } from './utils/cryptoUtils';
import { formateTimeDuration } from './utils/utils';

console.log('=== ТЕСТ: Воркер успешно загрузился и запустился в Webpack! ===');

self.addEventListener('message', (event) => {
  console.log(
    'Воркер получил сообщение от React:',
    event.data,
    formateTimeDuration(120000),
  );
  self.postMessage('Ответ от воркера');
});

// Слушаем подключение медиа-труб от WebRTC
self.addEventListener('rtctransform', (event: any) => {
  // 1. Получаем уникальный трансформер для конкретного трека звонка
  const transformer = event.transformer;

  // 2. Достаем из него опции, которые мы передали из React
  const { operation, sharedKey } = transformer.options;

  // 3. Создаем изолированный поток обработки кадров
  const transformStream = new TransformStream({
    async transform(frame, controller) {
      // frame — это один кадр видео (RTCEncodedVideoFrame) или аудио
      // Достаем из него сырые байты
      const rawBytes = new Uint8Array(frame.data);

      try {
        if (operation === 'encrypt') {
          const encrypted = await encrypt(rawBytes, sharedKey);
          frame.data = encrypted.buffer;

          console.log('Воркер шифрует кадр...');
        } else if (operation === 'decrypt') {
          const decrypted = await decrypt(rawBytes, sharedKey);
          frame.data = decrypted.buffer;

          console.log('Воркер расшифровывает кадр...');
        }
      } catch (error) {
        console.error('Ошибка криптографии в воркере:', error);
        return; // Дропаем кадр при ошибке, чтобы не ломать картинку
      }

      // Пропускаем кадр дальше по конвейеру в сеть или на экран
      controller.enqueue(frame);
    },
  });

  // 4. Магическая связка: направляем входящую трубу WebRTC
  // через наш шифратор прямо в исходящую трубу WebRTC
  transformer.readable
    .pipeThrough(transformStream)
    .pipeTo(transformer.writable);
});
