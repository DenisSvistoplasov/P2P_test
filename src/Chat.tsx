import { FC, useEffect, useRef, useState } from 'react';
import { formateFileSize, formateTimeDuration } from './utils/utils';

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

  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10,  marginBottom: 10, overflow: 'hidden' }}>
      <div>Chat with user: {interlocutorId}</div>

      {messages.length > 0 && (
        <ul
          ref={listRef}
          style={{
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            maxHeight: 300,
            padding: 4,
            border: '1px solid',
            overflow: 'auto',
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
          key={interlocutorId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!connected}
          placeholder="Сообщение..."
          autoFocus
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
            Отправить
          </button>

          <button
            style={{ padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}
          >
            <label htmlFor="fileInput" style={{ cursor: 'pointer' }}>
              Картинка
            </label>
          </button>
          <input
            disabled={!connected}
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

