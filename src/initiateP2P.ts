import { SignalData } from '@workadventure/simple-peer';
import { P2pSession } from './api/simplePeer';
import { Pair, SetOfferBody, SetAnswerBody } from './api/types';
import { Message } from './Chat';

export function initiateP2P({
  pair,
  userId,
  initiator,
  onSignal,
  onStatusChange,
  onTextMessage,
  onImageMessage,
  onIncomingStream,
  onEndVideoCall,
}: {
  userId: string;
  pair: Pair;
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
}) {
  console.log('InitiateP2P. I am initiator:', initiator);

  // 1. Создаем сессию. Передаем флаг инициатора.
  const p2pInstance = new P2pSession({
    initiator,
    onSignal,
    onStatusChange,
    onTextMessage,
    onImageMessage,
    onIncomingStream,
    onEndVideoCall,
  });

  // p2pInstancesRef.current[pairId] = p2pInstance;

  return p2pInstance;
}
