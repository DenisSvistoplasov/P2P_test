import { useRef } from 'react';
import { P2pWsClient } from '../server/p2p_ws';

export const useWsClient = () => {
  const wsRef = useRef<P2pWsClient | null>(null);

  if (!wsRef.current) {
    wsRef.current = new P2pWsClient();
  }

  return wsRef.current;
};
