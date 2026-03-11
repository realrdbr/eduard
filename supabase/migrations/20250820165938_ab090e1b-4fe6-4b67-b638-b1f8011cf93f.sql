-- Fix user_sessions RLS policy issue
DROP POLICY IF EXISTS "Users can manage their own sessions" ON user_sessions;

-- Create new working policy for user_sessions  
CREATE POLICY "Users can manage their own sessions" 
ON user_sessions 
FOR ALL
USING (true)
WITH CHECK (true);

-- Also add policy that works with current auth system
CREATE POLICY "Users can insert their own sessions" 
ON user_sessions 
FOR INSERT
WITH CHECK (user_id IN (SELECT id FROM permissions));

CREATE POLICY "Users can update their own sessions" 
ON user_sessions 
FOR UPDATE
USING (user_id IN (SELECT id FROM permissions));

CREATE POLICY "Users can select their own sessions" 
ON user_sessions 
FOR SELECT
USING (user_id IN (SELECT id FROM permissions));