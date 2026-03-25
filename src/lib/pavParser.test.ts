import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parsePavFile } from './pavParser';

const samplePath = resolve(__dirname, '../../pav_samples/017_movie.pav');
const sampleBuffer = readFileSync(samplePath).buffer;

describe('parsePavFile', () => {
  const result = parsePavFile(sampleBuffer);

  it('should parse header correctly', () => {
    const view = new DataView(sampleBuffer);
    const jpegDataSize = view.getUint32(0, true);
    const audioDataSize = view.getUint32(4, true);

    expect(jpegDataSize).toBe(577164);
    expect(audioDataSize).toBe(36350);
    // file size = 8 + jpegDataSize + audioDataSize
    expect(sampleBuffer.byteLength).toBe(8 + jpegDataSize + audioDataSize);
  });

  it('should extract all JPEG frames', () => {
    expect(result.frames.length).toBe(153);
  });

  it('should have valid JPEG frames (SOI/EOI markers)', () => {
    for (const frame of result.frames) {
      // SOI marker: FF D8
      expect(frame[0]).toBe(0xFF);
      expect(frame[1]).toBe(0xD8);
      // EOI marker: FF D9
      expect(frame[frame.length - 2]).toBe(0xFF);
      expect(frame[frame.length - 1]).toBe(0xD9);
    }
  });

  it('should detect correct resolution from JPEG SOF0', () => {
    expect(result.width).toBe(220);
    expect(result.height).toBe(176);
  });

  it('should extract RIFF/QLCM audio', () => {
    expect(result.audio.length).toBe(36350);
    // RIFF header
    const riffMagic = String.fromCharCode(
      result.audio[0], result.audio[1], result.audio[2], result.audio[3]
    );
    expect(riffMagic).toBe('RIFF');
    // QLCM format
    const format = String.fromCharCode(
      result.audio[8], result.audio[9], result.audio[10], result.audio[11]
    );
    expect(format).toBe('QLCM');
  });

  it('should calculate audio duration from QCELP frames', () => {
    // 1033 QCELP frames x 0.02s = 20.66s
    expect(result.duration).toBeCloseTo(20.66, 1);
  });

  it('should calculate FPS correctly', () => {
    // 153 frames / 20.66s ≈ 7.41 fps
    expect(result.fps).toBeCloseTo(7.41, 1);
  });

  it('should inject JPEG tables into incomplete frames', () => {
    // Frame 0 has tables (SOF marker), so it's used as-is
    // Frame 1+ should have tables injected → they must also have SOF marker
    for (let i = 0; i < Math.min(5, result.frames.length); i++) {
      const frame = result.frames[i];
      let hasSOF = false;
      for (let j = 0; j < frame.length - 1; j++) {
        if (frame[j] === 0xFF && frame[j + 1] === 0xC0) {
          hasSOF = true;
          break;
        }
      }
      expect(hasSOF).toBe(true);
    }
  });
});
