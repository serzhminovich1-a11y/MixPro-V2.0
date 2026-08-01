/**
 * Encode a slice of an AudioBuffer to a 16-bit PCM WAV Blob.
 * startSec/endSec clamp to buffer bounds.
 */
export function encodeWavSlice(buffer: AudioBuffer, startSec: number, endSec: number): Blob {
  const sr = buffer.sampleRate;
  const s = Math.max(0, Math.min(buffer.length, Math.floor(startSec * sr)));
  const e = Math.max(s, Math.min(buffer.length, Math.floor(endSec * sr)));
  const frames = e - s;
  const channels = Math.min(2, buffer.numberOfChannels);
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const bufOut = new ArrayBuffer(44 + dataSize);
  const view = new DataView(bufOut);

  const writeString = (o: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(o + i, str.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const chData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) chData.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = s; i < e; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, chData[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([bufOut], { type: "audio/wav" });
}

/** Build a peak array of `bins` samples from an AudioBuffer (max abs per bin, mono-mixed). */
export function computePeaks(buffer: AudioBuffer, bins: number): Float32Array {
  const peaks = new Float32Array(bins);
  const chs = buffer.numberOfChannels;
  const len = buffer.length;
  const step = Math.max(1, Math.floor(len / bins));
  const data: Float32Array[] = [];
  for (let c = 0; c < chs; c++) data.push(buffer.getChannelData(c));
  for (let b = 0; b < bins; b++) {
    const start = b * step;
    const end = Math.min(len, start + step);
    let peak = 0;
    for (let i = start; i < end; i++) {
      let v = 0;
      for (let c = 0; c < chs; c++) v += data[c][i];
      v = Math.abs(v / chs);
      if (v > peak) peak = v;
    }
    peaks[b] = peak;
  }
  return peaks;
}
