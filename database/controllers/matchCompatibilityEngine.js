/*****************************************************************
 * COMPATIBILITY ENGINE
 * Calculates compatibility scores based on soft traits
 * Anti-gaming measures built-in
 *****************************************************************/

class CompatibilityEngine {
    constructor(db, redis = null) {
        this.db = db;
        this.redis = redis;
    }

    /**
     * Calculate age score based on age difference and preferred age range
     * 
     * @param {number} userAge - Current user's age
     * @param {number} matchAge - Matched user's age
     * @param {number|null} prefMin - Preferred minimum age (null if not set)
     * @param {number|null} prefMax - Preferred maximum age (null if not set)
     * @returns {number} Age score (0-15 points)
     */
    calculateAgeScore(userAge, matchAge, prefMin, prefMax) {
        const maxPoints = 15; // Maximum age score
        const diff = Math.abs(userAge - matchAge);

        // Base score decreases by 1 point per year difference, minimum 0
        let score = Math.max(maxPoints - diff, 0);

        // Apply penalty if match is outside preferred age range
        // Penalty: 50% reduction (exact, not floored) applied before scaling
        if (prefMin !== null && prefMax !== null) {
            if (matchAge < prefMin || matchAge > prefMax) {
                score = score / 2; // Exact 50% penalty (not floored)
            }
        }

        return score;
    }

    /**
     * Calculate age difference modifier based on age gap bands
     * 
     * @param {number} ageDiff - Age difference in years (absolute value)
     * @returns {number} Modifier points (-5 to +2)
     */
    getAgeDifferenceModifier(ageDiff) {
        if (ageDiff <= 2) {
            return 2;  // 0-2 years: +2 points
        } else if (ageDiff <= 5) {
            return 1;  // 3-5 years: +1 point
        } else if (ageDiff <= 9) {
            return 0;  // 6-9 years: 0 points
        } else if (ageDiff <= 14) {
            return -2; // 10-14 years: -2 points
        } else {
            return -5; // 15+ years: -5 points
        }
    }

    /**
     * Calculate age from birthdate
     * 
     * @param {Date|string} birthdate - Birthdate
     * @returns {number|null} Age in years
     */
    calculateAge(birthdate) {
        if (!birthdate) return null;
        
        const birth = new Date(birthdate);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        
        return age;
    }

    /**
     * Calculate preference matching score
     * Compares User A's preferences with User B's attributes (and vice versa)
     * Returns a score from 0-5 points based on how well preferences match attributes
     * 
     * @param {Object} userA - User A data (with preferences and attributes)
     * @param {Object} userB - User B data (with preferences and attributes)
     * @returns {number} Preference matching score (0-5 points)
     */
    calculatePreferenceMatchingScore(userA, userB) {
        let matchCount = 0;
        let totalChecks = 0;

        // Helper function to normalize and compare ID values (handles string/number conversion)
        const matchesId = (prefId, attrId) => {
            if (!prefId || !attrId) return false;
            // Convert to strings and compare (handles "0" as not important)
            const prefStr = String(prefId).trim();
            const attrStr = String(attrId).trim();
            if (prefStr === '0' || prefStr === '' || attrStr === '' || attrStr === 'null') return false;
            return prefStr === attrStr;
        };

        // Helper function to compare height/weight (handles "0" as "not important")
        const matchesHeightWeight = (pref, attr) => {
            if (!pref || !attr) return false;
            const prefStr = String(pref).trim();
            if (prefStr === '0' || prefStr === '') return false; // "0" means "not important"
            const prefNum = parseFloat(prefStr);
            const attrNum = parseFloat(attr);
            if (isNaN(prefNum) || isNaN(attrNum)) return false;
            // Allow 5% tolerance for height/weight matching
            const tolerance = Math.max(prefNum * 0.05, 2); // At least 2 units tolerance
            return Math.abs(prefNum - attrNum) <= tolerance;
        };

        // Compare User A's preferences with User B's attributes
        const preferencesToCheck = [
            { pref: 'preferred_height', attr: 'height_cm', compare: matchesHeightWeight },
            { pref: 'preferred_weight', attr: 'weight_kg', compare: matchesHeightWeight },
            { pref: 'preferred_exercise', attr: 'exercise_habits_id', compare: matchesId },
            { pref: 'preferred_body_type', attr: 'body_type_id', compare: matchesId },
            { pref: 'preferred_lifestyle', attr: 'lifestyle_id', compare: matchesId },
            { pref: 'preferred_body_art', attr: 'body_art_id', compare: matchesId },
            { pref: 'preferred_education', attr: 'education_id', compare: matchesId },
            { pref: 'preferred_occupation', attr: 'occupation_category_id', compare: matchesId },
            { pref: 'preferred_income', attr: 'income_id', compare: matchesId },
            { pref: 'preferred_religion', attr: 'religion_id', compare: matchesId },
            { pref: 'preferred_smoking', attr: 'smoking_preference_id', compare: matchesId },
            { pref: 'preferred_drinking', attr: 'drinking_preference_id', compare: matchesId },
            { pref: 'preferred_number_of_children', attr: 'number_of_children_id', compare: matchesId },
            { pref: 'preferred_marital_status', attr: 'marital_status_id', compare: matchesId },
            { pref: 'preferred_ethnicity', attr: 'ethnicity_id', compare: matchesId },
            { pref: 'preferred_eye_color', attr: 'eye_color_id', compare: matchesId },
            { pref: 'preferred_hair_color', attr: 'hair_color_id', compare: matchesId },
            { pref: 'preferred_english_ability', attr: 'english_ability_id', compare: matchesId }
        ];

        // Check User A preferences vs User B attributes
        for (const check of preferencesToCheck) {
            if (userA[check.pref] && userB[check.attr]) {
                totalChecks++;
                if (check.compare(userA[check.pref], userB[check.attr])) matchCount++;
            }
        }

        // Check User B preferences vs User A attributes (bidirectional)
        for (const check of preferencesToCheck) {
            if (userB[check.pref] && userA[check.attr]) {
                totalChecks++;
                if (check.compare(userB[check.pref], userA[check.attr])) matchCount++;
            }
        }

        // Special handling for children (have_children) - uses boolean-like comparison
        if (userA.preferred_children && userB.have_children) {
            totalChecks++;
            const prefChildren = String(userA.preferred_children).toLowerCase().trim();
            const attrChildren = String(userB.have_children).toLowerCase().trim();
            const prefHasChildren = prefChildren === '1' || prefChildren === 'yes' || prefChildren === 'true';
            const attrHasChildren = attrChildren === '1' || attrChildren === 'yes' || attrChildren === 'true';
            if (prefHasChildren === attrHasChildren) matchCount++;
        }
        if (userB.preferred_children && userA.have_children) {
            totalChecks++;
            const prefChildren = String(userB.preferred_children).toLowerCase().trim();
            const attrChildren = String(userA.have_children).toLowerCase().trim();
            const prefHasChildren = prefChildren === '1' || prefChildren === 'yes' || prefChildren === 'true';
            const attrHasChildren = attrChildren === '1' || attrChildren === 'yes' || attrChildren === 'true';
            if (prefHasChildren === attrHasChildren) matchCount++;
        }

        // Calculate score: if we have checks, give points based on match rate
        // Maximum 5 points (if all preferences match)
        if (totalChecks > 0) {
            const matchRate = matchCount / totalChecks;
            return matchRate * 5; // Scale to 0-5 points
        }

        return 0; // No preferences to check
    }

    /**
     * Calculate distance in kilometers between two lat/lng points
     * Uses the Haversine formula
     * 
     * @param {number} lat1 - Latitude of first point
     * @param {number} lon1 - Longitude of first point
     * @param {number} lat2 - Latitude of second point
     * @param {number} lon2 - Longitude of second point
     * @returns {number|null} Distance in km, or null if coordinates are invalid
     */
    calculateDistanceKm(lat1, lon1, lat2, lon2) {
        if ([lat1, lon1, lat2, lon2].some(v => v === null || v === undefined)) {
            return null;
        }
        
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    /**
     * Get distance/region modifier points
     * Positive for nearby, negative for far away
     * 
     * @param {number} distanceKm - Distance in kilometers
     * @returns {number} Modifier points (-4 to +3)
     */
    getDistanceModifier(distanceKm) {
        if (distanceKm === null || distanceKm === undefined) {
            return 0; // No modifier if distance cannot be calculated
        }
        
        if (distanceKm <= 10) return 3;      // Same city/neighborhood: +3 points
        if (distanceKm <= 50) return 2;     // Same region: +2 points
        if (distanceKm <= 200) return 1;    // Nearby region: +1 point
        if (distanceKm <= 1000) return 0;   // Within country: 0 points
        if (distanceKm <= 5000) return -2;  // Distant in country or nearby country: -2 points
        return -4;                          // Very far away (different continent): -4 points
    }

    /**
     * Calculate compatibility score between two users
     * Based on: Values (32%), Intent (18%), Lifestyle (18%), Personality (17%), Interests (12%)
     * Total: 97% (remaining 3% = system buffer for rounding/decay)
     * Age difference modifier applied as points (-5 to +2)
     * 
     * @param {Object} userA - Current user data (may include birthdate or age, age_pref_min, age_pref_max)
     * @param {Object} userB - Matched user data (may include birthdate or age)
     * @returns {number} Compatibility score (30-99)
     */
    calculateCompatibility(userA, userB) {
        // Interests (12%) – diminishing returns
        const interestsA = userA.interests || [];
        const interestsB = userB.interests || [];
        const sharedInterests = interestsA.filter(i => 
            interestsB.some(b => b.id === i.id || b.interest_id === i.interest_id || b === i)
        );
        
        let interestScore = 0;
        if (interestsA.length > 0 || interestsB.length > 0) {
            const maxInterests = Math.max(interestsA.length, interestsB.length, 1);
            interestScore = sharedInterests.length / maxInterests;
            
            // Anti-gaming: Penalize users with too many interests
            if (interestsA.length > 10 || interestsB.length > 10) {
                interestScore *= 0.85;
            }
        } else {
            // Both users have no interests - give neutral score (0.5) instead of 0
            // This prevents penalizing users who haven't set interests yet
            interestScore = 0.5;
        }

        // Values (32%) - Religion, Family Status (children), Marital Status
        let valueScore = 0;
        let valueCount = 0;
        
        // Religion match
        if (userA.religion_id && userB.religion_id) {
            valueCount++;
            if (userA.religion_id === userB.religion_id) {
                valueScore += 1;
            } else {
                valueScore += 0.3; // Partial match
            }
        }
        
        // Family status (children)
        // have_children is VARCHAR, compare as strings (e.g., "1", "0", "yes", "no")
        if (userA.have_children && userB.have_children) {
            valueCount++;
            // Normalize values for comparison (treat "1", "yes", "true" as same, "0", "no", "false" as same)
            const aChildren = String(userA.have_children).toLowerCase().trim();
            const bChildren = String(userB.have_children).toLowerCase().trim();
            const aHasChildren = aChildren === '1' || aChildren === 'yes' || aChildren === 'true';
            const bHasChildren = bChildren === '1' || bChildren === 'yes' || bChildren === 'true';
            
            if (aHasChildren === bHasChildren) {
                valueScore += 1;
            } else {
                valueScore += 0.5; // Partial match
            }
        }
        
        // Marital status
        if (userA.marital_status_id && userB.marital_status_id) {
            valueCount++;
            if (userA.marital_status_id === userB.marital_status_id) {
                valueScore += 1;
            } else {
                valueScore += 0.4; // Partial match
            }
        }
        
        if (valueCount > 0) {
            valueScore = valueScore / valueCount;
        }

        // Intent (18%) - Relationship type preference
        let intentScore = 0;
        if (userA.relationship_type && userB.relationship_type) {
            if (userA.relationship_type === userB.relationship_type) {
                intentScore = 1; // Perfect match
            } else {
                // Partial match - some relationship types are more compatible than others
                // For now, use a lower score for mismatches
                intentScore = 0.2; // Low match
            }
        } else if (userA.relationship_type || userB.relationship_type) {
            // One user has intent, other doesn't - neutral score
            intentScore = 0.5;
        }

        // Lifestyle (18%) - Smoking, Drinking, Exercise, Living Situation
        let lifestyleScore = 0;
        let lifestyleCount = 0;
        
        // Smoking
        if (userA.smoking_preference_id && userB.smoking_preference_id) {
            lifestyleCount++;
            if (userA.smoking_preference_id === userB.smoking_preference_id) {
                lifestyleScore += 1;
            } else {
                lifestyleScore += 0.3;
            }
        }
        
        // Drinking
        if (userA.drinking_preference_id && userB.drinking_preference_id) {
            lifestyleCount++;
            if (userA.drinking_preference_id === userB.drinking_preference_id) {
                lifestyleScore += 1;
            } else {
                lifestyleScore += 0.4;
            }
        }
        
        // Exercise
        if (userA.exercise_habits_id && userB.exercise_habits_id) {
            lifestyleCount++;
            if (userA.exercise_habits_id === userB.exercise_habits_id) {
                lifestyleScore += 1;
            } else {
                lifestyleScore += 0.5;
            }
        }
        
        // Living situation
        if (userA.living_situation_id && userB.living_situation_id) {
            lifestyleCount++;
            if (userA.living_situation_id === userB.living_situation_id) {
                lifestyleScore += 1;
            } else {
                lifestyleScore += 0.4;
            }
        }
        
        // Lifestyle preference
        if (userA.lifestyle_id && userB.lifestyle_id) {
            lifestyleCount++;
            if (userA.lifestyle_id === userB.lifestyle_id) {
                lifestyleScore += 1;
            } else {
                lifestyleScore += 0.3;
            }
        }
        
        if (lifestyleCount > 0) {
            lifestyleScore = lifestyleScore / lifestyleCount;
        }

        // Personality (17%) - Derived from various attributes
        // Use education, occupation, and hobbies as personality indicators
        let personalityScore = 0;
        let personalityCount = 0;
        
        // Education level similarity
        if (userA.education_id && userB.education_id) {
            personalityCount++;
            if (userA.education_id === userB.education_id) {
                personalityScore += 1;
            } else {
                // Calculate similarity based on education levels
                const eduDiff = Math.abs(userA.education_id - userB.education_id);
                personalityScore += Math.max(0, 1 - (eduDiff * 0.2));
            }
        }
        
        // Occupation category similarity
        if (userA.occupation_category_id && userB.occupation_category_id) {
            personalityCount++;
            if (userA.occupation_category_id === userB.occupation_category_id) {
                personalityScore += 1;
            } else {
                personalityScore += 0.3;
            }
        }
        
        // Hobbies overlap (if available)
        // Only count if at least one user has hobbies (empty arrays should not be counted)
        if (userA.hobbies && userB.hobbies && Array.isArray(userA.hobbies) && Array.isArray(userB.hobbies) &&
            (userA.hobbies.length > 0 || userB.hobbies.length > 0)) {
            personalityCount++;
            const sharedHobbies = userA.hobbies.filter(h => 
                userB.hobbies.some(b => b.id === h.id || b.hobby_id === h.hobby_id || b === h)
            );
            const maxHobbies = Math.max(userA.hobbies.length, userB.hobbies.length, 1);
            personalityScore += sharedHobbies.length / maxHobbies;
        }
        
        if (personalityCount > 0) {
            personalityScore = personalityScore / personalityCount;
        }

        // Preference Matching Score - Compare user preferences with matched user's attributes
        // This checks if User A's preferences match User B's attributes (and vice versa)
        const preferenceScore = this.calculatePreferenceMatchingScore(userA, userB);

        // Calculate total score
        // Weights: Values (32%), Intent (18%), Lifestyle (18%), Personality (17%), Interests (12%), Preferences (5%) = 102%
        // Note: Preferences score is added as a modifier (up to 5 points)
        let total =
            valueScore * 32 +
            intentScore * 18 +
            lifestyleScore * 18 +
            personalityScore * 17 +
            interestScore * 12;
        
        // Add preference matching score (0-5 points)
        total += preferenceScore;

        // Check if we have any meaningful data to base the score on
        const hasData = (
            (userA.interests && userA.interests.length > 0) || (userB.interests && userB.interests.length > 0) ||
            (userA.hobbies && userA.hobbies.length > 0) || (userB.hobbies && userB.hobbies.length > 0) ||
            userA.religion_id || userB.religion_id ||
            userA.marital_status_id || userB.marital_status_id ||
            userA.relationship_type || userB.relationship_type ||
            userA.smoking_preference_id || userB.smoking_preference_id ||
            userA.drinking_preference_id || userB.drinking_preference_id ||
            userA.exercise_habits_id || userB.exercise_habits_id ||
            userA.living_situation_id || userB.living_situation_id ||
            userA.lifestyle_id || userB.lifestyle_id ||
            userA.education_id || userB.education_id ||
            userA.occupation_category_id || userB.occupation_category_id
        );

        // Apply age score (0-15 points) based on age difference and preferences
        let ageScore = 0;
        if (userA.birthdate || userA.age || userB.birthdate || userB.age) {
            const ageA = userA.age || this.calculateAge(userA.birthdate);
            const ageB = userB.age || this.calculateAge(userB.birthdate);
            
            if (ageA !== null && ageB !== null) {
                // Use new calculateAgeScore if preferences are available
                if (userA.age_pref_min !== undefined || userA.age_pref_max !== undefined) {
                    ageScore = this.calculateAgeScore(
                        ageA, 
                        ageB, 
                        userA.age_pref_min || null, 
                        userA.age_pref_max || null
                    );
                    // Convert 0-15 points to percentage contribution (scale to ~5% of total)
                    total += (ageScore / 15) * 5; // Max 5 points from age score
                } else {
                    // Fallback to old age difference modifier
                const ageDiff = Math.abs(ageA - ageB);
                    const ageModifier = this.getAgeDifferenceModifier(ageDiff);
                total += ageModifier; // Add/subtract points
                }
            }
        }

        // Apply distance/region modifier (points, not percentage)
        // Positive for nearby, negative for far away
        // Uses Haversine formula to calculate distance between coordinates
        let distanceModifier = 0;
        if (
            userA.latitude !== undefined && userA.longitude !== undefined &&
            userB.latitude !== undefined && userB.longitude !== undefined
        ) {
            const distanceKm = this.calculateDistanceKm(
                userA.latitude, userA.longitude,
                userB.latitude, userB.longitude
            );
            distanceModifier = this.getDistanceModifier(distanceKm);
            total += distanceModifier;
        }

        // Check if same country (needed for perfect match bonus calculation)
        const sameCountry = userA.country_id && userB.country_id && userA.country_id === userB.country_id;
        
        // Check for perfect attribute match bonus
        // If all major attributes match perfectly, add bonus points
        // BUT: Country match affects the maximum possible score
        let perfectMatchBonus = 0;
        const perfectMatches = {
            religion: userA.religion_id && userB.religion_id && userA.religion_id === userB.religion_id,
            marital: userA.marital_status_id && userB.marital_status_id && userA.marital_status_id === userB.marital_status_id,
            relationship: userA.relationship_type && userB.relationship_type && userA.relationship_type === userB.relationship_type,
            smoking: userA.smoking_preference_id && userB.smoking_preference_id && userA.smoking_preference_id === userB.smoking_preference_id,
            drinking: userA.drinking_preference_id && userB.drinking_preference_id && userA.drinking_preference_id === userB.drinking_preference_id,
            exercise: userA.exercise_habits_id && userB.exercise_habits_id && userA.exercise_habits_id === userB.exercise_habits_id,
            lifestyle: userA.lifestyle_id && userB.lifestyle_id && userA.lifestyle_id === userB.lifestyle_id,
            education: userA.education_id && userB.education_id && userA.education_id === userB.education_id,
            occupation: userA.occupation_category_id && userB.occupation_category_id && userA.occupation_category_id === userB.occupation_category_id
        };
        
        const matchCount = Object.values(perfectMatches).filter(m => m).length;
        const totalChecks = Object.keys(perfectMatches).length;
        
        // If 8+ out of 9 attributes match perfectly, add bonus
        // Same country: can reach 95% (bonus +7, then +3 country = 95%)
        // Different country: can reach 92% (bonus +4 only, no country bonus)
        if (matchCount >= 8 && totalChecks >= 8) {
            if (sameCountry) {
                perfectMatchBonus = 7; // Bonus to push perfect matches to 95% (with country bonus)
            } else {
                perfectMatchBonus = 4; // Reduced bonus for different countries (max 92%)
            }
        }

        // Determine max score based on country match
        // Same country: can reach 95%
        // Different country: max 92% (to reflect geographic distance)
        const maxScore = sameCountry ? 95 : 92;
        
        // Floor & ceiling (anti-gaming) - ensure score is between 30 and maxScore
        // BUT: Only apply floor if we have some data to base the score on
        // If no data exists, allow lower scores (minimum 0) to reflect incomplete profiles
        let finalScore;
        if (hasData) {
            // User has some profile data - apply floor of 30
            finalScore = Math.max(30, Math.min(maxScore, Math.round(total + perfectMatchBonus)));
        } else {
            // No profile data - allow lower scores, but cap at maxScore
            // This will show very low scores for users with incomplete profiles
            finalScore = Math.max(0, Math.min(maxScore, Math.round(total + perfectMatchBonus)));
        }

        // Apply country modifier AFTER flooring to ensure it's visible
        // Same country: +3 points, Different country: 0 points
        // This ensures country advantages are preserved even when scores hit the floor
        let countryModifier = 0;
        if (userA.country_id && userB.country_id) {
            if (userA.country_id === userB.country_id) {
                countryModifier = 3; // Same country: +3 points
            } else {
                countryModifier = 0; // Different country: 0 points
            }
            finalScore = Math.min(maxScore, finalScore + countryModifier);
        }

        return finalScore;
    }

    /**
     * Get compatibility score with caching (Redis + DB)
     * 
     * @param {number} userAId - Current user ID
     * @param {number} userBId - Matched user ID
     * @param {Object} userAData - Current user data
     * @param {Object} userBData - Matched user data
     * @returns {Promise<number>} Compatibility score
     */
    async getCompatibility(userAId, userBId, userAData, userBData) {
        const cacheKey = `compat:${userAId}:${userBId}`;
        const cacheExpiry = 604800; // 7 days in seconds

        // Try Redis cache first
        if (this.redis) {
            try {
                const cached = await this.redis.get(cacheKey);
                if (cached) {
                    return Number(cached);
                }
            } catch (error) {
                // Redis cache read error - continue to database cache
            }
        }

        // Try database cache
        // Note: No expiration - all cached scores are used (as per documented flow)
        try {
            const cacheResult = await this.db.query(`
                SELECT score
                FROM user_compatibility_cache
                WHERE user_id = $1 AND target_user_id = $2
                ORDER BY calculated_at DESC
                LIMIT 1
            `, [userAId, userBId]);

            if (cacheResult.rows.length > 0) {
                const score = cacheResult.rows[0].score;
                
                // Update Redis cache
                if (this.redis) {
                    try {
                        await this.redis.setex(cacheKey, cacheExpiry, score);
                    } catch (error) {
                        // Redis cache write error - continue
                    }
                }
                
                return score;
            }
        } catch (error) {
            // Table might not exist yet, continue to calculation
        }

        // Calculate new score
        const score = this.calculateCompatibility(userAData, userBData);

        // Store in database cache
        try {
            await this.db.query(`
                INSERT INTO user_compatibility_cache
                (user_id, target_user_id, score, calculated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (user_id, target_user_id)
                DO UPDATE SET
                    score = EXCLUDED.score,
                    calculated_at = NOW()
            `, [userAId, userBId, score]);
        } catch (error) {
            // Table might not exist yet, continue
        }

        // Store in Redis cache
        if (this.redis) {
            try {
                await this.redis.setex(cacheKey, cacheExpiry, score);
            } catch (error) {
                // Redis cache write error - continue
            }
        }

        return score;
    }

    /**
     * Get compatibility badge based on score
     * 
     * @param {number} score - Compatibility score (0-100)
     * @returns {Object} Badge object with label, icon, and level
     */
    getCompatibilityBadge(score) {
        // Updated badge logic based on recommended tiers
        // 90-95: Exceptional Match (rare, serious potential)
        // 80-89: Strong Match (high chance of success)
        // 65-79: Good Match (worth exploring)
        // <65: Low Match (chemistry unlikely)
        if (score >= 90) {
            return { 
                label: "Exceptional Match", 
                icon: "🔥", 
                level: "exceptional",
                color: "#00b894"
            };
        }
        if (score >= 80) {
            return { 
                label: "Strong Match", 
                icon: "✨", 
                level: "strong",
                color: "#667eea"
            };
        }
        if (score >= 65) {
            return { 
                label: "Good Match", 
                icon: "👍", 
                level: "good",
                color: "#74b9ff"
            };
        }
        return { 
            label: "Low Match", 
            icon: "⚠️", 
            level: "low",
            color: "#636e72"
        };
    }
}

module.exports = CompatibilityEngine;


