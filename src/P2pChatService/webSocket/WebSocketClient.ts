export type WsStatus = 'disconnected' | 'connecting' | 'connected';

type StatusHandler = (status: WsStatus) => void;
type MessageHandler<WsResponse> = (data: WsResponse) => void;

export class WebSocketClient<WsRequest, WsResponse> {
  private url: string = '';
  private ws: WebSocket | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000;
  private _status: WsStatus = 'disconnected';
  private messageQueue: WsRequest[] = [];
  private messageHandler: MessageHandler<WsResponse> | null = null;
  private statusHandler: StatusHandler | null = null;

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  get status(): WsStatus {
    return this._status;
  }
  set status(value: WsStatus) {
    this._status = value;
    this.statusHandler?.(value);
  }

  private connect(): void {
    console.log('WS connect start: ');
    if (this.status !== 'disconnected') return;
    this.status = 'connecting';

    try {
      console.log('SOCKET_URL: ', this.url);
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.status = 'connected';
        this.messageQueue.forEach((message) => this.send(message));
        this.messageQueue = [];
      };

      this.ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const parsed = JSON.parse(event.data);
          this.messageHandler?.(parsed);
        } catch (e) {
          console.error('Parse error:', e);
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        console.log('WebSocket closed:', event.code, event.reason);
        this.status = 'disconnected';
        this.reconnect();
      };

      this.ws.onerror = (error: Event) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Connection error:', error);
      this.status = 'disconnected';
      this.reconnect();
    }
  }

  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      30000,
    );

    this.reconnectAttempts++;
    console.log(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    setTimeout(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        console.log('Already connected, skipping reconnect');
        return;
      }
      this.connect();
    }, delay);
  }

  protected send(data: WsRequest): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      this.messageQueue.push(data);
      console.warn('WebSocket not open, message queued');
    }
  }

  onMessage(handler: MessageHandler<WsResponse>): void {
    this.messageHandler = handler;
  }

  onStatus(handler: StatusHandler): void {
    this.statusHandler = handler;
  }

  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts;
    if (this.ws) {
      this.ws.close();
    }
  }
}
