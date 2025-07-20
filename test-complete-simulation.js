// Complete Profile Loading Simulation Test
const fetch = require('node-fetch');

async function simulateProfilePageLoad() {
    try {
        console.log('🌐 Simulating Complete Profile Page Load');
        console.log('=' .repeat(60));
        
        // Step 1: Login first
        console.log('\n🔐 Step 1: User Login');
        const loginResponse = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'ezy4@hotmail.com',
                password: '123456A'
            })
        });
        
        const loginData = await loginResponse.json();
        if (!loginData.success) {
            console.error('❌ Login failed:', loginData.error);
            return;
        }
        
        console.log('✅ Login successful');
        const sessionToken = loginData.sessionToken;
        const user = loginData.user;
        console.log('- User ID:', user.id);
        console.log('- Username:', user.username);
        console.log('- Session Token obtained');
        
        // Step 2: Validate session (what frontend would do)
        console.log('\n📡 Step 2: Session Validation');
        const sessionResponse = await fetch('http://localhost:3000/api/current-user', {
            headers: {
                'Authorization': `Bearer ${sessionToken}`
            }
        });
        
        const sessionData = await sessionResponse.json();
        if (!sessionData.authenticated) {
            console.error('❌ Session validation failed');
            return;
        }
        
        console.log('✅ Session valid');
        console.log('- Authenticated user:', sessionData.user.username);
        
        // Step 3: Load profile page HTML
        console.log('\n📄 Step 3: Load Profile Page HTML');
        const profilePageResponse = await fetch('http://localhost:3000/profile');
        
        if (profilePageResponse.status !== 200) {
            console.error('❌ Profile page failed to load:', profilePageResponse.status);
            return;
        }
        
        console.log('✅ Profile page HTML loaded');
        const html = await profilePageResponse.text();
        
        // Check for critical elements
        const criticalChecks = [
            { name: 'session.js script', pattern: '/js/session.js' },
            { name: 'loadUserProfile function', pattern: 'function loadUserProfile' },
            { name: 'showLoading function', pattern: 'function showLoading' },
            { name: 'hideLoading function', pattern: 'function hideLoading' },
            { name: 'showError function', pattern: 'function showError' },
            { name: 'DOMContentLoaded event', pattern: 'DOMContentLoaded' },
            { name: 'sessionManager usage', pattern: 'sessionManager.getCurrentUser' }
        ];
        
        console.log('\n🔍 Critical Element Checks:');
        let allGood = true;
        criticalChecks.forEach(check => {
            if (html.includes(check.pattern)) {
                console.log(`  ✅ ${check.name}`);
            } else {
                console.log(`  ❌ ${check.name} - MISSING`);
                allGood = false;
            }
        });
        
        // Step 4: Simulate JS resource loading
        console.log('\n📦 Step 4: JavaScript Resources');
        
        const jsResources = [
            '/js/session.js',
            '/components/navbar.js'
        ];
        
        for (const resource of jsResources) {
            const response = await fetch(`http://localhost:3000${resource}`);
            if (response.status === 200) {
                console.log(`  ✅ ${resource} loaded`);
            } else {
                console.log(`  ❌ ${resource} failed (${response.status})`);
                allGood = false;
            }
        }
        
        // Step 5: Simulate profile data API call
        console.log('\n📊 Step 5: Profile Data API');
        const profileDataResponse = await fetch(`http://localhost:3000/api/user/${user.id}`, {
            headers: {
                'Authorization': `Bearer ${sessionToken}`
            }
        });
        
        const profileData = await profileDataResponse.json();
        if (profileData.success) {
            console.log('✅ Profile data API working');
            console.log('- Username:', profileData.user.username);
            console.log('- Email:', profileData.user.email);
            console.log('- Country:', profileData.user.country);
        } else {
            console.log('❌ Profile data API failed:', profileData.error);
            allGood = false;
        }
        
        // Step 6: Contact countries API
        console.log('\n🌍 Step 6: Contact Countries API');
        const countriesResponse = await fetch(`http://localhost:3000/api/contact-countries/${user.id}`);
        const countriesData = await countriesResponse.json();
        
        if (countriesData.success) {
            console.log('✅ Contact countries API working');
            console.log('- Number of countries:', countriesData.countries.length);
        } else {
            console.log('❌ Contact countries API failed:', countriesData.error);
            allGood = false;
        }
        
        // Final Result
        console.log('\n🎯 FINAL RESULT');
        console.log('=' .repeat(40));
        
        if (allGood) {
            console.log('🎉 ✅ ALL SYSTEMS GO!');
            console.log('');
            console.log('The profile page should now load correctly with:');
            console.log('- Proper session management');
            console.log('- All JavaScript resources loading');
            console.log('- Working API endpoints');
            console.log('- Complete frontend functionality');
            console.log('');
            console.log('If you\'re still seeing "Unable to load profile",');
            console.log('try refreshing your browser or clearing browser cache.');
        } else {
            console.log('❌ Some issues detected that need fixing');
        }
        
    } catch (error) {
        console.error('❌ Simulation failed:', error);
    }
}

simulateProfilePageLoad();
