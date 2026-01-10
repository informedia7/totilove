// Lifestyle Filters Test - Run in browser console on /search page
(async function testLifestyleFilters() {
    console.log('🧪 Starting Lifestyle Filters Test...\n');
    
    const results = { passed: [], failed: [], warnings: [] };
    const testValues = {};
    
    // Wait for filters to load
    console.log('📋 Waiting for filters to load...');
    await new Promise(r => setTimeout(r, 2000));
    
    // Check dropdowns
    console.log('\n📋 Checking dropdowns...');
    const dropdowns = {
        education: document.getElementById('education-level'),
        occupation: document.getElementById('occupation'),
        income: document.getElementById('income-range'),
        lifestyle: document.getElementById('lifestyle'),
        smoking: document.getElementById('smoking'),
        drinking: document.getElementById('drinking'),
        children: document.getElementById('children')
    };
    
    // Verify and get test values
    for (const [key, el] of Object.entries(dropdowns)) {
        if (!el) {
            results.failed.push(`❌ ${key} dropdown missing`);
            continue;
        }
        results.passed.push(`✅ ${key} dropdown exists`);
        
        const opts = el.querySelectorAll('option');
        if (opts.length <= 1) {
            results.warnings.push(`⚠️ ${key} has no options`);
        } else {
            results.passed.push(`✅ ${key} has ${opts.length} options`);
            // Get first non-empty option
            for (let i = 1; i < opts.length; i++) {
                if (opts[i].value) {
                    testValues[key] = opts[i].value;
                    console.log(`   ${key}: "${opts[i].textContent}" (${opts[i].value})`);
                    break;
                }
            }
        }
    }
    
    // Set test values
    console.log('\n📋 Setting test values...');
    for (const [key, el] of Object.entries(dropdowns)) {
        if (el && testValues[key]) {
            el.value = testValues[key];
            results.passed.push(`✅ Set ${key} = ${testValues[key]}`);
        }
    }
    
    // Test collectFilters
    console.log('\n📋 Testing collectFilters()...');
    if (typeof collectFilters === 'function') {
        const filters = collectFilters();
        for (const key of Object.keys(testValues)) {
            if (filters[key] === testValues[key]) {
                results.passed.push(`✅ ${key} collected: ${filters[key]}`);
            } else {
                results.failed.push(`❌ ${key} mismatch: expected ${testValues[key]}, got ${filters[key]}`);
            }
        }
    } else {
        results.failed.push('❌ collectFilters() not found');
    }
    
    // Test URL preservation
    console.log('\n📋 Testing URL preservation...');
    if (typeof collectFilters === 'function') {
        const filters = collectFilters();
        const params = new URLSearchParams();
        Object.keys(filters).forEach(k => {
            const v = filters[k];
            if (typeof v === 'boolean') params.set(k, v.toString());
            else if (Array.isArray(v) && v.length > 0) params.set(k, v.join(','));
            else if (v && v !== '' && v !== 'any') params.set(k, v);
        });
        
        const urlStr = params.toString();
        const lifestyleParams = ['education', 'occupation', 'income', 'lifestyle', 'smoking', 'drinking', 'children'];
        let count = 0;
        for (const p of lifestyleParams) {
            if (filters[p] && filters[p] !== '' && filters[p] !== 'any') {
                if (urlStr.includes(`${p}=`)) {
                    results.passed.push(`✅ ${p} in URL`);
                    count++;
                } else {
                    results.failed.push(`❌ ${p} NOT in URL`);
                }
            }
        }
        console.log(`   ${count} lifestyle params in URL`);
    }
    
    // Test API
    console.log('\n📋 Testing API search...');
    try {
        const userId = window.currentUser?.id || 2;
        const params = new URLSearchParams();
        params.append('userId', userId);
        Object.entries(testValues).forEach(([k, v]) => {
            if (v) params.append(k, v);
        });
        params.append('page', '1');
        params.append('limit', '5');
        
        const res = await fetch(`/api/search?${params}`, {
            headers: { 'X-User-ID': userId }
        });
        const data = await res.json();
        
        if (data.success) {
            results.passed.push(`✅ API search: ${data.results?.length || 0} results`);
        } else {
            results.failed.push(`❌ API search failed: ${data.error}`);
        }
    } catch (e) {
        results.failed.push(`❌ API error: ${e.message}`);
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`✅ Passed: ${results.passed.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`⚠️  Warnings: ${results.warnings.length}`);
    if (results.failed.length > 0) {
        console.log('\n❌ FAILED:');
        results.failed.forEach(f => console.log(`   ${f}`));
    }
    console.log('='.repeat(50));
    
    return results;
})();

