import { FC, useRef, useState } from 'react';
import { P2pMessage } from './Initializer';

export type TextMessage = {
  type: 'text';
  text: string;
  isOwner?: boolean;
};
export type ImageMessage = {
  type: 'image';
  name: string;
  mime: string;
  url: string;
  size: number; // bytes
  isOwner?: boolean;
};

export type Message = TextMessage | ImageMessage;

export const Chat: FC<{
  interlocutorId: string;
  connected: boolean;
  messages: Message[];
  send: (message: string | File) => void;
}> = ({ interlocutorId, connected, messages, send }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [text, setText] = useState<string>('');

  const onFileFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const sendImage = () => {
    if (!selectedFile) return;

    send(selectedFile);
    setSelectedFile(null);
  };

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
              {message.type === 'text' ? (
                <span>{message.text}</span>
              ) : (
                <div>
                  {' '}
                  <img
                    src={message.url}
                    style={{ width: 100, height: 100, objectFit: 'contain' }}
                  />{' '}
                  {message.name}, size: {formateFileSize(message.size)}
                </div>
              )}
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

        <input
          type="file"
          id="fileInput"
          accept="image/*"
          onChange={onFileFileChange}
        />
        <button onClick={sendImage} disabled={!connected || !selectedFile}>
          Send Image
        </button>
      </div>
    </div>
  );
};

const formateFileSize = (bytes: number) => {
  if (bytes < 1_024) return bytes + 'B';

  const kilo = Math.floor(bytes / 1_024);
  if (kilo < 1_024) return kilo + 'KB';

  const mega = Math.floor(kilo / 1_024);
  if (mega < 1_024) return mega + 'MB';

  const gigo = Math.floor(mega / 1_024);
  return gigo + 'GB';
}