export type P2pConnectionData = {
  sdp: RTCSessionDescriptionInit;
  candidates: RTCIceCandidateInit[];
};

export type Pair = {
  pairId: string;
  senderId: string;
  receiverId: string;
  offer: P2pConnectionData | null;
  answer: P2pConnectionData | null;
};

export type InitialResponse = {
  yourId: string;
  pairs: Pair[];
};

export type PairChanges = {
  added?: Pair[];
  modified?: Pair[];
  removed?: string[];
};

export type ListenPairsResponse = PairChanges | 'no changes';

export type SetOfferBody = {
  userId: string;
  partnerId: string;
  offer: P2pConnectionData;
};

export type SetAnswerBody = {
  userId: string;
  partnerId: string;
  answer: P2pConnectionData;
};