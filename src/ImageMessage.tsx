import { CSSProperties, FC, useMemo, useState } from 'react';
import { formateFileSize } from './utils/utils';
import { ImageMessageType } from './Chat';
import { DownloadIcon } from './components/icons/DownloadIcon';

export const ImageMessage: FC<ImageMessageType> = ({
  name,
  url,
  size,
  isOwner,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      style={{
        maxWidth: 300,
        paddingTop: 3,
      }}
    >
      <img
        src={url}
        onClick={() => setIsOpen((is) => !is)}
        style={{
          width: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          cursor: 'pointer',
          ...(isOpen && {
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            height: '100%',
            backgroundColor: '#333',
          }),
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
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
            {name}
          </p>
          <p style={{ margin: 0, fontSize: 10, color: '#555' }}>
            size: {formateFileSize(size)}
          </p>
        </div>

        {!isOwner && (
          <a
            href={url}
            download={name}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              backgroundColor: '#0ca',
              width: 24,
              height: 24,
              borderRadius: '50%',
            }}
            title="Download image"
          >
            <DownloadIcon style={{ width: 16, height: 16, color: '#555' }} />
          </a>
        )}
      </div>
    </div>
  );
};
