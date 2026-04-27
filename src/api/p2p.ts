export type P2pConnectionData = {
  sdp: RTCSessionDescriptionInit;
  candidates: RTCIceCandidateInit[];
};

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

export const P2P = {
  connection: null as null | RTCPeerConnection,
  channel: null as null | RTCDataChannel,

  async createOffer() {
    const connection = new RTCPeerConnection({ iceServers });
    this.connection = connection;
    const channel = connection.createDataChannel('fileTransfer');
    this.channel = channel;

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
  },

  async createAnswer(offer: P2pConnectionData) {
    const connection = new RTCPeerConnection({ iceServers });
    this.connection = connection;

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

    // 3. Отправить СВОИ данные в БД (уже как answer)
    if (connection.localDescription) {
      return {
        sdp: { type: 'answer' as const, sdp: connection.localDescription.sdp },
        candidates,
      };
    }
  },

  async applyAnswer(answer: P2pConnectionData) {
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
  },

  onOpen(f: (channel: RTCDataChannel) => void) {
    console.log('onOpen this.channel: ', !!this.channel);
    if (this.channel) {
      const channel = this.channel;
      this.channel.onopen = () => f(channel);
    }
  },

  onMessage(f: (message: string) => void) {
    if (this.connection) {
      this.connection.ondatachannel = (event) => {
        console.log('ondatachannel');

        const channel = event.channel;
        channel.onmessage = (message) => {
          console.log('onmessage');
          f(message.data);
        };
      };
    } else {
      console.log('NO connection2');
    }
  },

  async getChannel() {
    if (this.connection) {
      let resolveChannel!: (value: RTCDataChannel) => void;
      const channelPromise = new Promise<RTCDataChannel>((resolve) => {
        resolveChannel = resolve;
      });

      this.connection.ondatachannel = (event) => {
        resolveChannel(event.channel);
      };

      return channelPromise;
    }
  },
};
