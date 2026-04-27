import { P2pConnectionData } from "./p2p";
import axios from "axios";

const BASE_URL = "https://backend-on-render-com.onrender.com/api/p2p/";

export const Server = {
  setOffer(offer: P2pConnectionData) {
    return axios.post(BASE_URL + "setOffer", offer);
  },

  getOffer() {
    return axios
      .get(BASE_URL + "getOffer")
      .then((response) => response.data as P2pConnectionData | undefined);
  },

  setAnswer(answer: P2pConnectionData) {
    return axios.post(BASE_URL + "setAnswer", answer);
  },

  getAnswer() {
    return axios
      .get(BASE_URL + "getAnswer")
      .then((response) => response.data as P2pConnectionData | undefined);
  },
};
