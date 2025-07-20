const fs = require('fs');
const path = require('path');
const https = require('https');

// User image data from your table
const userImages = [
    { id: 99, user_id: 98, filename: "admin_679f586692b20.jpg", is_primary: 0, gender: 'male', age: 35 },
    { id: 100, user_id: 98, filename: "admin_679f58669314d.jpg", is_primary: 1, gender: 'male', age: 35 },
    { id: 101, user_id: 98, filename: "admin_679f586693610.jpg", is_primary: 0, gender: 'male', age: 35 },
    { id: 102, user_id: 98, filename: "admin_679f586693e50.jpg", is_primary: 0, gender: 'male', age: 35 },
    { id: 104, user_id: 99, filename: "user1_679f5f0a8e9ed.jpg", is_primary: 0, gender: 'female', age: 28 },
    { id: 105, user_id: 99, filename: "user1_679f61537af29.jpg", is_primary: 1, gender: 'female', age: 28 },
    { id: 106, user_id: 99, filename: "user1_679f637f0bc81.jpg", is_primary: 0, gender: 'female', age: 28 },
    { id: 107, user_id: 99, filename: "user1_679f65c699a2f.jpg", is_primary: 0, gender: 'female', age: 28 },
    { id: 108, user_id: 99, filename: "user1_679f65c69a0e5.jpg", is_primary: 0, gender: 'female', age: 28 },
    { id: 109, user_id: 99, filename: "user1_679f65c69a9ad.jpg", is_primary: 0, gender: 'female', age: 28 },
    { id: 110, user_id: 100, filename: "test1_67a334557e471.jpg", is_primary: 0, gender: 'male', age: 24 },
    { id: 111, user_id: 100, filename: "test1_67a33be44da0b.jpg", is_primary: 1, gender: 'male', age: 24 },
    { id: 112, user_id: 101, filename: "user2_67a75f062895f.jpg", is_primary: 1, gender: 'female', age: 30 },
    { id: 113, user_id: 101, filename: "user2_67a75f1cd4d72.jpg", is_primary: 0, gender: 'female', age: 30 },
    { id: 123, user_id: 106, filename: "106_1746964118.jpg", is_primary: 0, gender: 'male', age: 26 },
    { id: 124, user_id: 106, filename: "106_1746964237.jpg", is_primary: 0, gender: 'male', age: 26 },
    { id: 127, user_id: 106, filename: "106_1746965197.jpg", is_primary: 0, gender: 'male', age: 26 },
    { id: 128, user_id: 106, filename: "106_1746965259.jpg", is_primary: 1, gender: 'male', age: 26 },
    { id: 129, user_id: 106, filename: "106_1746965858.jpg", is_primary: 0, gender: 'male', age: 26 },
    { id: 134, user_id: 106, filename: "106_1747030333.jpg", is_primary: 0, gender: 'male', age: 26 },
    { id: 135, user_id: 109, filename: "109_1747140789.jpg", is_primary: 0, gender: 'female', age: 32 },
    { id: 136, user_id: 109, filename: "109_1747140817.jpg", is_primary: 1, gender: 'female', age: 32 }
];

// Function to download image from URL
function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download image: ${response.statusCode}`));
                return;
            }
            
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
            file.on('error', reject);
        }).on('error', reject);
    });
}

// Generate realistic profile photos
async function generateRealisticImages() {
    const uploadsDir = path.join(__dirname, 'public', 'uploads', 'profile_images');
    
    console.log('🎭 Generating realistic profile images...\n');
    
    for (const image of userImages) {
        try {
            // Using different AI-generated face services for variety
            // Use multiple high-quality image sources for better reliability and quality
            const imageServices = [
                // Picsum Photos with face filter (600x600)
                () => `https://picsum.photos/600/600?random=${image.id}`,
                
                // UI Faces (high quality, real people) - using Unsplash as fallback
                () => image.gender === 'male' 
                    ? `https://images.unsplash.com/photo-${1500000000 + (image.id * 1234567) % 200000000}?w=500&h=500&fit=crop&crop=face` 
                    : `https://images.unsplash.com/photo-${1600000000 + (image.id * 7654321) % 200000000}?w=500&h=500&fit=crop&crop=face`,
                
                // RandomUser.me standard (fallback to working format)
                () => {
                    const availableIds = image.gender === 'male' 
                        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 23, 24, 25, 26, 27, 28, 29]
                        : [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 23, 24, 25, 26, 27, 28, 29];
                    const randomId = availableIds[image.id % availableIds.length];
                    return `https://randomuser.me/api/portraits/${image.gender === 'male' ? 'men' : 'women'}/${randomId}.jpg`;
                }
            ];
            
            // Try different services based on image ID for variety
            const imageServiceIndex = image.id % imageServices.length;
            const imageUrl = imageServices[imageServiceIndex]();
            
            const filepath = path.join(uploadsDir, image.filename);
            
            console.log(`📸 Downloading ${image.gender} portrait for ${image.filename}...`);
            await downloadImage(imageUrl, filepath);
            
            console.log(`✅ Created: ${image.filename} for user ${image.user_id} ${image.is_primary ? '(PRIMARY)' : ''}`);
            
            // Add small delay to avoid overwhelming the service
            await new Promise(resolve => setTimeout(resolve, 200));
            
        } catch (error) {
            console.error(`❌ Failed to download ${image.filename}:`, error.message);
            
            // Create a fallback realistic-looking SVG if download fails
            const fallbackSvg = createFallbackRealisticImage(image);
            const svgPath = path.join(uploadsDir, image.filename.replace('.jpg', '_fallback.svg'));
            fs.writeFileSync(svgPath, fallbackSvg);
            console.log(`🎨 Created fallback SVG: ${image.filename.replace('.jpg', '_fallback.svg')}`);
        }
    }
    
    console.log(`\n🎉 Completed generating realistic profile images!`);
    console.log(`📁 Images saved to: ${uploadsDir}`);
}

// Fallback realistic SVG creator
function createFallbackRealisticImage(image) {
    const hairColors = ['#2C1B18', '#8B4513', '#D2691E', '#DAA520', '#FF6347', '#800080'];
    const skinTones = ['#FDBCB4', '#EDB98A', '#FD9841', '#E8B982', '#C68642', '#8D5524'];
    const eyeColors = ['#4A4A4A', '#8B4513', '#228B22', '#0000FF', '#800080'];
    
    const hairColor = hairColors[image.id % hairColors.length];
    const skinTone = skinTones[image.id % skinTones.length];
    const eyeColor = eyeColors[image.id % eyeColors.length];
    const isSmiling = image.is_primary || Math.random() > 0.5;
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <radialGradient id="bg-gradient" cx="50%" cy="30%" r="70%">
            <stop offset="0%" style="stop-color:#f0f8ff;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#e6f3ff;stop-opacity:1" />
        </radialGradient>
        <filter id="softShadow">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
            <feOffset dx="2" dy="2" result="offset"/>
            <feFlood flood-color="#000000" flood-opacity="0.2"/>
            <feComposite in2="offset" operator="in"/>
            <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
        </filter>
    </defs>
    
    <!-- Background -->
    <rect width="400" height="400" fill="url(#bg-gradient)"/>
    
    <!-- Face -->
    <ellipse cx="200" cy="180" rx="80" ry="100" fill="${skinTone}" filter="url(#softShadow)"/>
    
    <!-- Hair -->
    <ellipse cx="200" cy="120" rx="90" ry="60" fill="${hairColor}"/>
    <ellipse cx="200" cy="100" rx="85" ry="40" fill="${hairColor}"/>
    
    <!-- Eyes -->
    <ellipse cx="175" cy="160" rx="12" ry="8" fill="white"/>
    <ellipse cx="225" cy="160" rx="12" ry="8" fill="white"/>
    <circle cx="175" cy="160" r="6" fill="${eyeColor}"/>
    <circle cx="225" cy="160" r="6" fill="${eyeColor}"/>
    <circle cx="177" cy="158" r="2" fill="white"/>
    <circle cx="227" cy="158" r="2" fill="white"/>
    
    <!-- Eyebrows -->
    <ellipse cx="175" cy="145" rx="15" ry="3" fill="${hairColor}"/>
    <ellipse cx="225" cy="145" rx="15" ry="3" fill="${hairColor}"/>
    
    <!-- Nose -->
    <ellipse cx="200" cy="180" rx="8" ry="12" fill="${skinTone}" opacity="0.8"/>
    <ellipse cx="196" cy="185" rx="2" ry="3" fill="${skinTone}" opacity="0.6"/>
    <ellipse cx="204" cy="185" rx="2" ry="3" fill="${skinTone}" opacity="0.6"/>
    
    <!-- Mouth -->
    ${isSmiling ? 
        `<path d="M 180 200 Q 200 215 220 200" stroke="#d4716b" stroke-width="3" fill="none"/>
         <ellipse cx="200" cy="205" rx="15" ry="8" fill="#ff6b6b" opacity="0.8"/>` :
        `<ellipse cx="200" cy="205" rx="12" ry="4" fill="#d4716b"/>`
    }
    
    <!-- Clothing -->
    <rect x="120" y="280" width="160" height="120" fill="#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}" rx="20"/>
    
    <!-- Accessories (sometimes) -->
    ${Math.random() > 0.6 ? '<rect x="165" y="140" width="70" height="25" fill="none" stroke="#333" stroke-width="2" rx="12"/>' : ''}
    
    ${image.is_primary ? '<circle cx="350" cy="50" r="20" fill="#FFD700"/><text x="350" y="58" font-family="Arial" font-size="24" text-anchor="middle" fill="white">★</text>' : ''}
</svg>`;
}

// Run the generator
generateRealisticImages().catch(console.error);
