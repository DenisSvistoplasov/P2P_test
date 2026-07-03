import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Server } from './api/server';
import { Pair } from './api/types';
import { P2P } from './api/p2p copy';
import { Chat, Message } from './Chat';
import { concatenateBuffers } from './utils';
import { P2pSession } from './api/simplePeer';
import { VideoPlayer } from './api/VideoPlayer';

export type P2pTextMessage = {
  type: 'text';
  text: string;
};
export type P2pImageMessage = {
  type: 'meta';
  name: string;
  mime: string;
  totalChunks: number;
  size: number; // bytes
};
export type P2pMessage = P2pTextMessage | P2pImageMessage;

type PairState = 0 | 1 | 2 | 3;

export const Initializer = () => {
  const isInitializedRef = useRef(false);
  const [userId, setUserId] = useState<string>('');
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [p2pChannels, setP2pChannels] = useState<Record<string, boolean>>({});
  const [currentPairId, setCurrentPairId] = useState<string>('');
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>({}); // pairId : Message[]
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const p2pInstancesRef = useRef<Record<string, P2pSession>>({});

  console.log('messagesMap: ', messagesMap);

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

  useEffect(() => {
    // @ts-ignore
    window.pairs = pairs;
  }, [pairs]);

  // Initial
  useEffect(() => {
    if (isInitializedRef.current) return;

    isInitializedRef.current = true;

    const localUserId = localStorage.getItem('userId') || generateUserId();

    Server.getInitial(localUserId).then((data) => {
      const userId = data.yourId;
      setUserId(userId);
      localStorage.setItem('userId', data.yourId);

      setPairs(data.pairs);

      data.pairs.forEach((pair) => {
        console.log('initial initiateP2P');
        initiateP2P({
          p2pInstancesRef,
          pair,
          userId,
          setP2pChannels,
          setMessagesMap,
          setRemoteStream,
          setLocalStream,
        });
      });
    });
  }, []);

  // Listening
  useEffect(() => {
    if (userId) {
      Server.listenPairs(userId, (pairChanges) => {
        // ADDED
        pairChanges.added?.forEach((pair) => {
          setPairs((pairs) => [...pairs, pair]);

          // New pair -> new p2p instance
          console.log('initiateP2P on added');
          initiateP2P({
            pair,
            userId,
            p2pInstancesRef,
            setMessagesMap,
            setP2pChannels,
            setRemoteStream,
            setLocalStream,
          });
        });

        pairChanges.modified?.forEach((modifiedPair) => {
          setPairs((pairs) => {
            let doesExist = false;
            const newPairs = pairs.map((p) => {
              if (p.pairId === modifiedPair.pairId) {
                doesExist = true;
                return modifiedPair;
              }
              return p;
            });
            if (!doesExist) newPairs.push(modifiedPair);
            return newPairs;
          });

          // Create offer
          if (userId === modifiedPair.senderId && !modifiedPair.offer) {
            console.log('Triggering createOffer');
            initiateP2P({
              pair: modifiedPair,
              userId,
              p2pInstancesRef,
              setMessagesMap,
              setP2pChannels,
              setRemoteStream,
              setLocalStream,
            });
          }

          if (!p2pInstancesRef.current[modifiedPair.pairId]) {
            console.warn('There is no instance on modified!!!');
          }

          const p2pInstance =
            p2pInstancesRef.current[modifiedPair.pairId] ||
            (console.log('initiateP2P !!!'),
            initiateP2P({
              pair: modifiedPair,
              userId,
              p2pInstancesRef,
              setMessagesMap,
              setP2pChannels,
              setRemoteStream,
              setLocalStream,
            }));

          // Create answer
          if (
            userId === modifiedPair.receiverId &&
            modifiedPair.offer &&
            !modifiedPair.answer
          ) {
            console.log('Triggering createAnswer');
            p2pInstance.applySignal(modifiedPair.offer);
          }

          // Apply answer
          if (userId === modifiedPair.senderId && modifiedPair.answer) {
            p2pInstance.applySignal(modifiedPair.answer);
          }
        });

        pairChanges.removed?.forEach((pairId) => {
          setPairs((pairs) => pairs.filter((p) => p.pairId !== pairId));

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
        });
      });
    }
  }, [userId]);

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

      // Передаем файл целиком, P2pSession сам разберется с нарезкой
      session.sendImage(file);

      // Сразу отображаем картинку у себя, используя локальный URL
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

  const startVideoCall = useCallback(async () => {
    const session = p2pInstancesRef.current[currentPairId];
    if (!session) return console.error('Сессия не найдена для звонка');

    try {
      // 1. Запрашиваем доступ к камере и микрофону в браузере
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      // 2. Сохраняем свой поток в стейт, чтобы видеть себя на экране
      setLocalStream(stream);

      // 3. Добавляем поток в P2P-сессию.
      // Это автоматически занулит answer на сервере и запустит пересогласование!
      session.addCameraStream(stream);
    } catch (err) {
      console.error('Ошибка доступа к камере или микрофону:', err);
    }
  }, [currentPairId]);

  // B-side: Join incoming video call
  const joinVideoCall = useCallback(async () => {
    const session = p2pInstancesRef.current[currentPairId];
    if (!session)
      return console.error('Сессия не найдена для присоединения к звонку');

    try {
      // 1. Запрашиваем доступ к камере и микрофону
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      // 2. Сохраняем свой поток в стейт
      setLocalStream(stream);

      // 3. Добавляем поток в P2P-сессию - это запустит ренеготиацию
      // и отправит новый answer на сервер
      session.addCameraStream(stream);
    } catch (err) {
      console.error('Ошибка доступа к камере или микрофону:', err);
    }
  }, [currentPairId]);

  if (!userId) return <div>Loading...</div>;

  return (
    <div>
      <h1>Current user: {userId}</h1>

      <div style={{ display: 'flex', gap: 50 }}>
        <div>
          <h2>Users</h2>
          {pairIds.length > 0 ? (
            <ul style={{ listStyle: 'none', width: 200 }}>
              {pairIds.map((pairId) => (
                <li key={pairId}>
                  <button
                    onClick={() => setCurrentPairId(pairId)}
                    style={{
                      backgroundColor: ['#ccc', '#cc6', '#5df', '#6f7'][
                        pairsState[pairId]
                      ],
                      cursor: 'pointer',
                    }}
                  >
                    {pairId + ' State: ' + pairsState[pairId]}
                  </button>
                </li>
              ))}
            </ul>
          ) : isInitializedRef.current ? (
            <span>No users</span>
          ) : (
            <span>Loading...</span>
          )}
        </div>

        <div>
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
                  {!localStream && !remoteStream && <button onClick={startVideoCall}>Start video call</button>}
                  {remoteStream && !localStream && <button onClick={joinVideoCall}>Join video call</button>} 

                  <div style={{ display: 'flex', gap: 20 }}>
                    {localStream && (
                      <div>
                        <p style={{ margin: '0 0 5px 0', fontSize: 14 }}>Вы</p>
                        <VideoPlayer stream={localStream} muted />
                      </div>
                    )}
                    {remoteStream && (
                      <div>
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
            pairIds.length > 0 && <span>Select pair</span>
          )}
        </div>
      </div>
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
  setP2pChannels,
  setMessagesMap,
  setRemoteStream,
  setLocalStream,
}: {
  pair: Pair;
  userId: string;
  p2pInstancesRef: React.MutableRefObject<Record<string, P2pSession>>;
  setP2pChannels: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setMessagesMap: React.Dispatch<
    React.SetStateAction<Record<string, Message[]>>
  >;
  setRemoteStream: React.Dispatch<React.SetStateAction<MediaStream | null>>;
  setLocalStream: React.Dispatch<React.SetStateAction<MediaStream | null>>;
}) {
  const pairId = pair.pairId;
  const isInitiator = userId === pair.senderId;

  // 1. Создаем сессию. Передаем флаг инициатора.
  const p2pInstance = new P2pSession({
    initiator: isInitiator,

    // Ловим сгенерированный оффер/ансер и отправляем на бэкенд
    onSignal: (signalData) => {
      console.log('signalData: ', signalData);
      console.log('isInitiator: ', isInitiator);
      if (isInitiator) {
        Server.setOffer({
          userId,
          partnerId: pair.receiverId,
          offer: signalData,
        });
      }
      if (!isInitiator) {
        Server.setAnswer({
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
          next[pairId] = true;
        } else {
          console.log('Disconnected');
          delete next[pairId];
        }
        return next;
      });
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
      setRemoteStream(remoteStream);
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
