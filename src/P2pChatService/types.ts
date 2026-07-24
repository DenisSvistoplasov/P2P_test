export type PairState = 0 | 1 | 2 | 3;
export type VideoCallStatus = 'off' | 'incoming' | 'outgoing' | 'on';

type TextMessage = {
  type: 'text';
  text: string;
  isOwner?: boolean;
};
export type ImageMessageType = {
  type: 'image';
  name: string;
  mime: string;
  url: string;
  size: number; // bytes
  isOwner?: boolean;
};
export type CallInfoMessage = {
  type: 'callInfo';
  start: boolean;
  timestamp: number; // ms
  duration?: number; // ms
};
export type P2pChatMessage = TextMessage | ImageMessageType | CallInfoMessage;
