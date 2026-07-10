import { FC, useState } from 'react';
import { formateTimeDuration } from './utils/utils';

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
export type CallInfoMessage = {
  type: 'callInfo';
  start: boolean;
  timestamp: number; // ms
  duration?: number; // ms
};

export type Message = TextMessage | ImageMessage | CallInfoMessage;

export const Chat: FC<{
  interlocutorId: string;
  connected: boolean;
  messages: Message[];
  sendText: (message: string) => void;
  sendFile: (message: File) => void;
}> = ({ interlocutorId, connected, messages, sendText, sendFile }) => {
  const [text, setText] = useState<string>('');

  const onFileFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && connected) {
      sendFile(file);
    }
  };

  const onClick = () => {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    sendText(trimmedText);
    setText('');
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <div>Chat with user: {interlocutorId}</div>

      {messages.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            padding: 4,
            border: '1px solid',
          }}
        >
          {messages.map((message, i) => (
            <li
              key={i}
              style={{
                alignSelf:
                  message.type === 'callInfo'
                    ? 'center'
                    : message.isOwner
                      ? 'flex-end'
                      : 'flex-start',
                maxWidth: '60%',
                backgroundColor:
                  message.type === 'callInfo'
                    ? 'lightgray'
                    : message.isOwner
                      ? 'lightgreen'
                      : 'lightblue',
                borderRadius:
                  message.type === 'text'
                    ? message.isOwner
                      ? '7px 7px 0 7px'
                      : '0 7px 7px 7px'
                    : '5px',
                padding: '2px 8px',
              }}
            >
              {message.type === 'text' ? (
                <span style={{ fontFamily: 'sans-serif' }}>{message.text}</span>
              ) : message.type === 'image' ? (
                <div>
                  <img
                    src={message.url}
                    style={{
                      width: '100%',
                      aspectRatio: '4/3',
                      objectFit: 'contain',
                    }}
                  />
                  <p
                    style={{
                      fontSize: 10,
                      color: '#555',
                      margin: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {message.name}
                  </p>
                  <p style={{ margin: 0, fontSize: 10, color: '#555' }}>
                    size: {formateFileSize(message.size)}
                  </p>
                </div>
              ) : (
                <span>
                  {message.start ? 'Call started' : 'Call ended'} at{' '}
                  {new Date(message.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  .
                  {message.duration && (
                    <> Duration:&nbsp;{formateTimeDuration(message.duration)}</>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
          style={{
            flexGrow: 1,
            minWidth: 200,
            minHeight: 40,
            fontSize: 14,
            padding: 8,
          }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            onClick={onClick}
            disabled={!connected}
            style={{ padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}
          >
            Send
          </button>

          <button
            style={{ padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}
          >
            <label htmlFor="fileInput" style={{ cursor: 'pointer' }}>
              Choose Image
            </label>
          </button>
          <input
            type="file"
            id="fileInput"
            accept="image/*"
            multiple={false}
            onChange={onFileFileChange}
            style={{ display: 'none' }}
          />
        </div>
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
};
