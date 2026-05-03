import { FC, useState } from 'react';

export type Message = {
  text: string;
  isOwner?: boolean;
};

export const Chat: FC<{
  interlocutorId: string;
  connected: boolean;
  messages: Message[];
  send: (text: string) => void;
}> = ({ interlocutorId, connected, messages, send }) => {
  const [text, setText] = useState<string>('');

  const onClick = () => {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    send(trimmedText);
    setText('');
  };

  return (
    <div>
      <div>Chat with user: {interlocutorId}</div>

      {connected ? (
        <ul
          style={{
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            padding: 0,
            border: '1px solid',
          }}
        >
          {messages.map((message, i) => (
            <li
              key={i}
              style={{
                alignSelf: message.isOwner ? 'flex-end' : 'flex-start',
                maxWidth: '60%',
                backgroundColor: message.isOwner ? 'lightgreen' : 'lightblue',
              }}
            >
              {message.text}
            </li>
          ))}
        </ul>
      ) : (
        <div>Not connected yet</div>
      )}

      <div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!connected}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onClick();
            }
          }}
        />
        <button onClick={onClick} disabled={!connected}>
          Send
        </button>
      </div>
    </div>
  );
};
