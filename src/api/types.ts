import { SignalData } from "@workadventure/simple-peer";


export type Pair = {
  pairId: string;
  senderId: string;
  receiverId: string;
  offer: SignalData | null;
  answer: SignalData | null;
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
  offer: SignalData;
};

export type SetAnswerBody = {
  userId: string;
  partnerId: string;
  answer: SignalData;
};