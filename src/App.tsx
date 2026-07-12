import { useState, useRef, useEffect } from 'react';
import { P2P } from './api/p2p';
import { Initializer } from './Initializer';
import { Toaster } from './components/Toaster';

export default function App() {
  // const [value, setValue] = useState('');
  // const [isLoading, setIsLoading] = useState({
  //   createOffer: false,
  //   createAnswer: false,
  //   getAnswer: false,
  // });
  // const [messages, setMessages] = useState<string[]>([]);
  // const [logs, setLogs] = useState<string[]>([]);
  // const [channel, setChannel] = useState<RTCDataChannel | null>(null);

  // useEffect(() => {
  //   P2P.channelPromise.then(setChannel);
  // }, []);

  // useEffect(() => {
  //   if (channel) {
  //     channel.onmessage = (event) =>
  //       setMessages((messages) => [...messages, event.data]);
  //   }
  // }, [channel]);

  // const onCreateOfferClick = async () => {
  //   setIsLoading((state) => ({ ...state, createOffer: true }));

  //   const offer = await P2P.createOffer();
  //   if (!offer) return;

  //   setLogs((logs) => [...logs, 'created offer']);

  //   await Server.setOffer(offer).catch((error) =>
  //     setLogs((logs) => [...logs, JSON.stringify(error)]),
  //   );

  //   setLogs((logs) => [...logs, 'sent offer']);

  //   setIsLoading((state) => ({ ...state, createOffer: false }));
  // };

  // const onCreateAnswerClick = async () => {
  //   setIsLoading((state) => ({ ...state, createAnswer: true }));

  //   const offer = await Server.getOffer();
  //   if (!offer) return;

  //   setLogs((logs) => [...logs, 'got offer']);

  //   const answer = await P2P.createAnswer(offer);
  //   if (!answer) return;

  //   setLogs((logs) => [...logs, 'created answer']);

  //   await Server.setAnswer(answer);

  //   setLogs((logs) => [...logs, 'sent answer']);

  //   setIsLoading((state) => ({ ...state, createAnswer: false }));
  // };

  // const onGetAnswerClick = async () => {
  //   setIsLoading((state) => ({ ...state, getAnswer: true }));

  //   const answer = await Server.getAnswer();
  //   if (!answer) return;

  //   setLogs((logs) => [...logs, 'got answer']);

  //   await P2P.applyAnswer(answer);

  //   setLogs((logs) => [...logs, 'applied answer']);

  //   setIsLoading((state) => ({ ...state, getAnswer: false }));
  // };

  // const sendMessage = () => {
  //   channel?.send(value);
  // };

  return (
    <>
      <Initializer />
      <Toaster />
    </>
  );
}
