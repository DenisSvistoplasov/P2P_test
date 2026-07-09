export const generateAliceKeys = async () => {
  const aliceKeyPair = await window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // false означает, что приватный ключ нельзя извлечь/украсть из памяти
    ['deriveKey'], // Этот тип ключей нужен только для создания общего секрета
  );

  // Алиса экспортирует свой публичный ключ в формат JSON (JWK)
  const aliceJwkKey = await window.crypto.subtle.exportKey(
    'jwk',
    aliceKeyPair.publicKey,
  );

  return { aliceKeyPair, aliceJwkKey };
};

export const encrypt = async (
  data: string | Uint8Array<ArrayBuffer>,
  sharedKey: CryptoKey,
) => {
  const rawBytes =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    rawBytes,
  );
  const encryptedBytes = new Uint8Array(encryptedBuffer);
  const packetToSend = new Uint8Array(iv.length + encryptedBytes.length);
  packetToSend.set(iv, 0);
  packetToSend.set(encryptedBytes, 12);

  return packetToSend;
};

export const decrypt = async (
  packetToSend: Uint8Array,
  sharedKey: CryptoKey,
) => {
  // 1. Извлекаем IV из первых 12 байт пакета
  const iv = packetToSend.slice(0, 12);

  // 2. Извлекаем зашифрованные данные (все, что после 12-го байта)
  const receivedEncryptedData = packetToSend.slice(12);

  // 3. Расшифровываем байты обратно в чистые байты
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    receivedEncryptedData,
  );
  const decryptedBytes = new Uint8Array(decryptedBuffer);

  return decryptedBytes;
};

export const encryptOutgoingTracks = (
  senders: RTCRtpSender[],
  sharedKey: CryptoKey,
) => {
  senders.forEach((sender) => {
    // Нас интересует только видеотрек (для аудио логика будет такой же)
    if (
      sender.track &&
      (sender.track.kind === 'video' || sender.track.kind === 'audio')
    ) {
      // 1. Создаем нативный трансформер JavaScript
      const transformStream = new TransformStream({
        async transform(frame, controller) {
          // frame — это объект RTCEncodedVideoFrame (один кадр видео)

          // Достаем сырые байты кадра
          const rawBytes = new Uint8Array(frame.data);

          // Шифруем эти байты нашей созданной функцией encrypt
          // ВАЖНО: передаем в encrypt как Uint8Array
          const encryptedPacket = await encrypt(rawBytes, sharedKey);

          // Записываем зашифрованные байты обратно в кадр
          frame.data = encryptedPacket.buffer as ArrayBuffer;

          // Проталкиваем зашифрованный кадр дальше в сеть
          controller.enqueue(frame);
        },
      });

      // 2. Вставляем наш трансформер в отправляемый видеопоток
      sender.transform = transformStream;
    }
  });
};

export const decryptIncomingTracks = (
  receivers: RTCRtpReceiver[],
  sharedKey: CryptoKey,
) => {
  // Вызывать этот код нужно, когда peer сообщил о получении удаленного стрима (событие 'stream')
  // const receivers = this.peer._pc.getReceivers();

  receivers.forEach((receiver) => {
    if (
      receiver.track &&
      (receiver.track.kind === 'video' || receiver.track.kind === 'audio')
    ) {
      // 1. Создаем трансформер для дешифрации
      const transformStream = new TransformStream({
        async transform(frame, controller) {
          const encryptedBytes = new Uint8Array(frame.data);

          try {
            // Расшифровываем байты кадра нашей функцией decrypt
            const decryptedBytes = await decrypt(encryptedBytes, sharedKey);

            // Возвращаем чистые байты обратно в кадр
            frame.data = decryptedBytes.buffer as ArrayBuffer;

            // Отдаем чистый кадр браузеру для отрисовки на экране
            controller.enqueue(frame);
          } catch (e) {
            // Если ключ еще не долетел, просто дропаем кадр, чтобы не ломать декодер
            console.error('Не удалось расшифровать кадр видео/аудио', e);
          }
        },
      });

      // 2. Вставляем трансформер во входящий видеопоток
      receiver.transform = transformStream;
    }
  });
};
