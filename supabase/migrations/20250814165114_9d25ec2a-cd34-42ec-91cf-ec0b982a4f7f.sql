-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Create policies for document storage
CREATE POLICY "Users can view documents based on permission level" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'documents' AND (
    -- Level 10 (Admin) can see all
    (auth.uid()::text IN (SELECT p.user_id::text FROM public.profiles p LEFT JOIN public.permissions perm ON p.permission_id = perm.id WHERE perm.permission_lvl >= 10)) OR
    -- Level 4+ (Teachers) can see all documents
    (auth.uid()::text IN (SELECT p.user_id::text FROM public.profiles p LEFT JOIN public.permissions perm ON p.permission_id = perm.id WHERE perm.permission_lvl >= 4)) OR
    -- Students can only see documents in their class folder
    (auth.uid()::text IN (SELECT p.user_id::text FROM public.profiles p LEFT JOIN public.permissions perm ON p.permission_id = perm.id WHERE perm.permission_lvl <= 3) AND 
     (storage.foldername(name))[1] = 'schueler')
  )
);

CREATE POLICY "Teachers and admins can upload documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'documents' AND 
  auth.uid()::text IN (
    SELECT p.user_id::text 
    FROM public.profiles p 
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id 
    WHERE perm.permission_lvl >= 4
  )
);

CREATE POLICY "Teachers and admins can delete documents" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'documents' AND 
  auth.uid()::text IN (
    SELECT p.user_id::text 
    FROM public.profiles p 
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id 
    WHERE perm.permission_lvl >= 4
  )
);

-- Create table for document metadata and analysis
CREATE TABLE public.document_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  subject TEXT,
  grade_level TEXT,
  content_summary TEXT,
  analysis_result JSONB,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for document analysis
ALTER TABLE public.document_analysis ENABLE ROW LEVEL SECURITY;

-- Create policies for document analysis
CREATE POLICY "Users can view document analysis based on permission" 
ON public.document_analysis 
FOR SELECT 
USING (
  -- Level 10 (Admin) can see all
  (auth.uid()::text IN (SELECT p.user_id::text FROM public.profiles p LEFT JOIN public.permissions perm ON p.permission_id = perm.id WHERE perm.permission_lvl >= 10)) OR
  -- Level 4+ (Teachers) can see all
  (auth.uid()::text IN (SELECT p.user_id::text FROM public.profiles p LEFT JOIN public.permissions perm ON p.permission_id = perm.id WHERE perm.permission_lvl >= 4)) OR
  -- Students can see documents for their subjects
  (auth.uid()::text IN (SELECT p.user_id::text FROM public.profiles p LEFT JOIN public.permissions perm ON p.permission_id = perm.id WHERE perm.permission_lvl <= 3))
);

CREATE POLICY "Teachers can create document analysis" 
ON public.document_analysis 
FOR INSERT 
WITH CHECK (
  auth.uid()::text IN (
    SELECT p.user_id::text 
    FROM public.profiles p 
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id 
    WHERE perm.permission_lvl >= 4
  )
);

CREATE POLICY "Teachers can update document analysis" 
ON public.document_analysis 
FOR UPDATE 
USING (
  auth.uid()::text IN (
    SELECT p.user_id::text 
    FROM public.profiles p 
    LEFT JOIN public.permissions perm ON p.permission_id = perm.id 
    WHERE perm.permission_lvl >= 4
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_document_analysis_updated_at
BEFORE UPDATE ON public.document_analysis
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();