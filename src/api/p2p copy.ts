import { P2pConnectionData } from "./types";


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

export class P2P {
  private connection: null | RTCPeerConnection = null;
  private resolveChannel: (value: RTCDataChannel) => void = () => {};
  private closeHandler: () => void = () => {};
  channelPromise!: Promise<RTCDataChannel>;

  constructor() {
    this.channelPromise = new Promise<RTCDataChannel>((resolve) => {
      this.resolveChannel = resolve;
    });
  }

  createOffer = async () => {
    const connection = new RTCPeerConnection({ iceServers });
    this.connection = connection;
    const channel = connection.createDataChannel('fileTransfer');
    // this.channel = channel;
    connection.oniceconnectionstatechange = () => {
      if (
        connection.iceConnectionState === 'disconnected' ||
        connection.iceConnectionState === 'failed'
      ) {
        this.closeHandler();
        connection.close();
      }
    };

    channel.onopen = () => this.resolveChannel(channel);

    const candidates: RTCIceCandidate[] = [];

    let resolveCandidates: () => void = () => {};
    const candidatesPromise = new Promise<void>((resolve) => {
      resolveCandidates = resolve;
    });

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        candidates.push(event.candidate);
      } else if (connection.localDescription) {
        // Сбор завершен, отправляем ВСЕ данные
        resolveCandidates();
      }
    };

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    await candidatesPromise;

    if (connection.localDescription) {
      return {
        sdp: {
          type: connection.localDescription.type,
          sdp: connection.localDescription.sdp,
        },
        candidates: candidates,
      };
    }
  };

  createAnswer = async (offer: P2pConnectionData) => {
    const connection = new RTCPeerConnection({ iceServers });
    this.connection = connection;

    connection.oniceconnectionstatechange = () => {
      if (
        connection.iceConnectionState === 'disconnected' ||
        connection.iceConnectionState === 'failed'
      ) {
        this.closeHandler();
        connection.close();
      }
    };

    // 1. Загрузить данные А в свой PeerConnection
    await connection.setRemoteDescription(new RTCSessionDescription(offer.sdp));
    offer.candidates.forEach((candidate) =>
      connection.addIceCandidate(new RTCIceCandidate(candidate)),
    );

    // 2. Создать СВОИ данные (как А в этапе 1)
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);

    const candidates: RTCIceCandidate[] = [];

    let resolveCandidates: () => void = () => {};
    const candidatesPromise = new Promise<void>((resolve) => {
      resolveCandidates = resolve;
    });

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        candidates.push(event.candidate);
      } else if (connection.localDescription) {
        // Сбор завершен, отправляем ВСЕ данные
        resolveCandidates();
      }
    };

    await candidatesPromise;

    connection.ondatachannel = (event) => this.resolveChannel(event.channel);

    // 3. Отправить СВОИ данные в БД (уже как answer)
    if (connection.localDescription) {
      return {
        sdp: { type: 'answer' as const, sdp: connection.localDescription.sdp },
        candidates,
      };
    }
  };

  applyAnswer = async (answer: P2pConnectionData) => {
    if (this.connection) {
      await this.connection.setRemoteDescription(
        new RTCSessionDescription(answer.sdp),
      );
      answer.candidates.forEach((candidate) =>
        this.connection?.addIceCandidate(new RTCIceCandidate(candidate)),
      );
    } else {
      console.log('NO connection');
    }
  };

  addCloseHandler = (f: () => void) => (this.closeHandler = f);
}
