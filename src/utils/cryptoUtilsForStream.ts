import { worker } from '../workerInitializer';

export const encryptOutgoingTracks = (
  senders: RTCRtpSender[],
  sharedKey: CryptoKey,
) => {
  senders.forEach((sender) => {
    if (
      sender.track &&
      (sender.track.kind === 'video' || sender.track.kind === 'audio')
    ) {
      try {
        sender.transform = new RTCRtpScriptTransform(worker, {
          operation: 'encrypt',
          sharedKey,
        });

        console.log(
          `[React] Шифрование успешно подключено к воркеру для трека: ${sender.track.kind}`,
        );
      } catch (error) {
        console.error(
          `[React] Ошибка подключения трека ${sender.track.kind} к воркеру:`,
          error,
        );
      }
    }
  });
};

export const decryptIncomingTracks = (
  receivers: RTCRtpReceiver[],
  sharedKey: CryptoKey,
) => {
  receivers.forEach((receiver) => {
    if (
      receiver.track &&
      (receiver.track.kind === 'video' || receiver.track.kind === 'audio')
    ) {
      try {
        receiver.transform = new RTCRtpScriptTransform(worker, {
          operation: 'decrypt',
          sharedKey,
        });

        console.log(
          `[P2P] Дешифрация успешно подключена к воркеру для трека: ${receiver.track.kind}`,
        );
      } catch (error) {
        console.error(
          `[P2P] Ошибка подключения дешифрации трека ${receiver.track.kind} к воркеру:`,
          error,
        );
      }
    }
  });
};
