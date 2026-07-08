import { useCallback, useEffect } from 'react';
import ringtone from '../assets/ringtone.mp3';

const audio = new Audio(ringtone);
audio.loop = true;

export const usePlayIncomingCallRing = () => {
  const play = useCallback(
    () =>
      audio.play().catch((error) => {
        console.warn('Браузер заблокировал автоплей до клика', error);
        alert('Входящий звонок');
      }),
    [],
  );
  const stop = useCallback(() => {
    audio.pause();
    audio.currentTime = 0;
  }, []);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return [play, stop];
};
