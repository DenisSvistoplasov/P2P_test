import {
  InitialResponse,
  ListenPairsResponse,
  P2pConnectionData,
  PairChanges,
  SetAnswerBody,
  SetOfferBody,
} from './types';
import axios from 'axios';

const BASE_URL = 'https://backend-on-render-com.onrender.com/api/p2p/';

export const Server = {
  getInitial(userId?: string) {
    return axios
      .get(BASE_URL + 'getInitial' + (userId ? `?userId=${userId}` : ''))
      .then((response) => response.data as InitialResponse);
  },

  exit(userId: string) {
    return axios.post(BASE_URL + 'exit', { userId });
  },

  async listenPairs(userId: string, onChanges: (pairs: PairChanges) => void) {
    try {
      const response = await axios.get(
        BASE_URL + 'listenPairs?userId=' + userId,
      );
      const data = response.data as ListenPairsResponse;
      if (data !== 'no changes') {
        onChanges(data);
      }
      this.listenPairs(userId, onChanges);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.log(`404: пользователь ${userId} не найден, опрос остановлен`);
        return;
      }
      console.log(error);
      this.listenPairs(userId, onChanges);
    }
  },

  // heartbeat() {
  //   return axios.get(BASE_URL + 'heartbeat');
  // },

  // P2P
  setOffer(data: SetOfferBody) {
    return axios.post(BASE_URL + 'setOffer', data);
  },

  // getOffer() {
  //   return axios
  //     .get(BASE_URL + 'getOffer')
  //     .then((response) => response.data as P2pConnectionData | undefined);
  // },

  setAnswer(data: SetAnswerBody) {
    return axios.post(BASE_URL + 'setAnswer', data);
  },

  // getAnswer() {
  //   return axios
  //     .get(BASE_URL + 'getAnswer')
  //     .then((response) => response.data as P2pConnectionData | undefined);
  // },
};
