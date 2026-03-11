-- Fix user_sessions policies first
DROP POLICY IF EXISTS "Users can insert their own sessions" ON user_sessions;
DROP POLICY IF EXISTS "Users can select their own sessions" ON user_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON user_sessions;

-- Create secure user_sessions policies
CREATE POLICY "Users can view their own sessions" 
ON user_sessions FOR SELECT 
USING (user_id = get_current_user_id());

CREATE POLICY "Users can create their own sessions" 
ON user_sessions FOR INSERT 
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can modify their own sessions" 
ON user_sessions FOR UPDATE 
USING (user_id = get_current_user_id())
WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can remove their own sessions" 
ON user_sessions FOR DELETE 
USING (user_id = get_current_user_id());

CREATE POLICY "Admins can manage all sessions" 
ON user_sessions FOR ALL 
USING (is_current_user_admin_safe())
WITH CHECK (is_current_user_admin_safe());