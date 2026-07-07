import { WebSocketClient } from './webSocket';
import { WsRequest, WsResponse } from './ws_types';

const P2P_SOCKET_URL = 'wss://backend-on-render-com.onrender.com/api/ws';
// const P2P_SOCKET_URL = 'ws://localhost:3001/api/ws';

export class P2pWsClient extends WebSocketClient<WsRequest, WsResponse> {
  constructor() {
    super(P2P_SOCKET_URL);
  }
}
