import { useState, useRef } from "react";
import { P2P } from "./api/p2p";
import { Server } from "./api/server";
// import "./styles.css";

export default function App() {
  const [value, setValue] = useState("Hello, Vova!");
  const [isLoading, setIsLoading] = useState({
    createOffer: false,
    createAnswer: false,
    getAnswer: false,
  });
  const [message, setMessage] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [channel, setChannel] = useState<RTCDataChannel | null>(null);

  const onCreateOfferClick = async () => {
    setIsLoading((state) => ({ ...state, createOffer: true }));

    const offer = await P2P.createOffer();
    if (!offer) return;

    setLogs((logs) => [...logs, "created offer"]);

    await Server.setOffer(offer).catch((error) =>
      setLogs((logs) => [...logs, JSON.stringify(error)])
    );

    setLogs((logs) => [...logs, "sent offer"]);

    P2P.onOpen((channel) => {
      setLogs((logs) => [...logs, "send message: " + value]);
      setChannel(channel);
      channel.send(value);
    });

    setIsLoading((state) => ({ ...state, createOffer: false }));
  };

  const onCreateAnswerClick = async () => {
    setIsLoading((state) => ({ ...state, createAnswer: true }));

    const offer = await Server.getOffer();
    if (!offer) return;

    setLogs((logs) => [...logs, "got offer"]);

    const answer = await P2P.createAnswer(offer);
    if (!answer) return;

    setLogs((logs) => [...logs, "created answer"]);

    await Server.setAnswer(answer);

    setLogs((logs) => [...logs, "sent answer"]);

    P2P.onMessage(setMessage);

    P2P.getChannel().then((channel) => channel && setChannel(channel));

    setIsLoading((state) => ({ ...state, createAnswer: false }));
  };

  const onGetAnswerClick = async () => {
    setIsLoading((state) => ({ ...state, getAnswer: true }));

    const answer = await Server.getAnswer();
    if (!answer) return;

    setLogs((logs) => [...logs, "got answer"]);

    await P2P.applyAnswer(answer);

    setLogs((logs) => [...logs, "applied answer"]);

    setIsLoading((state) => ({ ...state, getAnswer: false }));
  };

  const sendMessage = () => {
    channel?.send(value);
  };

  return (
    <div className="App">
      <input
        style={{ marginBottom: 10 }}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />

      <div style={{ marginBottom: 10 }}>
        <button onClick={onCreateOfferClick}>
          {isLoading.createOffer ? "Creating..." : "Create offer"}
        </button>
        <button onClick={onCreateAnswerClick}>
          {isLoading.createAnswer ? "Creating..." : "Create answer"}
        </button>
        <button onClick={onGetAnswerClick}>
          {isLoading.getAnswer ? "Getting..." : "Get answer"}
        </button>
        <button onClick={sendMessage} disabled={!channel}>
          Send message
        </button>
      </div>

      <div
        style={{
          border: "1px solid",
          padding: 10,
          width: "fit-content",
          minWidth: 100,
          margin: "0 auto 10px",
        }}
      >
        {message}
      </div>

      <div>Logs:</div>
      <ul>
        {logs.map((log, i) => (
          <li key={i + log}>{log}</li>
        ))}
      </ul>
    </div>
  );
}
