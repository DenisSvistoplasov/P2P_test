import { SignalData } from '@workadventure/simple-peer';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pair, SetAnswerBody, SetOfferBody } from './api/types';
import { useWsClient } from './hooks/useWsClient';
import { P2pSession } from './api/simplePeer';
import { WsStatus } from './server/webSocket';
import { usePlayIncomingCallRing } from './hooks/usePlayIncomingCallRing';
import { generateUserId } from './utils/utils';

type PairState = 0 | 1 | 2 | 3;
export type VideoCallStatus = 'off' | 'incoming' | 'outgoing' | 'on';

export type TextMessage = {
  type: 'text';
  text: string;
  isOwner?: boolean;
};
export type ImageMessageType = {
  type: 'image';
  name: string;
  mime: string;
  url: string;
  size: number; // bytes
  isOwner?: boolean;
};
export type CallInfoMessage = {
  type: 'callInfo';
  start: boolean;
  timestamp: number; // ms
  duration?: number; // ms
};
export type Message = TextMessage | ImageMessageType | CallInfoMessage;

export const useP2pChatService = ({
  userId,
  currentPairId,
  handleNewMessage,
}: {
  userId: string;
  currentPairId: string;
  handleNewMessage: (pairId: string, message: Message) => void;
}) => {
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected');
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [p2pChannels, setP2pChannels] = useState<Record<string, boolean>>({});
  const [videoCallStatus, setVideoCallStatus] = useState<
    Record<string, VideoCallStatus>
  >({});
  const [videoInfoMessages, setVideoInfoMessages] = useState<Record<string, Message[]>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const p2pInstancesRef = useRef<Record<string, P2pSession>>({});
  const currentPairIdRef = useRef(currentPairId);

  const ws = useWsClient();

  const pairsWithState = useMemo<(Pair & { state: PairState })[]>(() => {
    return pairs.map((pair) => ({
      ...pair,
      state: p2pChannels[pair.pairId]
        ? 3
        : pair.answer
          ? 2
          : pair.offer
            ? 1
            : 0,
    }));
  }, [pairs]);

  // Ringtone
  const [playIncomingCallRing, stopIncomingCallRing] =
    usePlayIncomingCallRing();

  useEffect(() => {
    if (Object.values(videoCallStatus).includes('incoming'))
      playIncomingCallRing();
    else stopIncomingCallRing();
  }, [videoCallStatus, playIncomingCallRing, stopIncomingCallRing]);

  const setOffer = useCallback(
    (data: SetOfferBody) => ws.send({ type: 'setOffer', payload: data }),
    [],
  );

  const setAnswer = useCallback(
    (data: SetAnswerBody) => ws.send({ type: 'setAnswer', payload: data }),
    [],
  );

  const addStartVideoCallMessage = useCallback((pairId: string) => {
    const startVideoCallMessage: Message = {
      type: 'callInfo',
      start: true,
      timestamp: Date.now(),
    };
    setVideoInfoMessages((messagesMap) => ({
      ...messagesMap,
      [pairId]: [...(messagesMap[pairId] || []), startVideoCallMessage],
    }));
    handleNewMessage(pairId, startVideoCallMessage);
  }, []);

  const addEndVideoCallMessage = useCallback((pairId: string) => {
    const now = Date.now();
    setVideoInfoMessages((messagesMap) => {
      if (!messagesMap[pairId]?.length) {
        return messagesMap;
      }

      let startVideoCallMessage: CallInfoMessage | undefined;
      const messages = messagesMap[pairId] || [];

      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message.type === 'callInfo') {
          if (message.start) startVideoCallMessage = message;
          break;
        }
      }

      if (!startVideoCallMessage) {
        console.error('While creating endVideoCallMessage: startVideoCallMessage not found');
        return messagesMap;
      }

      const endVideoCallMessage: Message = {
        type: 'callInfo',
        start: false,
        timestamp: now,
        duration: now - startVideoCallMessage.timestamp,
      };

      handleNewMessage(pairId, endVideoCallMessage);

      return {
        ...messagesMap,
        [pairId]: [
          ...(messagesMap[pairId] || []),
          endVideoCallMessage,
        ],
      };
    });
  }, []);

  const onRemoteStreamChange = useCallback((pairId: string, is: boolean) => {
    setVideoCallStatus((prev) => {
      const prevStatus = prev[pairId] || 'off';
      let newStatus = prevStatus;

      if (prevStatus === 'off' && is) {
        newStatus = 'incoming';
      }

      if (prevStatus === 'outgoing' && is) {
        newStatus = 'on';
        addStartVideoCallMessage(pairId);
      }

      if (prevStatus !== 'off' && !is) {
        newStatus = 'off';
        addEndVideoCallMessage(pairId);
        // setVideoCallFullscreen('off'); TODO
      }

      return {
        ...prev,
        [pairId]: newStatus,
      };
    });
  }, []);


  // P2P initiator callbacks
  const createOnSignal = useCallback(
    (userId: string, pair: Pair, isInitiator: boolean) =>
      (signalData: SignalData) => {
        console.log('onSignal ');
        if (isInitiator) {
          setOffer({
            userId,
            partnerId: pair.receiverId,
            offer: signalData,
          });
        }
        if (!isInitiator) {
          setAnswer({
            userId,
            partnerId: pair.senderId,
            answer: signalData,
          });
        }
      },
    [],
  );

  const createOnStatusChange = useCallback(
    (pairId: string) => (isConnected: boolean) => {
      setP2pChannels((prev) => ({ ...prev, [pairId]: isConnected }));

      if (isConnected) {
        console.log('p2p connected');
      } else {
        console.log('p2p disconnected');
        setLocalStream(null);
        setRemoteStream(null);
        onRemoteStreamChange(pairId, false);
        delete p2pInstancesRef.current[pairId];
      }
    },
    [],
  );

  const createOnTextMessage = useCallback(
    (pairId: string) => (text: string) => {
      handleNewMessage(pairId, { type: 'text', text });
    },
    [],
  );

  const createOnImageMessage = useCallback(
    (pairId: string) =>
      (url: string, name: string, mime: string, size: number) => {
        handleNewMessage(pairId, { type: 'image', url, name, mime, size });
      },
    [],
  );

  const createOnIncomingStream = useCallback(
    (pairId: string) => (remoteStream: MediaStream) => {
      onRemoteStreamChange(pairId, true);
      setRemoteStream(remoteStream);
    },
    [],
  );

  const createOnEndVideoCall = useCallback(
    (pairId: string) => () => {
      setLocalStream(null);
      setRemoteStream(null);
      onRemoteStreamChange(pairId, false);
    },
    [],
  );

  const initiateP2P = useCallback((userId: string, pair: Pair) => {
    console.log('initiateP2P. I am initiator: ', userId === pair.senderId, pair.pairId);
    p2pInstancesRef.current[pair.pairId] = new P2pSession({
      initiator: userId === pair.senderId,
      onSignal: createOnSignal(userId, pair, userId === pair.senderId),
      onStatusChange: createOnStatusChange(pair.pairId),
      onTextMessage: createOnTextMessage(pair.pairId),
      onImageMessage: createOnImageMessage(pair.pairId),
      onIncomingStream: createOnIncomingStream(pair.pairId),
      onEndVideoCall: createOnEndVideoCall(pair.pairId),
    });
  }, []);

  //
  useEffect(() => {
    if (!userId) return;
    Object.entries(pairsWithState).forEach(([pairId, pair]) => {
      if (pair.state == 2 && !p2pInstancesRef.current[pairId]) {
        console.log('P2P reconnection', pairId);
        initiateP2P(userId, pair);
      }
    });
  }, [userId, pairsWithState]);

  // useEffect(() => {
  //   userIdRef.current = userId;
  // }, [userId]);

  useEffect(() => {
    currentPairIdRef.current = currentPairId;
  }, [currentPairId]);

  // WebSocket init
  useEffect(() => {
    ws.onMessage((message) => {
      if (message.type === 'initial') {
        const { pairs } = message.payload;
        setPairs(pairs);

        pairs.forEach((pair) => {
          console.log('initiateP2P: on initial',);
          initiateP2P(userId, pair);
        });
      }

      if (message.type === 'putPair') {
        const pair = message.payload;
        if (p2pInstancesRef.current[pair.pairId]) return;
        setPairs((pairs) => {
          const newPairs = [...pairs];
          const existedIndex = newPairs.findIndex(
            (p) => p.pairId === pair.pairId,
          );
          if (existedIndex !== -1) {
            newPairs[existedIndex] = pair;
          } else {
            newPairs.push(pair);
          }
          return newPairs;
        });
        console.log('initiateP2P: on putPair');
        initiateP2P(userId, pair);
      }

      if (message.type === 'setOffer') {
        const { pairId, offer } = message.payload;
        const p2pInstance = p2pInstancesRef.current[pairId];
        if (!p2pInstance) {
          return console.error('There is no instance on get Offer!!!');
        }
        setPairs((pairs) =>
          pairs.map((pair) =>
            pair.pairId === pairId ? { ...pair, offer } : pair,
          ),
        );
        const [, receiverId] = pairId.split('_vs_');
        if (userId === receiverId) {
          p2pInstance.applySignal(offer);
        }
      }

      if (message.type === 'setAnswer') {
        const { pairId, answer } = message.payload;
        const p2pInstance = p2pInstancesRef.current[pairId];
        if (!p2pInstance) {
          return console.error('There is no instance on get Answer!!!');
        }
        setPairs((pairs) =>
          pairs.map((pair) =>
            pair.pairId === pairId ? { ...pair, answer } : pair,
          ),
        );
        const [senderId, receiverId] = pairId.split('_vs_');
        if (userId === senderId) {
          p2pInstance.applySignal(answer);
        }
      }

      if (message.type === 'deletePair') {
        const pairId = message.payload;
        setPairs((pairs) => pairs.filter((pair) => pair.pairId !== pairId));
        const p2pInstance = p2pInstancesRef.current[pairId];

        if (!p2pInstance)
          return console.error(
            'p2pInstance not found for removed pair',
            pairId,
          );

        p2pInstance.destroy();
        delete p2pInstancesRef.current[pairId];

        setP2pChannels((prev) => {
          const next = { ...prev };
          delete next[pairId];
          return next;
        });
      }
    });

    ws.onStatus(setWsStatus);

    ws.send({ type: 'initial', payload: { userId } });
  }, []);

  //

  const sendText = useCallback(
    (text: string) => {
      const p2pInstance = p2pInstancesRef.current[currentPairId];
      if (!p2pInstance)
        return console.error('p2pInstance не найден для', currentPairId);

      p2pInstance.sendText(text);

      const message: Message = { type: 'text', text, isOwner: true };

      handleNewMessage(currentPairId, message);
    },
    [currentPairId],
  );

  const sendFile = useCallback(
    (file: File) => {
      const p2pInstance = p2pInstancesRef.current[currentPairId];
      if (!p2pInstance)
        return console.error('Сессия не найдена для', currentPairId);

      p2pInstance.sendImage(file);

      const message: Message = {
        type: 'image',
        name: file.name,
        mime: file.type,
        url: URL.createObjectURL(file),
        size: file.size,
        isOwner: true,
      };

      handleNewMessage(currentPairId, message);
    },
    [currentPairId],
  );

  const joinVideoCall = useCallback(async () => {
    const currentStatus = videoCallStatus[currentPairId] || 'off';
    const p2pSession = p2pInstancesRef.current[currentPairId];

    if (!p2pSession) return console.error('Сессия не найдена для звонка');
    if (currentStatus === 'on' || currentStatus === 'outgoing') return;

    p2pSession.addCameraStream().then((stream) => {
      if (!stream) {
        return console.error('Поток не нашелся');
      }

      setVideoCallStatus((statusMap) => {
        let newStatus: VideoCallStatus = currentStatus;

        if (currentStatus === 'off') {
          newStatus = 'outgoing';
        }
        if (currentStatus === 'incoming') {
          newStatus = 'on';
          addStartVideoCallMessage(currentPairId);
        }

        return {
          ...statusMap,
          [currentPairId]: newStatus,
        };
      });

      setLocalStream(stream);
    });
  }, [currentPairId, videoCallStatus[currentPairId]]);

  const endVideoCall = useCallback(() => {
    const p2pInstance = p2pInstancesRef.current[currentPairId];
    if (!p2pInstance) {
      return console.error('Сессия не найдена для разрыва звонка');
    }

    p2pInstance.endVideoCall();
  }, [currentPairId]);

  return {
    pairsWithState,
    videoCallStatus,
    wsStatus,
    localStream,
    remoteStream,
    sendText,
    sendFile,
    joinVideoCall,
    endVideoCall,
  };
};
