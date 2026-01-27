const fs = require('fs');
const path = require('path');

/**
 * Simple procedural favicon generator so the design can be reproduced.
 */
function hexToRgb(hex) {
    const normalized = hex.replace('#', '');
    const bigint = parseInt(normalized, 16);
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255
    };
}

function mix(a, b, amount) {
    return {
        r: Math.round(a.r + (b.r - a.r) * amount),
        g: Math.round(a.g + (b.g - a.g) * amount),
        b: Math.round(a.b + (b.b - a.b) * amount)
    };
}

function createCanvas(width, height) {
    const data = new Uint8Array(width * height * 4);

    const setPixel = (x, y, color, alpha = 255) => {
        if (x < 0 || x >= width || y < 0 || y >= height) {
            return;
        }
        const idx = (y * width + x) * 4;
        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
        data[idx + 3] = alpha;
    };

    const fillRect = (x0, y0, x1, y1, color, alpha = 255) => {
        for (let y = Math.max(0, y0); y < Math.min(height, y1); y += 1) {
            for (let x = Math.max(0, x0); x < Math.min(width, x1); x += 1) {
                setPixel(x, y, color, alpha);
            }
        }
    };

    return { data, setPixel, fillRect };
}

function createIcoBuffer(width, height, pixels) {
    const xorSize = width * height * 4;
    const maskStride = Math.ceil(width / 32) * 4;
    const maskSize = maskStride * height;
    const imageDataSize = 40 + xorSize + maskSize;
    const totalSize = 6 + 16 + imageDataSize;
    const buffer = Buffer.alloc(totalSize);

    let offset = 0;
    buffer.writeUInt16LE(0, offset); offset += 2; // reserved
    buffer.writeUInt16LE(1, offset); offset += 2; // icon type
    buffer.writeUInt16LE(1, offset); offset += 2; // image count

    buffer.writeUInt8(width === 256 ? 0 : width, offset); offset += 1;
    buffer.writeUInt8(height === 256 ? 0 : height, offset); offset += 1;
    buffer.writeUInt8(0, offset); offset += 1; // color palette
    buffer.writeUInt8(0, offset); offset += 1; // reserved
    buffer.writeUInt16LE(1, offset); offset += 2; // color planes
    buffer.writeUInt16LE(32, offset); offset += 2; // bit count
    buffer.writeUInt32LE(imageDataSize, offset); offset += 4;
    buffer.writeUInt32LE(6 + 16, offset); offset += 4; // image offset

    buffer.writeUInt32LE(40, offset); offset += 4; // DIB header size
    buffer.writeInt32LE(width, offset); offset += 4;
    buffer.writeInt32LE(height * 2, offset); offset += 4; // includes mask
    buffer.writeUInt16LE(1, offset); offset += 2;
    buffer.writeUInt16LE(32, offset); offset += 2;
    buffer.writeUInt32LE(0, offset); offset += 4;
    buffer.writeUInt32LE(xorSize, offset); offset += 4;
    buffer.writeInt32LE(0, offset); offset += 4; // X PelsPerMeter
    buffer.writeInt32LE(0, offset); offset += 4; // Y PelsPerMeter
    buffer.writeUInt32LE(0, offset); offset += 4; // colors used
    buffer.writeUInt32LE(0, offset); offset += 4; // important colors

    // Pixel data (bottom-up, BGRA)
    for (let y = height - 1; y >= 0; y -= 1) {
        for (let x = 0; x < width; x += 1) {
            const srcIdx = (y * width + x) * 4;
            buffer[offset] = pixels[srcIdx + 2]; // blue
            buffer[offset + 1] = pixels[srcIdx + 1]; // green
            buffer[offset + 2] = pixels[srcIdx]; // red
            buffer[offset + 3] = pixels[srcIdx + 3]; // alpha
            offset += 4;
        }
    }

    // AND mask (fully opaque, so zeroed)
    const mask = Buffer.alloc(maskSize, 0);
    mask.copy(buffer, offset);

    return buffer;
}

function generateFavicon() {
    const size = 64;
    const topColor = hexToRgb('#764ba2');
    const bottomColor = hexToRgb('#667eea');
    const glowColor = hexToRgb('#fcd34d');
    const letterColor = hexToRgb('#f8fafc');
    const letterHighlight = hexToRgb('#ffe4e6');
    const shadowColor = hexToRgb('#432266');

    const { data, fillRect } = createCanvas(size, size);

    const centerX = (size - 1) / 2;
    const centerY = (size - 1) / 2;
    const maxDistance = Math.hypot(centerX, centerY);

    for (let y = 0; y < size; y += 1) {
        const verticalMix = size === 1 ? 0 : y / (size - 1);
        const stripeBase = mix(topColor, bottomColor, verticalMix);

        for (let x = 0; x < size; x += 1) {
            const distance = Math.hypot(x - centerX, y - centerY) / maxDistance;
            const glowAmount = Math.max(0, 1 - distance) * 0.35;
            const color = mix(stripeBase, glowColor, glowAmount);
            const idx = (y * size + x) * 4;
            data[idx] = color.r;
            data[idx + 1] = color.g;
            data[idx + 2] = color.b;
            data[idx + 3] = 255;
        }
    }

    // Draw drop shadow for the "T" glyph for depth
    const margin = Math.round(size * 0.18);
    const barHeight = Math.round(size * 0.16);
    const stemWidth = Math.round(size * 0.18);
    const stemTop = margin + barHeight - Math.round(size * 0.03);
    const stemBottom = size - margin;
    const stemX0 = Math.round(size / 2 - stemWidth / 2);
    const stemX1 = stemX0 + stemWidth;

    const shadowOffset = 2;
    fillRect(margin + shadowOffset, margin + shadowOffset, size - margin + shadowOffset, margin + barHeight + shadowOffset, shadowColor, 255);
    fillRect(stemX0 + shadowOffset, stemTop + shadowOffset, stemX1 + shadowOffset, stemBottom + shadowOffset, shadowColor, 255);

    // Main glyph
    fillRect(margin, margin, size - margin, margin + barHeight, letterColor, 255);
    fillRect(stemX0, stemTop, stemX1, stemBottom, letterColor, 255);

    // Subtle highlight at the top of the T for polish
    const highlightHeight = Math.max(2, Math.round(barHeight * 0.4));
    fillRect(margin, margin, size - margin, margin + highlightHeight, letterHighlight, 255);

    const icoBuffer = createIcoBuffer(size, size, data);
    const outputPath = path.join(__dirname, '../app/favicon.ico');
    fs.writeFileSync(outputPath, icoBuffer);
    console.log(`Generated favicon at ${outputPath}`);
}

generateFavicon();
