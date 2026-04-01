/**
 * Standalone test script for ProfileDataProcessor
 * Run with: node routers/utils/test-profileDataProcessor.js
 */

const ProfileDataProcessor = require('./profileDataProcessor');

// Test data simulating profile data from form submission
const testCases = [
    {
        name: "Test 1: relationship_type is 'Any'",
        input: {
            relationship_type: 'Any',
            preferred_gender: 'male',
            preferred_age_min: 25,
            preferred_age_max: 35
        },
        expected: {
            relationship_type: null,  // Should be converted to null
            preferred_gender: 'male',
            preferred_age_min: 25,
            preferred_age_max: 35
        }
    },
    {
        name: "Test 2: relationship_type is 'Serious Relationship'",
        input: {
            relationship_type: 'Serious Relationship',
            preferred_gender: 'female',
            preferred_body_type: 'Any'
        },
        expected: {
            relationship_type: 'Serious Relationship',  // Should remain unchanged
            preferred_gender: 'female',
            // preferred_body_type should be deleted
        }
    },
    {
        name: "Test 3: relationship_type is empty string",
        input: {
            relationship_type: '',
            preferred_smoking: 'Any',
            preferred_drinking: 'Not specified'
        },
        expected: {
            relationship_type: null,  // Should be converted to null
            // preferred_smoking and preferred_drinking should be deleted
        }
    },
    {
        name: "Test 4: Multiple 'Any' values",
        input: {
            relationship_type: 'Any',
            preferred_education: 'Any',
            preferred_religion: 'Not specified',
            preferred_occupation: 'Engineer'
        },
        expected: {
            relationship_type: null,  // Should be null
            preferred_occupation: 'Engineer',  // Should remain
            // preferred_education and preferred_religion should be deleted
        }
    }
];

console.log('🧪 Testing ProfileDataProcessor\n');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
    console.log(`\n${index + 1}. ${testCase.name}`);
    console.log('-'.repeat(60));
    
    // Create a copy of input to avoid mutation issues
    const inputCopy = JSON.parse(JSON.stringify(testCase.input));
    
    // Process the data
    const result = ProfileDataProcessor.process(inputCopy);
    
    // Check results
    let testPassed = true;
    const errors = [];
    
    // Check that expected values are present
    for (const [key, expectedValue] of Object.entries(testCase.expected)) {
        if (result[key] !== expectedValue) {
            testPassed = false;
            errors.push(`  ❌ ${key}: expected "${expectedValue}", got "${result[key]}"`);
        } else {
            console.log(`  ✅ ${key}: ${JSON.stringify(result[key])}`);
        }
    }
    
    // Check that fields that should be deleted are actually deleted
    const fieldsToDelete = ['preferred_body_type', 'preferred_education', 'preferred_religion', 
                           'preferred_smoking', 'preferred_drinking', 'preferred_children',
                           'preferred_gender', 'preferred_eye_color', 'preferred_hair_color',
                           'preferred_ethnicity', 'preferred_occupation', 'preferred_income',
                           'preferred_marital_status', 'preferred_lifestyle', 'preferred_body_art',
                           'preferred_english_ability'];
    
    for (const field of fieldsToDelete) {
        if (testCase.input[field] === 'Any' || testCase.input[field] === 'Not specified' || testCase.input[field] === '') {
            if (result[field] !== undefined) {
                testPassed = false;
                errors.push(`  ❌ ${field}: should be deleted, but still exists as "${result[field]}"`);
            }
        }
    }
    
    if (testPassed) {
        console.log(`  ✅ Test PASSED`);
        passed++;
    } else {
        console.log(`  ❌ Test FAILED`);
        errors.forEach(err => console.log(err));
        failed++;
    }
});

console.log('\n' + '='.repeat(60));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
    console.log('✅ All tests passed!\n');
    process.exit(0);
} else {
    console.log('❌ Some tests failed.\n');
    process.exit(1);
}














