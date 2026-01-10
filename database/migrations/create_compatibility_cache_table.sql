-- Compatibility Cache Table
-- Stores pre-calculated compatibility scores to avoid recalculation

CREATE TABLE IF NOT EXISTS user_compatibility_cache (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    target_user_id INTEGER NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_user_compatibility_cache_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_compatibility_cache_target
        FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    CONSTRAINT uq_user_compatibility_cache
        UNIQUE (user_id, target_user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_compatibility_cache_user_id 
    ON user_compatibility_cache(user_id);

CREATE INDEX IF NOT EXISTS idx_user_compatibility_cache_target_id 
    ON user_compatibility_cache(target_user_id);

CREATE INDEX IF NOT EXISTS idx_user_compatibility_cache_calculated_at 
    ON user_compatibility_cache(calculated_at);

CREATE INDEX IF NOT EXISTS idx_user_compatibility_cache_user_target 
    ON user_compatibility_cache(user_id, target_user_id, calculated_at);

-- Comments
COMMENT ON TABLE user_compatibility_cache IS 'Caches compatibility scores between users to avoid recalculation';
COMMENT ON COLUMN user_compatibility_cache.score IS 'Compatibility score (0-100)';
COMMENT ON COLUMN user_compatibility_cache.calculated_at IS 'When the score was last calculated (scores older than 7 days are recalculated)';












































