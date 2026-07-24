export const generateAliceKeys = async () => {
  const aliceKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // false означает, что приватный ключ нельзя извлечь/украсть из памяти
    ['deriveKey'], // Этот тип ключей нужен только для создания общего секрета
  );

  // Алиса экспортирует свой публичный ключ в формат JSON (JWK)
  const aliceJwkKey = await crypto.subtle.exportKey(
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
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await crypto.subtle.encrypt(
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
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    receivedEncryptedData,
  );
  const decryptedBytes = new Uint8Array(decryptedBuffer);

  return decryptedBytes;
};


