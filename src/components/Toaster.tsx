import { useEffect, useState } from 'react';
import { ToasterService } from '../utils/toaster';

export const Toaster = () => {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    ToasterService.onChange(setMessages);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        zIndex: 999,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 2,
        maxHeight: '30dvh',
        overflow: 'auto',
      }}
    >
      {messages.map((message, index) => (
        <div
          key={index}
          style={{
            width: 120,
            backgroundColor: '#c00',
            color: '#fff',
            padding: '4px 8px',
            wordBreak: 'break-word',
          }}
        >
          {message}
        </div>
      ))}
    </div>
  );
};
