import { useState, useRef, useEffect } from 'react';
import { P2P } from './api/p2p';
import { Server } from './api/server';

export default function App() {
  const [value, setValue] = useState('');
  const [isLoading, setIsLoading] = useState({
    createOffer: false,
    createAnswer: false,
    getAnswer: false,
  });
  const [messages, setMessages] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [channel, setChannel] = useState<RTCDataChannel | null>(null);

  useEffect(() => {
    P2P.channelPromise.then(setChannel);
  }, []);

  useEffect(() => {
    if (channel) {
      channel.onmessage = (event) =>
        setMessages((messages) => [...messages, event.data]);
    }
  }, [channel]);

  const onCreateOfferClick = async () => {
    setIsLoading((state) => ({ ...state, createOffer: true }));

    const offer = await P2P.createOffer();
    if (!offer) return;

    setLogs((logs) => [...logs, 'created offer']);

    await Server.setOffer(offer).catch((error) =>
      setLogs((logs) => [...logs, JSON.stringify(error)]),
    );

    setLogs((logs) => [...logs, 'sent offer']);

    setIsLoading((state) => ({ ...state, createOffer: false }));
  };

  const onCreateAnswerClick = async () => {
    setIsLoading((state) => ({ ...state, createAnswer: true }));

    const offer = await Server.getOffer();
    if (!offer) return;

    setLogs((logs) => [...logs, 'got offer']);

    const answer = await P2P.createAnswer(offer);
    if (!answer) return;

    setLogs((logs) => [...logs, 'created answer']);

    await Server.setAnswer(answer);

    setLogs((logs) => [...logs, 'sent answer']);

    setIsLoading((state) => ({ ...state, createAnswer: false }));
  };

  const onGetAnswerClick = async () => {
    setIsLoading((state) => ({ ...state, getAnswer: true }));

    const answer = await Server.getAnswer();
    if (!answer) return;

    setLogs((logs) => [...logs, 'got answer']);

    await P2P.applyAnswer(answer);

    setLogs((logs) => [...logs, 'applied answer']);

    setIsLoading((state) => ({ ...state, getAnswer: false }));
  };

  const sendMessage = () => {
    channel?.send(value);
  };

  return (
    <div className="App" style={{ textAlign: 'center' }}>
      <input
        style={{ marginBottom: 10 }}
        type="text"
        value={value}
        placeholder='Your message'
        onChange={(e) => setValue(e.target.value)}
      />

      <div style={{ marginBottom: 10 }}>
        <button onClick={onCreateOfferClick}>
          {isLoading.createOffer ? 'Creating...' : 'Create offer'}
        </button>
        <button onClick={onCreateAnswerClick}>
          {isLoading.createAnswer ? 'Creating...' : 'Create answer'}
        </button>
        <button onClick={onGetAnswerClick}>
          {isLoading.getAnswer ? 'Getting...' : 'Get answer'}
        </button>
        <button onClick={sendMessage} disabled={!channel}>
          Send message
        </button>
      </div>

      <div style={{display: 'grid', gridTemplateColumns:'1fr 1fr', gap:10, maxWidth: 500, margin: '0 auto'}}>
        <div>
          <div>Messages:</div>
          <div
            style={{
              border: '1px solid',
              padding: 10,
              width: 'fit-content',
              minWidth: 100,
              margin: '0 auto 10px',
            }}
          >
            {messages.map((message, i) => (
              <div key={i + message}>{message}</div>
            ))}
          </div>
        </div>

        <div>
          <div>Logs:</div>
          <ul>
            {logs.map((log, i) => (
              <li key={i + log}>{log}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
