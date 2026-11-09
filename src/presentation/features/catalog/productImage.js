import { crc32 } from 'node:zlib';
import { AppError } from '../../../shared/errors/AppError.js';

export const maxImageBytes = 2 * 1024 * 1024;
export const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function isPng(bytes) {
  if (!bytes.subarray(0, 8).equals(pngSignature)) return false;
  let hasData = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 8;
    if (end + 4 > bytes.length) return false;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (crc32(bytes.subarray(offset + 4, end)) !== bytes.readUInt32BE(end))
      return false;
    if (
      offset === 8 &&
      (type !== 'IHDR' ||
        length !== 13 ||
        !bytes.readUInt32BE(offset + 8) ||
        !bytes.readUInt32BE(offset + 12))
    )
      return false;
    if (type === 'IDAT' && length > 0) hasData = true;
    if (type === 'IEND')
      return hasData && length === 0 && end + 4 === bytes.length;
    offset = end + 4;
  }
  return false;
}

function isJpeg(bytes) {
  if (
    bytes.length < 14 ||
    bytes.readUInt16BE(0) !== 0xffd8 ||
    bytes.readUInt16BE(bytes.length - 2) !== 0xffd9
  )
    return false;
  let hasFrame = false;
  for (let offset = 2; offset + 4 < bytes.length;) {
    if (bytes[offset++] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    if (offset + 3 >= bytes.length) return false;
    const marker = bytes[offset++];
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length >= bytes.length - 2) return false;
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      if (
        length < 8 ||
        !bytes.readUInt16BE(offset + 3) ||
        !bytes.readUInt16BE(offset + 5)
      )
        return false;
      hasFrame = true;
    }
    if (marker === 0xda) return hasFrame && length >= 6;
    offset += length;
  }
  return false;
}

function isWebp(bytes) {
  if (
    bytes.length < 21 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP' ||
    bytes.readUInt32LE(4) !== bytes.length - 8
  )
    return false;
  let offset = 12;
  let hasImage = false;
  for (; offset + 8 <= bytes.length;) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > bytes.length) return false;
    if (type === 'VP8 ' && size > 10)
      hasImage ||= bytes
        .subarray(start + 3, start + 6)
        .equals(Buffer.from([157, 1, 42]));
    if (type === 'VP8L' && size > 5) hasImage ||= bytes[start] === 0x2f;
    offset = start + size + (size % 2);
  }
  return hasImage && offset === bytes.length;
}

export function validateImage(bytes, mediaType) {
  if (!imageTypes.includes(mediaType))
    throw new AppError(
      415,
      'IMAGE_TYPE_UNSUPPORTED',
      'Alege o imagine PNG, JPEG sau WebP.',
    );
  const check = {
    'image/png': isPng,
    'image/jpeg': isJpeg,
    'image/webp': isWebp,
  }[mediaType];
  if (!Buffer.isBuffer(bytes) || !check(bytes))
    throw new AppError(
      400,
      'INVALID_IMAGE',
      'Fișierul nu conține o imagine validă.',
    );
}
