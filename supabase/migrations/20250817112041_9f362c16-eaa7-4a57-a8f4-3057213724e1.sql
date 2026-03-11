-- Create RLS policies for teachers table to allow read access
CREATE POLICY "Everyone can view teachers" 
ON public.teachers 
FOR SELECT 
USING (true);

-- Create RLS policies for document_analysis table to allow read access  
CREATE POLICY "Everyone can view document analysis" 
ON public.document_analysis 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can insert document analysis" 
ON public.document_analysis 
FOR INSERT 
WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Users can update their own document analysis" 
ON public.document_analysis 
FOR UPDATE 
USING (auth.uid() = uploaded_by);

CREATE POLICY "Users can delete their own document analysis" 
ON public.document_analysis 
FOR DELETE 
USING (auth.uid() = uploaded_by);