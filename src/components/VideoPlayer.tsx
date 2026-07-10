import { useRef, useEffect, useState } from "react";

export const VideoPlayer = ({
  stream,
  muted,
}: {
  stream: MediaStream;
  muted?: boolean;
  }) => {
  const [isFullScreen, setIsFullScreen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      aspectRatio: '4/3',
      borderRadius: 10,
      overflow: 'hidden',
      cursor: 'pointer',
      ...isFullScreen && { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', borderRadius: 0 },
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
        objectFit: 'cover',
      }}
      />
      <div style={{position: 'absolute', inset: 0}} onClick={() => setIsFullScreen(is=>!is)}></div>
    </div>
  );
};
