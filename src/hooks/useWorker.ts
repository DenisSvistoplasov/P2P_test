import { useEffect, useState } from "react";

export const useWorker = () => {
  const [worker, setWorker] = useState<Worker | null>(null);

  useEffect(() => {
    const newWorker = new Worker(new URL('../testWorker.ts', import.meta.url), {
      type: 'module',
    });
    newWorker.onmessage = (event) => {
      console.log('React получил ответ от воркера:', event.data);
    };
    
    newWorker.postMessage('Проверка связи');

    setWorker(newWorker);

    return () => {
      newWorker.terminate();
    };
  }, []);


  return worker;
};
