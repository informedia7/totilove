const fs = require('fs');
const path = require('path');
const https = require('https');

// User image data from database
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

// High-quality realistic photo sources
const photoSources = {
    male: [
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1548142813-c348350df52b?w=500&h=500&fit=crop&crop=face'
    ],
    female: [
        'https://images.unsplash.com/photo-1494790108755-2616c27c8b2c?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1552058544-f2b08422138a?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1546961329-78bef0414d7c?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=500&h=500&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=500&h=500&fit=crop&crop=face'
    ]
};

// Function to download image from URL
function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Handle redirect
                https.get(response.headers.location, (redirectResponse) => {
                    if (redirectResponse.statusCode !== 200) {
                        reject(new Error(`Failed to download image: ${redirectResponse.statusCode}`));
                        return;
                    }
                    redirectResponse.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                    file.on('error', reject);
                }).on('error', reject);
            } else if (response.statusCode !== 200) {
                reject(new Error(`Failed to download image: ${response.statusCode}`));
                return;
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
                file.on('error', reject);
            }
        }).on('error', reject);
    });
}

// Download realistic photos
async function downloadRealisticPhotos() {
    const uploadsDir = path.join(__dirname, 'public', 'uploads', 'profile_images');
    
    console.log('📸 Downloading high-quality realistic photos...\n');
    
    for (const image of userImages) {
        try {
            const genderPhotos = photoSources[image.gender];
            const photoIndex = image.id % genderPhotos.length;
            const photoUrl = genderPhotos[photoIndex];
            
            const filepath = path.join(uploadsDir, image.filename);
            
            console.log(`📥 Downloading ${image.gender} photo for ${image.filename}...`);
            console.log(`🔗 Source: ${photoUrl}`);
            
            await downloadImage(photoUrl, filepath);
            
            // Verify the file was downloaded successfully
            const stats = fs.statSync(filepath);
            if (stats.size > 1000) { // At least 1KB
                console.log(`✅ Success: ${image.filename} (${Math.round(stats.size/1024)}KB) for user ${image.user_id} ${image.is_primary ? '(PRIMARY)' : ''}`);
            } else {
                console.log(`⚠️  Small file: ${image.filename} (${stats.size} bytes) - may be placeholder`);
            }
            
            // Add delay to be respectful to the service
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.error(`❌ Failed to download ${image.filename}:`, error.message);
        }
    }
    
    console.log(`\n🎉 Completed downloading realistic photos!`);
    console.log(`📁 Images saved to: ${uploadsDir}`);
    console.log(`🌐 You can now view your dating site with realistic profile photos!`);
}

// Run the download
downloadRealisticPhotos().catch(console.error);
