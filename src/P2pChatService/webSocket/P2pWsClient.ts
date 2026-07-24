import { SetAnswerBody, SetOfferBody } from './ws_types';
import { WebSocketClient } from './WebSocketClient';
import { WsRequest, WsResponse } from './ws_types';

const P2P_SOCKET_URL = 'wss://backend-on-render-com.onrender.com/api/ws';
// const P2P_SOCKET_URL = 'ws://localhost:3001/api/ws';

export class P2pWsClient extends WebSocketClient<WsRequest, WsResponse> {
  constructor() {
    super(P2P_SOCKET_URL);
  }

  setOffer(data: SetOfferBody) {
    this.send({ type: 'setOffer', payload: data });
  }

  setAnser(data: SetAnswerBody) {
    this.send({ type: 'setAnswer', payload: data });
  }

  requestInitial(userId: string) {
    this.send({ type: 'initial', payload: { userId } });
  }
}
