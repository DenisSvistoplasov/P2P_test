export const concatenateBuffers = (buffers: ArrayBuffer[]): ArrayBuffer => {
  const totalSize = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const buf of buffers) {
    result.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return result.buffer;
};

export const formateTimeDuration = (ms: number) => {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((ms % (60 * 1000)) / 1000);

  if (hours > 0) {
    return `${hours}:${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

export const formateFileSize = (bytes: number) => {
  if (bytes < 1_024) return bytes + 'B';

  const kilo = Math.floor(bytes / 1_024);
  if (kilo < 1_024) return kilo + 'KB';

  const mega = Math.floor(kilo / 1_024);
  if (mega < 1_024) return mega + 'MB';

  const gigo = Math.floor(mega / 1_024);
  return gigo + 'GB';
};
