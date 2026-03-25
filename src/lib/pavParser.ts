export interface PavData {
  frames: Uint8Array[];
  audio: Uint8Array;
  fps: number;
  width: number;
  height: number;
  duration: number;
}

const QCELP_FRAME_SIZES: Record<number, number> = {
  1: 4,   // eighth rate
  2: 8,   // quarter rate
  3: 17,  // half rate
  4: 35,  // full rate
  14: 1,  // erasure/blank
};

function countQcelpFrames(audioData: Uint8Array): number {
  // Find "data" chunk in RIFF container
  const riffBody = audioData.subarray(12); // skip RIFF header (RIFF + size + QLCM)
  let pos = 0;

  while (pos < riffBody.length - 8) {
    const chunkId = String.fromCharCode(
      riffBody[pos], riffBody[pos + 1], riffBody[pos + 2], riffBody[pos + 3]
    );
    const view = new DataView(riffBody.buffer, riffBody.byteOffset + pos + 4, 4);
    const chunkSize = view.getUint32(0, true);

    if (chunkId === 'data') {
      const data = riffBody.subarray(pos + 8, pos + 8 + chunkSize);
      let frameCount = 0;
      let i = 0;
      while (i < data.length) {
        const rate = data[i];
        const frameSize = QCELP_FRAME_SIZES[rate];
        if (frameSize === undefined) break;
        i += frameSize;
        frameCount++;
      }
      return frameCount;
    }

    pos += 8 + chunkSize;
    if (pos % 2 === 1) pos++; // RIFF chunks are word-aligned
  }

  return 0;
}

function parseJpegDimensions(frame: Uint8Array): { width: number; height: number } {
  for (let i = 0; i < frame.length - 9; i++) {
    if (frame[i] === 0xFF && frame[i + 1] === 0xC0) {
      const view = new DataView(frame.buffer, frame.byteOffset + i + 5, 4);
      const height = view.getUint16(0, false); // big-endian
      const width = view.getUint16(2, false);
      return { width, height };
    }
  }
  return { width: 220, height: 176 }; // fallback
}

// Extract JPEG table markers (DQT, DHT, SOF0) from the first frame.
// PAV stores these only in frame 0; subsequent frames have just SOI → APP → SOS → EOI.
function extractJpegTables(frame: Uint8Array): Uint8Array {
  const segments: Uint8Array[] = [];
  let i = 2; // skip FFD8

  while (i < frame.length - 1) {
    if (frame[i] !== 0xFF) break;
    const marker = frame[i + 1];

    // Stop at SOS (FFDA) or EOI (FFD9)
    if (marker === 0xDA || marker === 0xD9) break;

    // Read segment length (big-endian, includes the 2 length bytes)
    const segLen = (frame[i + 2] << 8) | frame[i + 3];

    // Keep DQT (FFDB), SOF0 (FFC0), DHT (FFC4)
    if (marker === 0xDB || marker === 0xC0 || marker === 0xC4) {
      segments.push(frame.slice(i, i + 2 + segLen));
    }

    i += 2 + segLen;
  }

  // Concatenate all table segments
  const totalLen = segments.reduce((sum, s) => sum + s.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const seg of segments) {
    result.set(seg, offset);
    offset += seg.length;
  }
  return result;
}

// Check if a frame already contains a SOF marker
function frameHasSOF(frame: Uint8Array): boolean {
  for (let i = 0; i < frame.length - 1; i++) {
    if (frame[i] === 0xFF && frame[i + 1] === 0xC0) return true;
  }
  return false;
}

// Inject JPEG tables right after SOI (FFD8) for frames missing them
function injectTables(frame: Uint8Array, tables: Uint8Array): Uint8Array {
  // New frame: FFD8 + tables + rest of original frame (after FFD8)
  const result = new Uint8Array(2 + tables.length + (frame.length - 2));
  result[0] = 0xFF;
  result[1] = 0xD8;
  result.set(tables, 2);
  result.set(frame.subarray(2), 2 + tables.length);
  return result;
}

export function parsePavFile(buffer: ArrayBuffer): PavData {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const jpegDataSize = view.getUint32(0, true);
  const audioDataSize = view.getUint32(4, true);

  // Extract raw JPEG frames by finding FFD8/FFD9 markers
  const rawFrames: Uint8Array[] = [];
  const videoEnd = 8 + jpegDataSize;
  let i = 8;

  while (i < videoEnd - 1) {
    if (data[i] === 0xFF && data[i + 1] === 0xD8) {
      const start = i;
      i += 2;
      while (i < videoEnd - 1) {
        if (data[i] === 0xFF && data[i + 1] === 0xD9) {
          rawFrames.push(data.slice(start, i + 2));
          i += 2;
          break;
        }
        i++;
      }
    } else {
      i++;
    }
  }

  // Fix incomplete frames by injecting tables from frame 0
  let frames: Uint8Array[];
  if (rawFrames.length > 0) {
    const tables = extractJpegTables(rawFrames[0]);
    frames = rawFrames.map((frame, idx) => {
      if (idx === 0 || frameHasSOF(frame)) return frame;
      return injectTables(frame, tables);
    });
  } else {
    frames = [];
  }

  // Extract audio (RIFF/QLCM)
  const audio = data.slice(8 + jpegDataSize, 8 + jpegDataSize + audioDataSize);

  // Calculate FPS from audio duration
  const qcelpFrameCount = countQcelpFrames(audio);
  const duration = qcelpFrameCount * 0.02; // 20ms per QCELP frame
  const fps = duration > 0 ? frames.length / duration : 15;

  // Get dimensions from first frame
  const { width, height } = frames.length > 0
    ? parseJpegDimensions(frames[0])
    : { width: 220, height: 176 };

  return { frames, audio, fps, width, height, duration };
}
