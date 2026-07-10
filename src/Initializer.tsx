import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pair, SetAnswerBody, SetOfferBody } from './api/types';
import { CallInfoMessage, Chat, Message } from './Chat';
import { P2pSession } from './api/simplePeer';
import { VideoPlayer } from './components/VideoPlayer';
import { P2pWsClient } from './server/p2p_ws';
import { WsStatus } from './server/webSocket';
import { PhoneButton } from './components/PhoneButton';
import { usePlayIncomingCallRing } from './hooks/usePlayIncomingCallRing';
import { useWsClient } from './hooks/useWsClient';

type PairState = 0 | 1 | 2 | 3;
type VideoCallStatus = 'off' | 'incoming' | 'outgoing' | 'on';

export const Initializer = () => {
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected');
  const [userId, setUserId] = useState<string>('');
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [p2pChannels, setP2pChannels] = useState<Record<string, boolean>>({});
  const [currentPairId, setCurrentPairId] = useState<string>('');
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>({}); // pairId : Message[]
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [videoCallStatus, setVideoCallStatus] =
    useState<VideoCallStatus>('off');

  const userIdRef = useRef(userId);
  const wsRef = useRef<P2pWsClient | null>(null);
  const p2pInstancesRef = useRef<Record<string, P2pSession>>({});

  const ws = useWsClient();

  const pairIds = useMemo(() => pairs.map((pair) => pair.pairId), [pairs]);

  const pairsState = useMemo(() => {
    const map: Record<string, PairState> = {};
    pairs.forEach((pair) => {
      if (p2pChannels[pair.pairId]) return (map[pair.pairId] = 3);
      if (pair.answer) return (map[pair.pairId] = 2);
      if (pair.offer) return (map[pair.pairId] = 1);
      map[pair.pairId] = 0;
    });
    return map;
  }, [pairs, p2pChannels]);

  const [playIncomingCallRing, stopIncomingCallRing] =
    usePlayIncomingCallRing();

  useEffect(() => {
    if (videoCallStatus === 'incoming') playIncomingCallRing();
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

  useEffect(() => {
    Object.entries(pairsState).forEach(([pairId, state]) => {
      if (state == 2 && !p2pInstancesRef.current[pairId]) {
        console.log('P2P reconnection', pairId);
        initiateP2P({
          p2pInstancesRef,
          pair: pairs.find((pair) => pair.pairId === pairId)!,
          userId: userIdRef.current,
          setOffer,
          setAnswer,
          setP2pChannels,
          setMessagesMap,
          setRemoteStream,
          setLocalStream,
          setVideoCallStatus,
        });
      }
    });
  }, [pairsState, pairs]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    ws.onMessage((message) => {
      if (message.type === 'initial') {
        const { yourId, pairs } = message.payload;
        localStorage.setItem('userId', yourId);
        userIdRef.current = yourId;
        setUserId(yourId);
        setPairs(pairs);

        pairs.forEach((pair) => {
          initiateP2P({
            p2pInstancesRef,
            pair,
            userId: yourId,
            setOffer,
            setAnswer,
            setP2pChannels,
            setMessagesMap,
            setRemoteStream,
            setLocalStream,
            setVideoCallStatus,
          });
        });
      }

      if (message.type === 'putPair') {
        const pair = message.payload;
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
        initiateP2P({
          pair,
          userId: userIdRef.current,
          setOffer,
          setAnswer,
          p2pInstancesRef,
          setMessagesMap,
          setP2pChannels,
          setRemoteStream,
          setLocalStream,
          setVideoCallStatus,
        });
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
        const [senderId, receiverId] = pairId.split('_vs_');
        if (userIdRef.current === receiverId) {
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
        if (userIdRef.current === senderId) {
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

    const localUserId = localStorage.getItem('userId') || generateUserId();
    ws.send({ type: 'initial', payload: { userId: localUserId } });

    return () => ws.disconnect();
  }, []);

  useEffect(() => {
    if (videoCallStatus === 'on') {
      setMessagesMap((messagesMap) => ({
        ...messagesMap,
        [currentPairId]: [
          ...messagesMap[currentPairId],
          { type: 'callInfo', start: true, timestamp: Date.now() },
        ],
      }));
    }
    if (videoCallStatus === 'off') {
      const now = Date.now();
      setMessagesMap((messagesMap) => {
        if (!messagesMap[currentPairId]?.length) {
          return messagesMap;
        }

        let callStartMessage: CallInfoMessage | undefined;

        for (let i = messagesMap[currentPairId].length - 1; i >= 0; i--) {
          const message = messagesMap[currentPairId][i];
          if (message.type === 'callInfo') {
            if (message.start) callStartMessage = message;
            break;
          }
        }

        if (!callStartMessage) {
          return messagesMap;
        }

        return {
          ...messagesMap,
          [currentPairId]: [
            ...messagesMap[currentPairId],
            {
              type: 'callInfo',
              start: false,
              timestamp: now,
              duration: now - callStartMessage.timestamp,
            },
          ],
        };
      });
    }
  }, [videoCallStatus, currentPairId]);

  const sendText = useCallback(
    (text: string) => {
      const session = p2pInstancesRef.current[currentPairId];
      if (!session)
        return console.error('Сессия не найдена для', currentPairId);

      // Отправляем через P2P-класс
      session.sendText(text);

      // Сразу отображаем в своем UI чата
      setMessagesMap((messagesMap) => {
        const messages = messagesMap[currentPairId] || [];
        return {
          ...messagesMap,
          [currentPairId]: [...messages, { type: 'text', text, isOwner: true }],
        };
      });
    },
    [currentPairId],
  );

  const sendFile = useCallback(
    (file: File) => {
      const session = p2pInstancesRef.current[currentPairId];
      if (!session)
        return console.error('Сессия не найдена для', currentPairId);

      session.sendImage(file);

      setMessagesMap((messagesMap) => {
        const messages = messagesMap[currentPairId] || [];
        return {
          ...messagesMap,
          [currentPairId]: [
            ...messages,
            {
              type: 'image',
              name: file.name,
              mime: file.type,
              url: URL.createObjectURL(file),
              size: file.size,
              isOwner: true,
            },
          ],
        };
      });
    },
    [currentPairId],
  );

  const joinVideoCall = useCallback(async () => {
    const session = p2pInstancesRef.current[currentPairId];

    if (!session) return console.error('Сессия не найдена для звонка');

    setVideoCallStatus((status) =>
      status === 'off' ? 'outgoing' : status === 'incoming' ? 'on' : status,
    );

    session.addCameraStream().then((stream) => {
      if (!stream) {
        setVideoCallStatus((status) =>
          status === 'outgoing' ? 'off' : status === 'on' ? 'incoming' : status,
        );
        return console.error('Поток не нашелся');
      }

      setLocalStream(stream);
    });
  }, [currentPairId]);

  const endVideoCall = useCallback(() => {
    const p2pInstance = p2pInstancesRef.current[currentPairId];
    if (!p2pInstance) {
      return console.error('Сессия не найдена для разрыва звонка');
    }

    p2pInstance.endVideoCall();
  }, [localStream, currentPairId]);

  return (
    <div>
      <div>WebSocket status: {wsStatus}</div>

      {!userId ? (
        <div>Loading...</div>
      ) : (
        <>
          <h1>Current user: {userId}</h1>
          <div style={{ display: 'flex', gap: '5%', width: '100%' }}>
            <div style={{ width: '10%', minWidth: 100 }}>
              <h2>Users</h2>
              {pairIds.length > 0 ? (
                <ul
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                  }}
                >
                  {pairIds.map((pairId) => (
                    <li key={pairId}>
                      <button
                        onClick={() => setCurrentPairId(pairId)}
                        style={{
                          backgroundColor: ['#ccc', '#cc6', '#5df', '#6f7'][
                            pairsState[pairId]
                          ],
                          cursor: 'pointer',
                          padding: 10,
                          width: '100%',
                          borderRadius: 5,
                          border: 'none',
                          boxShadow: 'inset -2px -2px 5px rgba(0, 0, 0, 0.2)',
                        }}
                      >
                        {pairId.split('_vs_').find((id) => id !== userId)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <span>No users</span>
              )}
            </div>

            <div style={{ flexGrow: 1, flexShrink: 1, overflow: 'hidden' }}>
              <h2>Chat</h2>
              {currentPairId ? (
                <div>
                  <Chat
                    interlocutorId={
                      currentPairId.split('_vs_').find((id) => id != userId)!
                    }
                    connected={pairsState[currentPairId] === 3}
                    messages={messagesMap[currentPairId]}
                    sendText={sendText}
                    sendFile={sendFile}
                  />
                  {pairsState[currentPairId] === 3 && (
                    <div>
                      {videoCallStatus === 'incoming' && <p>Входящий звонок</p>}
                      <div
                        style={{ display: 'flex', gap: 10, marginBottom: 10 }}
                      >
                        {videoCallStatus === 'off' && (
                          <PhoneButton type="call" onClick={joinVideoCall} />
                        )}
                        {videoCallStatus === 'incoming' && (
                          <PhoneButton type="answer" onClick={joinVideoCall} />
                        )}
                        {videoCallStatus !== 'off' && (
                          <PhoneButton type="hangup" onClick={endVideoCall} />
                        )}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        {videoCallStatus === 'outgoing' &&
                          !localStream &&
                          !remoteStream && (
                            <p
                              style={{
                                margin: '0 0 5px 0',
                                fontSize: 14,
                              }}
                            >
                              Исходящий звонок...
                            </p>
                          )}
                        {localStream && (
                          <>
                            <div style={{ width: '49%' }}>
                              <p style={{ margin: '0 0 5px 0', fontSize: 14 }}>
                                Вы
                              </p>
                              <VideoPlayer stream={localStream} muted />
                            </div>

                            {!remoteStream &&
                              videoCallStatus === 'outgoing' && (
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                  }}
                                >
                                  <p
                                    style={{
                                      margin: '0 0 5px 0',
                                      fontSize: 14,
                                    }}
                                  >
                                    Ожидайте ответа собеседника...
                                  </p>
                                </div>
                              )}
                          </>
                        )}
                        {remoteStream && videoCallStatus === 'on' && (
                          <div style={{ width: '49%' }}>
                            <p style={{ margin: '0 0 5px 0', fontSize: 14 }}>
                              Собеседник
                            </p>
                            <VideoPlayer stream={remoteStream} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                pairIds.length > 0 && <span>Select user</span>
              )}
            </div>
          </div>{' '}
        </>
      )}
    </div>
  );
};

function generateUserId() {
  return (
    'user-' +
    Math.floor(Math.random() * 10) +
    Math.floor(Math.random() * 26 + 10).toString(36)
  );
}

function initiateP2P({
  pair,
  userId,
  p2pInstancesRef,
  setOffer,
  setAnswer,
  setP2pChannels,
  setMessagesMap,
  setRemoteStream,
  setLocalStream,
  setVideoCallStatus,
}: {
  pair: Pair;
  userId: string;
  p2pInstancesRef: React.MutableRefObject<Record<string, P2pSession>>;
  setOffer: (data: SetOfferBody) => void;
  setAnswer: (data: SetAnswerBody) => void;
  setP2pChannels: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setMessagesMap: React.Dispatch<
    React.SetStateAction<Record<string, Message[]>>
  >;
  setRemoteStream: React.Dispatch<React.SetStateAction<MediaStream | null>>;
  setLocalStream: React.Dispatch<React.SetStateAction<MediaStream | null>>;
  setVideoCallStatus: React.Dispatch<React.SetStateAction<VideoCallStatus>>;
}) {
  const pairId = pair.pairId;
  const isInitiator = userId === pair.senderId;
  console.log('InitiateP2P. I am initiator:', isInitiator);

  // 1. Создаем сессию. Передаем флаг инициатора.
  const p2pInstance = new P2pSession({
    initiator: isInitiator,

    // Ловим сгенерированный оффер/ансер и отправляем на бэкенд
    onSignal: (signalData) => {
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

    // Переключаем статус (true/false) в стейте, чтобы ваш pairsState стал равен 3
    onStatusChange: (isConnected) => {
      setP2pChannels((prev) => {
        const next = { ...prev };
        if (isConnected) {
          console.log('p2p connected');
          next[pairId] = true;
        } else {
          console.log('p2p disconnected');
          setLocalStream(null);
          setRemoteStream(null);
          setVideoCallStatus('off');
          delete next[pairId];
        }
        return next;
      });
      if (!isConnected) {
        delete p2pInstancesRef.current[pairId];
      }
    },

    // Ловим чистый текст от собеседника и пушим в стейт сообщений
    onTextMessage: (text) => {
      setMessagesMap((prev) => ({
        ...prev,
        [pairId]: [...(prev[pairId] || []), { type: 'text', text }],
      }));
    },

    // Ловим уже полностью собранную картинку (готовый blob-url)
    onImageMessage: (url, name, mime, size) => {
      setMessagesMap((prev) => ({
        ...prev,
        [pairId]: [
          ...(prev[pairId] || []),
          { type: 'image', url, name, mime, size },
        ],
      }));
    },

    onIncomingStream: (remoteStream) => {
      setVideoCallStatus((videoCallStatus) => {
        console.log('onIncomingStream. videoCallStatus: ', videoCallStatus);
        if (videoCallStatus === 'off') {
          return 'incoming';
        }
        if (videoCallStatus === 'outgoing') {
          return 'on';
        }
        return videoCallStatus;
      });

      setRemoteStream(remoteStream);
    },

    onEndVideoCall: () => {
      setLocalStream(null);
      setRemoteStream(null);
      setVideoCallStatus('off');
    },
  });

  // 2. Сохраняем созданную сессию в реф компонента
  p2pInstancesRef.current[pairId] = p2pInstance;

  // 3. Инициализируем пустой массив сообщений для этой пары
  setMessagesMap((messagesMap) => ({
    ...messagesMap,
    [pairId]: messagesMap[pairId] || [],
  }));

  return p2pInstance;
}

// TODO: work around statuses (videoCallStatus, p2pChannels)
