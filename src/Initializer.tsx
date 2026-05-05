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

type FileMeta = {
  name: string;
  mime: string;
  totalChunks: number;
  chunks: ArrayBuffer[];
  size: number; // bytes
};

type PairState = 0 | 1 | 2 | 3;

const CHUNK_SIZE = 16384; // 16 КБ

export const Initializer = () => {
  const isInitializingRef = useRef(false);
  const [userId, setUserId] = useState<string>('');
  const [pairs, setPairs] = useState<Pair[]>([]);
  const p2pInstancesRef = useRef<Record<string, P2P>>({}); // pairId : p2p-instance
  const [p2pChannels, setP2pChannels] = useState<
    Record<string, RTCDataChannel>
  >({}); // pairId : channel
  const [currentPairId, setCurrentPairId] = useState<string>('');
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>({}); // pairId : Message[]
  console.log('messagesMap: ', messagesMap);
  const filesMetaMapRef = useRef<Record<string, FileMeta>>({}); // pairId : FIleMeta

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

  // Initial
  useEffect(() => {
    if (isInitializingRef.current) return;

    isInitializingRef.current = true;

    const localUserId = localStorage.getItem('userId') || '';

    Server.getInitial(localUserId).then((data) => {
      const userId = data.yourId;
      setUserId(userId);
      localStorage.setItem('userId', data.yourId);

      data.pairs.forEach((pair) => {
        setPairs((pairs) => [...pairs, pair]);

        // New pair -> new p2p instance
        const p2pInstance = new P2P();
        p2pInstancesRef.current[pair.pairId] = p2pInstance;
        p2pInstance.channelPromise.then((channel) => {
          setP2pChannels((p2pChannels) => ({
            ...p2pChannels,
            [pair.pairId]: channel,
          }));
          channel.onmessage = (event) => {
            if (typeof event.data === 'string') {
              const message = JSON.parse(event.data) as P2pMessage;
              if (message.type === 'text') {
                setMessagesMap((messagesMap) => {
                  const messages = messagesMap[pair.pairId] || [];
                  return {
                    ...messagesMap,
                    [pair.pairId]: [...messages, message],
                  };
                });
              } else {
                // meta
                filesMetaMapRef.current[pair.pairId] = {
                  ...message,
                  chunks: [],
                };
              }
            } else if (event.data instanceof ArrayBuffer) {
              // arrayBuffer
              const meta = filesMetaMapRef.current[pair.pairId];
              if (!meta) return console.error('no meta');

              // Добавляем пришедшие данные
              meta.chunks.push(event.data);

              // Если собрали все чанки
              if (meta.chunks.length === meta.totalChunks) {
                const fullBuffer = concatenateBuffers(meta.chunks);
                const blob = new Blob([fullBuffer], {
                  type: meta.mime,
                });
                const url = URL.createObjectURL(blob);

                setMessagesMap((messagesMap) => {
                  const messages = messagesMap[pair.pairId] || [];
                  return {
                    ...messagesMap,
                    [pair.pairId]: [
                      ...messages,
                      {
                        type: 'image',
                        name: meta.name,
                        mime: meta.mime,
                        url,
                        size: meta.size
                      },
                    ],
                  };
                });
              }
            }
          };
          channel.onclose = () => {
            alert('Connection closed');
            delete p2pInstancesRef.current[pair.pairId];
            delete p2pChannels[pair.pairId];
          };
        });

        // Initialize messages array
        setMessagesMap((messagesMap) => ({
          ...messagesMap,
          [pair.pairId]: [],
        }));

        // Create offer
        if (userId === pair.senderId) {
          p2pInstance.createOffer().then((offer) => {
            if (!offer) return console.error('offer not created');

            Server.setOffer({
              userId,
              partnerId: pair.receiverId,
              offer,
            });
          });
        }
      });
    });
  }, []);

  // Listening
  useEffect(() => {
    if (userId) {
      Server.listenPairs(userId, (pairChanges) => {
        pairChanges.added?.forEach((pair) => {
          setPairs((pairs) => [...pairs, pair]);

          // New pair -> new p2p instance
          const p2pInstance = new P2P();
          p2pInstancesRef.current[pair.pairId] = p2pInstance;
          p2pInstance.channelPromise.then((channel) => {
            setP2pChannels((p2pChannels) => ({
              ...p2pChannels,
              [pair.pairId]: channel,
            }));
            channel.onmessage = (event) => {
              if (typeof event.data === 'string') {
                const message = JSON.parse(event.data) as P2pMessage;
                if (message.type === 'text') {
                  setMessagesMap((messagesMap) => {
                    const messages = messagesMap[pair.pairId] || [];
                    return {
                      ...messagesMap,
                      [pair.pairId]: [...messages, message],
                    };
                  });
                } else {
                  // meta
                  filesMetaMapRef.current[pair.pairId] = {
                    ...message,
                    chunks: [],
                  };
                }
              } else if (event.data instanceof ArrayBuffer) {
                // arrayBuffer
                const meta = filesMetaMapRef.current[pair.pairId];
                if (!meta) return console.error('no meta');

                // Добавляем пришедшие данные
                meta.chunks.push(event.data);

                // Если собрали все чанки
                if (meta.chunks.length === meta.totalChunks) {
                  const fullBuffer = concatenateBuffers(meta.chunks);
                  const blob = new Blob([fullBuffer], {
                    type: meta.mime,
                  });
                  const url = URL.createObjectURL(blob);

                  setMessagesMap((messagesMap) => {
                    const messages = messagesMap[pair.pairId] || [];
                    return {
                      ...messagesMap,
                      [pair.pairId]: [
                        ...messages,
                        {
                          type: 'image',
                          name: meta.name,
                          mime: meta.mime,
                          url,
                          size: meta.size
                        },
                      ],
                    };
                  });
                }
              }
            };
            channel.onclose = () => {
              alert('Connection closed');
              delete p2pInstancesRef.current[pair.pairId];
              delete p2pChannels[pair.pairId];
            };
          });

          // Initialize messages array
          setMessagesMap((messagesMap) => ({
            ...messagesMap,
            [pair.pairId]: [],
          }));

          // Create offer
          if (userId === pair.senderId) {
            p2pInstance.createOffer().then((offer) => {
              if (!offer) return console.error('offer not created');

              Server.setOffer({
                userId,
                partnerId: pair.receiverId,
                offer,
              });
            });
          }
        });

        pairChanges.modified?.forEach((pair) => {
          setPairs((pairs) =>
            pairs.map((p) => (p.pairId === pair.pairId ? pair : p)),
          );

          // Create offer
          if (userId === pair.senderId && !pair.offer) {
            // New pair -> new p2p instance
            const p2pInstance = new P2P();
            p2pInstancesRef.current[pair.pairId] = p2pInstance;
            setP2pChannels((p2pChannels) => {
              const p2pChannelsCopy = { ...p2pChannels };
              delete p2pChannelsCopy[pair.pairId];
              return p2pChannelsCopy;
            });
            p2pInstance.channelPromise.then((channel) => {
              setP2pChannels((p2pChannels) => ({
                ...p2pChannels,
                [pair.pairId]: channel,
              }));
              channel.onmessage = (event) => {
                if (typeof event.data === 'string') {
                  const message = JSON.parse(event.data) as P2pMessage;
                  if (message.type === 'text') {
                    setMessagesMap((messagesMap) => {
                      const messages = messagesMap[pair.pairId] || [];
                      return {
                        ...messagesMap,
                        [pair.pairId]: [...messages, message],
                      };
                    });
                  } else {
                    // meta
                    filesMetaMapRef.current[pair.pairId] = {
                      ...message,
                      chunks: [],
                    };
                  }
                } else if (event.data instanceof ArrayBuffer) {
                  // arrayBuffer
                  const meta = filesMetaMapRef.current[pair.pairId];
                  if (!meta) return console.error('no meta');

                  // Добавляем пришедшие данные
                  meta.chunks.push(event.data);

                  // Если собрали все чанки
                  if (meta.chunks.length === meta.totalChunks) {
                    const fullBuffer = concatenateBuffers(meta.chunks);
                    const blob = new Blob([fullBuffer], {
                      type: meta.mime,
                    });
                    const url = URL.createObjectURL(blob);

                    setMessagesMap((messagesMap) => {
                      const messages = messagesMap[pair.pairId] || [];
                      return {
                        ...messagesMap,
                        [pair.pairId]: [
                          ...messages,
                          {
                            type: 'image',
                            name: meta.name,
                            mime: meta.mime,
                            url,
                            size: meta.size
                          },
                        ],
                      };
                    });
                  }
                }
              };
              channel.onclose = () => {
                alert('Connection closed');
                delete p2pInstancesRef.current[pair.pairId];
                delete p2pChannels[pair.pairId];
              };
            });

            p2pInstance.createOffer().then((offer) => {
              if (!offer) return console.error('offer not created');

              Server.setOffer({
                userId,
                partnerId: pair.receiverId,
                offer,
              });
            });
          }

          const p2pInstance = p2pInstancesRef.current[pair.pairId];

          if (!p2pInstance)
            return console.error(
              'p2pInstance not found for modified pair',
              pair.pairId,
            );

          // Create answer
          if (userId === pair.receiverId && pair.offer && !pair.answer) {
            p2pInstance.createAnswer(pair.offer).then((answer) => {
              if (!answer) return console.error('answer not created');

              Server.setAnswer({
                userId,
                partnerId: pair.senderId,
                answer,
              });
            });
          }

          // Apply answer
          if (userId === pair.senderId && pair.answer) {
            p2pInstance.applyAnswer(pair.answer);
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

          delete p2pInstancesRef.current[pairId];
        });
      });

      // const exit = () => Server.exit(userId);
      // window.addEventListener('beforeunload', exit);
      // return () => {
      //   window.removeEventListener('beforeunload', exit);
      // };
    }
  }, [userId]);

  const send = useCallback(
    (data: string | File) => {
      // Text
      if (typeof data === 'string') {
        p2pChannels[currentPairId]?.send(
          JSON.stringify({ type: 'text', text: data }),
        );

        setMessagesMap((messagesMap) => {
          const messages = messagesMap[currentPairId] || [];
          return {
            ...messagesMap,
            [currentPairId]: [
              ...messages,
              { type: 'text', text: data, isOwner: true },
            ],
          };
        });
      }

      // File
      else {
        const reader = new FileReader();
        reader.onload = () => {
          const buffer = reader.result as ArrayBuffer;
          const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);

          // 1. Отправляем метаданные (строку)
          p2pChannels[currentPairId]?.send(
            JSON.stringify({
              type: 'meta',
              name: data.name,
              mime: data.type,
              totalChunks: totalChunks,
              size: data.size
            } as P2pImageMessage)
          );

          // 2. Отправляем чанки (бинарные)
          for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, buffer.byteLength);
            const chunk = buffer.slice(start, end);
            p2pChannels[currentPairId]?.send(chunk);
          }
        };
        reader.readAsArrayBuffer(data);

        setMessagesMap((messagesMap) => {
          const messages = messagesMap[currentPairId] || [];
          return {
            ...messagesMap,
            [currentPairId]: [
              ...messages,
              {
                type: 'image',
                name: data.name,
                mime: data.type,
                url: URL.createObjectURL(data),
                size: data.size,
                isOwner: true,
              },
            ],
          };
        });
      }
    },
    [currentPairId, p2pChannels],
  );

  if (!userId) return <div>Loading...</div>;

  return (
    <div>
      <h1>Current user: {userId}</h1>

      <div style={{ display: 'flex' }}>
        <div>
          <h2>Users</h2>
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
        </div>

        <div>
          <h2>Chat</h2>
          {currentPairId ? (
            <Chat
              interlocutorId={
                currentPairId.split('_vs_').find((id) => id != userId)!
              }
              connected={pairsState[currentPairId] === 3}
              messages={messagesMap[currentPairId]}
              send={send}
            />
          ) : (
            <span>Select pair</span>
          )}
        </div>
      </div>
    </div>
  );
};
