import { useRef, useEffect } from "react";

export const VideoPlayer = ({
  stream,
  muted,
}: {
  stream: MediaStream;
  muted?: boolean;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      style={{
        width: 240,
        height: 180,
        backgroundColor: '#000',
        borderRadius: 8,
        objectFit: 'cover',
      }}
    />
  );
};
