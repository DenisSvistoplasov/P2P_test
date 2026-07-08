import Peer, { SignalData } from '@workadventure/simple-peer';

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

export type P2pMessage =
  | { type: 'text'; text: string }
  | { type: 'meta'; name: string; mime: string; size: number }
  | { type: 'endVideoCall' };

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
  private fileMeta: {
    name: string;
    mime: string;
    size: number;
    chunks: Uint8Array[];
  } | null = null;
  private localStream: MediaStream | null = null;
  private onEndVideoCall: (() => void) | null = null;

  constructor(config: P2pSessionConfig) {
    // 1. Создаем внутренний пир
    this.peer = new Peer({
      initiator: config.initiator,
      trickle: false,
      config: { iceServers },
    });

    this.onEndVideoCall = config.onEndVideoCall;

    // 2. Инкапсулируем системные события
    this.peer.on('signal', (data) => {
      config.onSignal(data); // Передаем наружу готовый оффер/ансер для отправки на сервер
    });

    this.peer.on('connect', () => {
      config.onStatusChange(true); // Соединение установлено (Статус 3)
      console.log('p2p connected');
    });

    this.peer.on('close', () => {
      config.onStatusChange(false); // Соединение упало
    });

    this.peer.on('error', (err) => {
      console.error('P2P Error:', err);
      config.onStatusChange(false);
    });

    // 3. Инкапсулируем всю сложную логику разбора чанков и картинок!
    this.peer.on('data', (data: Uint8Array) => {
      try {
        // Пробуем распарсить как текст (сообщение или мета файла)
        const text = new TextDecoder().decode(data);
        const parsed = JSON.parse(text) as P2pMessage;

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
        // Если упало — значит прилетели бинарные данные (кусок картинки)
        if (!this.fileMeta)
          return console.error('Получены бинарные данные без мета-информации');

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
      console.log('On stream', remoteStream);
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
  public sendText(text: string) {
    const msg: P2pMessage = { type: 'text', text };
    this.peer.send(JSON.stringify(msg));
  }

  /** Отправить картинку */
  public sendImage(file: File) {
    // 1. Сначала отправляем текстовые мета-данные, чтобы та сторона подготовилась
    const meta: P2pMessage = {
      type: 'meta',
      name: file.name,
      mime: file.type,
      size: file.size,
    };
    this.peer.send(JSON.stringify(meta));

    // 2. Читаем файл и нарезаем его на чанки по 16 КБ
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;

      let offset = 0;
      while (offset < buffer.byteLength) {
        // Берем кусочек в 16 КБ
        const chunk = buffer.slice(offset, offset + CHUNK_SIZE);

        // Отправляем чанк в сеть
        this.peer.send(new Uint8Array(chunk));

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

      this.localStream = stream;
      // 3. Сохраняем свой поток в стейт
      return stream;
    } catch (err) {
      console.error('Ошибка доступа к камере или микрофону:', err);
    }
  }

  /** Отключить камеру */
  public endVideoCall(isInitiator = true) {
    console.log('endVideoCall. isInitiator: ', isInitiator);

    if (isInitiator) this.peer.send(JSON.stringify({ type: 'endVideoCall' }));
    if (this.localStream) {
      this.peer.removeStream(this.localStream);
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.onEndVideoCall?.();
  }

  /** Закрыть соединение и очистить память */
  public destroy() {
    this.peer.destroy();
  }
}
