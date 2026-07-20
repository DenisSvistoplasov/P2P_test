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
import { CallingPhoneIcon } from './components/icons/CallingPhoneIcon';

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
  const [videoCallStatus, setVideoCallStatus] = useState<
    Record<string, VideoCallStatus>
  >({});
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<
    Record<string, number>
  >({});

  const userIdRef = useRef(userId);
  const currentPairIdRef = useRef(currentPairId);
  const p2pInstancesRef = useRef<Record<string, P2pSession>>({});

  const ws = useWsClient();

  const pairIds = useMemo(() => pairs.map((pair) => pair.pairId), [pairs]);
  const currentVideoCallStatus = useMemo(
    () => videoCallStatus[currentPairId] || 'off',
    [videoCallStatus, currentPairId],
  );

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
    if (Object.values(videoCallStatus).includes('incoming')) playIncomingCallRing();
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

  const handleNewMessage = useCallback((pairId: string, message?: Message) => {
    setMessagesMap((prev) => ({
      ...prev,
      [pairId]: message ? [...prev[pairId], message] : prev[pairId] || [],
    }));
    if (message && pairId !== currentPairIdRef.current) {
      setUnreadMessagesCount((prev) => ({
        ...prev,
        [pairId]: prev[pairId] ? prev[pairId] + 1 : 1,
      }));
    }
  }, []);

  const handleVideoCallStatus = useCallback(
    (
      pairId: string,
      setStatus: (prevStatus: VideoCallStatus) => VideoCallStatus,
    ) => {
      setVideoCallStatus((prev) => {
        const prevStatus = prev[pairId] || 'off';
        const newStatus = setStatus(prevStatus);
        if (prevStatus !== 'on' && newStatus === 'on') {
          setMessagesMap((messagesMap) => ({
            ...messagesMap,
            [pairId]: [
              ...messagesMap[pairId],
              { type: 'callInfo', start: true, timestamp: Date.now() },
            ],
          }));
        }
        if (prevStatus !== 'off' && newStatus === 'off') {
          const now = Date.now();
          setMessagesMap((messagesMap) => {
            if (!messagesMap[pairId]?.length) {
              return messagesMap;
            }

            let callStartMessage: CallInfoMessage | undefined;

            for (let i = messagesMap[pairId].length - 1; i >= 0; i--) {
              const message = messagesMap[pairId][i];
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
              [pairId]: [
                ...messagesMap[pairId],
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

        return {
          ...prev,
          [pairId]: newStatus,
        };
      });
    },
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
          handleNewMessage,
          setRemoteStream,
          setLocalStream,
          handleVideoCallStatus,
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
            handleNewMessage,
            setRemoteStream,
            setLocalStream,
            handleVideoCallStatus,
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
          handleNewMessage,
          setP2pChannels,
          setRemoteStream,
          setLocalStream,
          handleVideoCallStatus,
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
        const [, receiverId] = pairId.split('_vs_');
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

  const onPairClick = useCallback((pairId: string) => {
    setCurrentPairId(pairId);
    currentPairIdRef.current = pairId;
    setUnreadMessagesCount((prev) => ({
      ...prev,
      [pairId]: 0,
    }));
  }, []);

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

    setVideoCallStatus((statusMap) => {
      const prevStatus = statusMap[currentPairId] || 'off';
      return {
        ...statusMap,
        [currentPairId]:
          prevStatus === 'off'
            ? 'outgoing'
            : prevStatus === 'incoming'
              ? 'on'
              : prevStatus,
      };
    });

    session.addCameraStream().then((stream) => {
      if (!stream) {
        setVideoCallStatus((statusMap) => {
          const prevStatus = statusMap[currentPairId] || 'off';
          return {
            ...statusMap,
            [currentPairId]:
              prevStatus === 'outgoing'
                ? 'off'
                : prevStatus === 'on'
                  ? 'incoming'
                  : prevStatus,
          };
        });
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100dvh',
        padding: 10,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        {!userId ? (
          <div>Loading...</div>
        ) : (
          <h1 style={{ fontSize: 'calc(13px + 1.5vw)' }}>
            Current user: {userId}
          </h1>
        )}
        <div>WebSocket status: {wsStatus}</div>
      </div>

      {userId && (
        <>
          <div
            style={{
              display: 'flex',
              gap: '5%',
              width: '100%',
              flex: '1 1',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '10%',
                minWidth: 130,
              }}
            >
              <h2 style={{ marginBottom: 10, fontSize: 'calc(12px + 1vw)' }}>
                Users
              </h2>
              {pairIds.length > 0 ? (
                <ul
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    listStyle: 'none',
                    margin: 0,
                    padding: 6,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                  }}
                >
                  {pairIds.map((pairId) => (
                    <li key={pairId}>
                      <button
                        onClick={() => onPairClick(pairId)}
                        style={{
                          position: 'relative',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          height: 40,
                          backgroundColor: ['#ccc', '#cc6', '#5df', '#6f7'][
                            pairsState[pairId]
                          ],
                          cursor:
                            currentPairId === pairId ? 'default' : 'pointer',
                          padding: '10px 20px',
                          width: '100%',
                          borderRadius: 5,
                          border: 'none',
                          boxShadow:
                            currentPairId === pairId
                              ? 'inset 2px 2px 5px rgba(0, 0, 0, 0.2), inset -4px -4px 12px rgba(255, 255, 255, 0.4)'
                              : 'inset -3px -3px 5px rgba(0, 0, 0, 0.2), inset 2px 2px 5px rgba(255, 255, 255, 0.4), 2px 2px 6px rgba(0, 0, 0, 0.2)',
                        }}
                      >
                        {pairId.split('_vs_').find((id) => id !== userId)}

                        {videoCallStatus[pairId] === 'incoming' &&
                        currentPairId !== pairId ? (
                          <div
                            style={{
                              position: 'absolute',
                              top: -3,
                              right: -3,
                            }}
                          >
                            <CallingPhoneIcon />
                          </div>
                        ) : (
                          unreadMessagesCount[pairId] > 0 && (
                            <div
                              style={{
                                position: 'absolute',
                                top: -3,
                                right: -3,
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                width: 20,
                                aspectRatio: 1,
                                backgroundColor: 'red',
                                fontSize: 12,
                                color: 'white',
                                borderRadius: '50%',
                                textShadow: '0 0 2px #00000055',
                              }}
                            >
                              {unreadMessagesCount[pairId]}
                            </div>
                          )
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <span>No users</span>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flexGrow: 1,
                flexShrink: 1,
                overflow: 'hidden',
              }}
            >
              <h2 style={{ marginBottom: 10, fontSize: 'calc(12px + 1vw)' }}>
                Chat
              </h2>
              {currentPairId ? (
                <>
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
                      {currentVideoCallStatus === 'incoming' && (
                        <p>Входящий звонок</p>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          gap: 20,
                          marginBottom: 10,
                          padding: 20,
                        }}
                      >
                        {currentVideoCallStatus === 'off' && (
                          <PhoneButton type="call" onClick={joinVideoCall} />
                        )}
                        {currentVideoCallStatus === 'incoming' && (
                          <PhoneButton type="answer" onClick={joinVideoCall} />
                        )}
                        {currentVideoCallStatus !== 'off' && (
                          <PhoneButton type="hangup" onClick={endVideoCall} />
                        )}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        {currentVideoCallStatus === 'outgoing' &&
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
                              currentVideoCallStatus === 'outgoing' && (
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    width: '49%',
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
                        {remoteStream && currentVideoCallStatus === 'on' && (
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
                </>
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
  handleNewMessage,
  setRemoteStream,
  setLocalStream,
  handleVideoCallStatus,
}: {
  pair: Pair;
  userId: string;
  p2pInstancesRef: React.MutableRefObject<Record<string, P2pSession>>;
  setOffer: (data: SetOfferBody) => void;
  setAnswer: (data: SetAnswerBody) => void;
  setP2pChannels: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  handleNewMessage: (pairId: string, message?: Message) => void;
  setRemoteStream: React.Dispatch<React.SetStateAction<MediaStream | null>>;
  setLocalStream: React.Dispatch<React.SetStateAction<MediaStream | null>>;
  handleVideoCallStatus: (
    pairId: string,
    setStatus: (status: VideoCallStatus) => VideoCallStatus,
  ) => void;
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
          handleVideoCallStatus(pairId, () => 'off');
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
      handleNewMessage(pairId, { type: 'text', text });
    },

    // Ловим уже полностью собранную картинку (готовый blob-url)
    onImageMessage: (url, name, mime, size) => {
      handleNewMessage(pairId, { type: 'image', url, name, mime, size });
    },

    onIncomingStream: (remoteStream) => {
      handleVideoCallStatus(pairId, (status) => {
        console.log('onIncomingStream. prev videoCallStatus: ', status);
        if (status === 'off') {
          return 'incoming';
        }
        if (status === 'outgoing') {
          return 'on';
        }
        return status;
      });

      setRemoteStream(remoteStream);
    },

    onEndVideoCall: () => {
      setLocalStream(null);
      setRemoteStream(null);
      handleVideoCallStatus(pairId, () => 'off');
    },
  });

  // 2. Сохраняем созданную сессию в реф компонента
  p2pInstancesRef.current[pairId] = p2pInstance;

  // 3. Инициализируем пустой массив сообщений для этой пары
  handleNewMessage(pairId);

  return p2pInstance;
}

// TODO: work around statuses (videoCallStatus, p2pChannels)
