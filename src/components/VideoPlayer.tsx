import { useRef, useEffect, useState } from 'react';

export const VideoPlayer = ({
  stream,
  muted,
  position,
  toggleFullScreen
}: {
  stream: MediaStream;
    muted?: boolean;
    position: 'normal' | 'fullscreen' | 'corner';
  toggleFullScreen: () => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '4/3',
        borderRadius: 10,
        overflow: 'hidden',
        cursor: 'pointer',
        ...(position === 'fullscreen' && {
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 1,
          width: '100%',
          height: '100%',
          borderRadius: 0,
        }),
        ...(position === 'corner' && {
          position: 'fixed',
          top: 0,
          right: 0,
          zIndex: 2,
          width: '24%',
          height: 'auto',
          aspectRatio: 'unset',
          borderRadius: 0,
        })
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          backgroundColor: '#333',
        }}
      />
      <div
        style={{ position: 'absolute', inset: 0 }}
        onClick={toggleFullScreen}
      ></div>
    </div>
  );
};
