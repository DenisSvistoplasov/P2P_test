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
import { initiateP2P } from './initiateP2P';
import { useP2pChatService, VideoCallStatus } from './useP2pChatService';
import { generateUserId } from './utils/utils';

export const Initializer = () => {
  const userId = localStorage.getItem('userId') || generateUserId();

  const [currentPairId, setCurrentPairId] = useState<string>('');
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>({});
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<
    Record<string, number>
  >({});
  const [videoCallFullscreen, setVideoCallFullscreen] = useState<
    'off' | 'local' | 'remote'
  >('off');

  const currentPairIdRef = useRef(currentPairId);

  const handleNewMessage = useCallback((pairId: string, message: Message) => {
    setMessagesMap((prev) => ({
      ...prev,
      [pairId]: [...(prev[pairId] || []), message],
    }));

    if (message && pairId !== currentPairIdRef.current) {
      setUnreadMessagesCount((prev) => ({
        ...prev,
        [pairId]: prev[pairId] ? prev[pairId] + 1 : 1,
      }));
    }
  }, []);

  const {
    wsStatus,
    pairsWithState,
    videoCallStatus,
    localStream,
    remoteStream,
    sendText,
    sendFile,
    joinVideoCall,
    endVideoCall,
  } = useP2pChatService({
    userId,
    currentPairId,
    handleNewMessage,
  });

  const currentPairStatus = useMemo(
    () => pairsWithState.find((pair) => pair.pairId === currentPairId)?.state,
    [pairsWithState, currentPairId],
  );

  //
  useEffect(() => {
    if (videoCallFullscreen !== 'off' && videoCallStatus[1] === 'off') {
      setVideoCallFullscreen('off');
    }
  }, [videoCallStatus]);
  //

  useEffect(() => {
    localStorage.setItem('userId', userId);
  }, []);

  const pairIds = useMemo(
    () => pairsWithState.map((pair) => pair.pairId),
    [pairsWithState],
  );

  const currentVideoCallStatus = useMemo(
    () => videoCallStatus[currentPairId] || 'off',
    [videoCallStatus, currentPairId],
  );

  const onPairClick = useCallback((pairId: string) => {
    setCurrentPairId(pairId);
    currentPairIdRef.current = pairId;
    setUnreadMessagesCount((prev) => ({
      ...prev,
      [pairId]: 0,
    }));
  }, []);

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
                  {pairsWithState.map(({ pairId, state }) => (
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
                            state
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
                    connected={currentPairStatus === 3}
                    messages={messagesMap[currentPairId]||[]}
                    sendText={sendText}
                    sendFile={sendFile}
                  />

                  {currentPairStatus === 3 && (
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
                          <PhoneButton
                            type="hangup"
                            onClick={endVideoCall}
                            style={{
                              ...(videoCallFullscreen !== 'off' && {
                                position: 'fixed',
                                bottom: 20,
                                right: 20,
                                zIndex: 999,
                                boxShadow: '0 0 8px rgba(0, 0, 0, 0.7)',
                              }),
                            }}
                          />
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
                              <VideoPlayer
                                stream={localStream}
                                muted
                                position={
                                  videoCallFullscreen === 'off'
                                    ? 'normal'
                                    : videoCallFullscreen === 'local'
                                      ? 'fullscreen'
                                      : 'corner'
                                }
                                toggleFullScreen={() =>
                                  setVideoCallFullscreen((prev) =>
                                    prev === 'local' ? 'off' : 'local',
                                  )
                                }
                              />
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
                            <VideoPlayer
                              stream={remoteStream}
                              position={
                                videoCallFullscreen === 'off'
                                  ? 'normal'
                                  : videoCallFullscreen === 'remote'
                                    ? 'fullscreen'
                                    : 'corner'
                              }
                              toggleFullScreen={() =>
                                setVideoCallFullscreen((prev) =>
                                  prev === 'remote' ? 'off' : 'remote',
                                )
                              }
                            />
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
