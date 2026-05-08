/**
 * Generate PWA Icons
 * 
 * Creates placeholder PNG icons for PWA manifest
 * Run with: node scripts/generate-pwa-icons.js
 */

const fs = require('fs');
const path = require('path');

const iconSizes = [192, 512];

console.log('📱 PWA Icon Generator');
console.log('====================\n');

// Check if sharp is available (for PNG generation)
let sharp;
try {
    sharp = require('sharp');
    console.log('✅ Sharp library found - generating PNG icons\n');
} catch (e) {
    console.log('❌ Sharp library not found');
    console.log('   Install with: npm install sharp\n');
    console.log('   Or use the HTML generator:');
    console.log('   1. Open scripts/generate-icons-simple.html in browser');
    console.log('   2. Click "Generate & Download Icons"');
    console.log('   3. Place downloaded files in app/assets/images/\n');
    process.exit(1);
}

// Create icons directory if it doesn't exist
const iconsDir = path.join(__dirname, '../app/assets/images');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate icons using sharp
async function generateIcons() {
    const color1 = '#667eea'; // Theme color 1
    const color2 = '#764ba2'; // Theme color 2
    
    console.log('Generating icons...\n');
    
    for (const size of iconSizes) {
        const pngPath = path.join(iconsDir, `icon-${size}x${size}.png`);
        
        try {
            // Create a gradient image with "T" letter
            const svg = `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#grad)" rx="${size * 0.2}"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.3}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">T</text>
</svg>`;
            
            // Convert SVG to PNG
            await sharp(Buffer.from(svg))
                .resize(size, size)
                .png()
                .toFile(pngPath);
            
            console.log(`✅ Created ${pngPath}`);
        } catch (error) {
            console.error(`❌ Failed to create ${pngPath}: ${error.message}`);
        }
    }
    
    console.log('\n✨ Icon generation complete!');
    console.log('\nIcons are ready at:');
    console.log(`  - ${path.join(iconsDir, 'icon-192x192.png')}`);
    console.log(`  - ${path.join(iconsDir, 'icon-512x512.png')}`);
    console.log('\nNext steps:');
    console.log('1. Review the generated icons');
    console.log('2. Replace with your actual logo/icon if needed');
    console.log('3. Test PWA installation');
    console.log('4. Clear browser cache and reload');
}

generateIcons().catch(console.error);

