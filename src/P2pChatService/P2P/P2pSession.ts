import Peer, { SignalData } from '@workadventure/simple-peer';
import { decrypt, encrypt, generateAliceKeys } from '../utils/cryptoUtils';

const CHUNK_SIZE = 16384; // 16 КБ

const iceServers = [
  // Google (5 серверов)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },

  // Mozilla
  { urls: 'stun:stun.services.mozilla.com:3478' },

  // Общедоступные
  { urls: 'stun:stun.stunprotocol.org:3478' },
  { urls: 'stun:stun.ekiga.net:3478' },
  { urls: 'stun:stun.ideasip.com:3478' },
  { urls: 'stun:stun.voipbuster.com:3478' },
];

type P2pMessage =
  | { type: 'text'; text: string }
  | { type: 'meta'; name: string; mime: string; size: number }
  | { type: 'endVideoCall' }
  | { type: 'jwkKey'; value: JsonWebKey };

interface P2pSessionConfig {
  initiator: boolean;
  onSignal: (data: SignalData) => void;
  onStatusChange: (isConnected: boolean) => void;
  onTextMessage: (text: string) => void;
  onImageMessage: (
    url: string,
    name: string,
    mime: string,
    size: number,
  ) => void;
  onIncomingStream: (remoteStream: MediaStream) => void;
  onEndVideoCall: () => void;
}

export class P2pSession {
  private peer: Peer;
  private isConnected: boolean = false;
  private fileMeta: {
    name: string;
    mime: string;
    size: number;
    chunks: Uint8Array[];
  } | null = null;
  private localStream: MediaStream | null = null;
  private onEndVideoCall: (() => void) | null = null;
  private _aliceKeyPair: CryptoKeyPair | null = null;
  private _bobPublicKey: CryptoKey | null = null;
  private sharedKey: CryptoKey | null = null;

  public isCryptoReady = false;

  private async tryCreateSharedKey() {
    if (this._aliceKeyPair && this._bobPublicKey) {
      this.sharedKey = await window.crypto.subtle.deriveKey(
        { name: 'ECDH', public: this._bobPublicKey }, // Чужой публичный ключ
        this._aliceKeyPair.privateKey, // Свой приватный ключ
        { name: 'AES-GCM', length: 256 }, // Какой ключ мы хотим получить на выходе
        false, // Нельзя извлечь из памяти
        ['encrypt', 'decrypt'], // Что этим ключом разрешено делать
      );
      this.isCryptoReady = true;
      console.log('Shared key created');
    }
  }

  private setAliceKeyPair(aliceKeyPair: CryptoKeyPair) {
    this._aliceKeyPair = aliceKeyPair;
    this.tryCreateSharedKey();
  }
  private setBobPublicKey(bobPublicKey: CryptoKey) {
    this._bobPublicKey = bobPublicKey;
    this.tryCreateSharedKey();
  }

  private killLocalStream() {
    if (this.localStream) {
      console.log('Killing local stream');
      this.peer.removeStream(this.localStream);
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }

  constructor(config: P2pSessionConfig) {
    // 1. Создаем внутренний пир
    this.peer = new Peer({
      initiator: config.initiator,
      trickle: false,
      config: { iceServers, ...({ encodedTransform: true } as any) },
    });

    this.onEndVideoCall = config.onEndVideoCall;

    // 2. Инкапсулируем системные события
    this.peer.on('signal', (data) => {
      config.onSignal(data); // Передаем наружу готовый оффер/ансер для отправки на сервер
    });

    this.peer.on('connect', async () => {
      if (this.isConnected) return;
      this.isConnected = true;

      config.onStatusChange(true); // Соединение установлено (Статус 3)

      const { aliceKeyPair, aliceJwkKey } = await generateAliceKeys();

      this.setAliceKeyPair(aliceKeyPair);

      // Отправляем aliceJwkKey Бобу
      this.peer.send(JSON.stringify({ type: 'jwkKey', value: aliceJwkKey }));
    });

    this.peer.on('close', () => {
      console.log('p2p on close');
      config.onStatusChange(false);
      this.killLocalStream();
    });

    this.peer.on('error', (err) => {
      console.error('P2P Error:', err);
    });

    // 3. Инкапсулируем всю сложную логику разбора чанков и картинок!
    this.peer.on('data', async (data: Uint8Array) => {
      console.log('on data. isCryptoReady', this.isCryptoReady);

      data = this.sharedKey ? await decrypt(data, this.sharedKey) : data;

      try {
        // Пробуем распарсить как текст (сообщение или мета файла)
        const text = new TextDecoder().decode(data);
        const parsed = JSON.parse(text) as P2pMessage;

        // На случай, если JSON.parse случайно сожрал кусок файла и выдал строку/число
        if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
          throw new Error('Not a P2pMessage');
        }

        if (parsed.type === 'jwkKey') {
          const bobPublicKey = await window.crypto.subtle.importKey(
            'jwk',
            parsed.value,
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            [],
          );
          this.setBobPublicKey(bobPublicKey);
        }
        if (parsed.type === 'text') {
          config.onTextMessage(parsed.text);
        }
        if (parsed.type === 'meta') {
          // Запоминаем, что сейчас полетит картинка
          this.fileMeta = { ...parsed, chunks: [] };
        }
        if (parsed.type === 'endVideoCall') {
          this.endVideoCall(false);
        }
      } catch (e) {
        // Если упало — значит прилетели бинарные данные (кусок файла)
        if (!this.fileMeta) {
          return console.error('Получены бинарные данные без мета-информации');
        }

        // Копим чанки внутри класса
        this.fileMeta.chunks.push(data);

        // Считаем текущий размер собранного
        const currentSize = this.fileMeta.chunks.reduce(
          (sum, ch) => sum + ch.byteLength,
          0,
        );

        // Если собрали полностью
        if (currentSize >= this.fileMeta.size) {
          const blob = new Blob(this.fileMeta.chunks as BlobPart[], {
            type: this.fileMeta.mime,
          });
          const url = URL.createObjectURL(blob);

          // Отдаем в React уже готовую ссылку на картинку!
          config.onImageMessage(
            url,
            this.fileMeta.name,
            this.fileMeta.mime,
            this.fileMeta.size,
          );
          this.fileMeta = null; // Сбрасываем мета для следующего файла
        }
      }
    });

    // 4. Входящий медиа поток
    this.peer.on('stream', async (remoteStream: MediaStream) => {
      console.log('On incoming stream', remoteStream);

      // if (this.peer._pc && this.sharedKey) {
      //   this.peer._pc.addEventListener('track', (event) => {
      //     event.receiver;
      //   });
      //   const receivers = this.peer._pc.getReceivers();
      //   decryptIncomingTracks(receivers, this.sharedKey);
      // } else {
      //   console.error(
      //     'Cannot add decrypt transformer. peer._pc:',
      //     this.peer._pc,
      //     'sharedKey:',
      //     this.sharedKey,
      //   );
      //   // setTimeout(() => this.addDecryptVideoCallTransformer(), 200);
      // }

      config.onIncomingStream(remoteStream);
    });
  }

  // --- Публичные методы для управления из React ---

  /** Скармливаем данные собеседника (оффер/ансер) */
  public applySignal(data: SignalData) {
    if (!this.peer.destroyed) {
      this.peer.signal(data);
    }
  }

  /** Отправить текст */
  public async sendText(text: string) {
    const message: P2pMessage = { type: 'text', text };
    const stringifiedMessage = JSON.stringify(message);
    const packetToSend = this.sharedKey
      ? await encrypt(stringifiedMessage, this.sharedKey)
      : stringifiedMessage;

    this.peer.send(packetToSend);
  }

  /** Отправить картинку */
  public async sendImage(file: File) {
    // 1. Сначала отправляем текстовые мета-данные, чтобы та сторона подготовилась
    const meta: P2pMessage = {
      type: 'meta',
      name: file.name,
      mime: file.type,
      size: file.size,
    };
    const stringifiedMeta = JSON.stringify(meta);
    const packetToSend = this.sharedKey
      ? await encrypt(stringifiedMeta, this.sharedKey)
      : stringifiedMeta;
    this.peer.send(packetToSend);

    // 2. Читаем файл и нарезаем его на чанки по 16 КБ
    const reader = new FileReader();
    reader.onload = async () => {
      const buffer = reader.result as ArrayBuffer;

      let offset = 0;
      while (offset < buffer.byteLength) {
        // Берем кусочек в 16 КБ
        const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
        const chunkUint8Array = new Uint8Array(chunk);
        const packetToSend = this.sharedKey
          ? await encrypt(chunkUint8Array, this.sharedKey)
          : chunkUint8Array;
        // Отправляем чанк
        this.peer.send(packetToSend);

        offset += CHUNK_SIZE;
      }
    };

    reader.readAsArrayBuffer(file);
  }

  /** Включить камеру */
  public async addCameraStream() {
    try {
      // 1. Запрашиваем доступ к камере и микрофону
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      // 2. Добавляем поток в P2P-сессию - это запустит ренеготиацию
      // и отправит новый answer на сервер
      this.peer.addStream(stream);

      // 3. Зашифровываем поток
      // if (this.peer._pc && this.sharedKey) {
      //   const senders = this.peer._pc.getSenders();
      //   encryptOutgoingTracks(senders, this.sharedKey);
      // }

      // 4. Сохраняем свой поток в стейт
      this.localStream = stream;
      return stream;
    } catch (err) {
      console.error('Ошибка доступа к камере или микрофону:', err);
    }
  }

  /** Отключить камеру */
  public async endVideoCall(isInitiator = true) {
    console.log('endVideoCall. isInitiator: ', isInitiator);

    if (isInitiator) {
      const endVideoCallMessage = JSON.stringify({ type: 'endVideoCall' });
      const packetToSend = this.sharedKey
        ? await encrypt(endVideoCallMessage, this.sharedKey)
        : endVideoCallMessage;
      this.peer.send(packetToSend);
    }
    this.killLocalStream();
    this.onEndVideoCall?.();
  }

  /** Закрыть соединение и очистить память */
  public destroy() {
    this.peer.destroy();
  }
}
