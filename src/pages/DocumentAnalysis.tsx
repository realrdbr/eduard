import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Upload, FileText, MessageSquare, Trash2, Eye, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

const DocumentAnalysis = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [qaLoading, setQaLoading] = useState(false);

  useEffect(() => {
    if (!profile || profile.permission_lvl < 4) {
      navigate('/');
      return;
    }
    loadDocuments();
  }, [profile, navigate]);

  const loadDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('document_analysis')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Dokumente konnten nicht geladen werden",
        variant: "destructive"
      });
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(selectedFile.type)) {
      toast({
        title: "Fehler",
        description: "Nur PDF, PNG, JPG und JPEG Dateien sind erlaubt",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setUploadProgress(0);
    
    try {
      // Upload file to storage
      const fileName = `${Date.now()}-${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, selectedFile);
      
      if (uploadError) throw uploadError;
      setUploadProgress(50);

      // Read file content for analysis
      let fileContent = '';
      if (selectedFile.type === 'application/pdf') {
        // For PDF, we'll need to extract text (simplified approach)
        fileContent = 'PDF-Datei hochgeladen: ' + selectedFile.name;
      } else {
        // For images, we'll use the filename as context
        fileContent = 'Bild-Datei hochgeladen: ' + selectedFile.name;
      }

      setUploadProgress(75);

      // Call document analysis function
      const { data, error } = await supabase.functions.invoke('ai-document-analysis', {
        body: {
          fileName: selectedFile.name,
          fileContent,
          userProfile: profile
        }
      });
      
      if (error) throw error;
      
      setUploadProgress(100);
      
      toast({
        title: "Erfolg",
        description: "Dokument wurde analysiert und hochgeladen"
      });
      
      setSelectedFile(null);
      loadDocuments();
    } catch (error) {
      toast({
        title: "Fehler",
        description: error.message || "Dokument konnte nicht hochgeladen werden",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  const handleQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !selectedDocument) return;
    
    setQaLoading(true);
    setAnswer('');
    
    try {
      const { data, error } = await supabase.functions.invoke('document-qa', {
        body: {
          documentId: selectedDocument.id,
          question,
          userProfile: profile
        }
      });
      
      if (error) throw error;
      
      setAnswer(data.answer);
      toast({
        title: "Antwort erhalten",
        description: "Die KI hat Ihre Frage beantwortet"
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: error.message || "Frage konnte nicht beantwortet werden",
        variant: "destructive"
      });
    } finally {
      setQaLoading(false);
    }
  };

  const deleteDocument = async (id: string) => {
    try {
      const { error } = await supabase
        .from('document_analysis')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      toast({
        title: "Erfolg",
        description: "Dokument wurde gelöscht"
      });
      
      loadDocuments();
      if (selectedDocument?.id === id) {
        setSelectedDocument(null);
        setAnswer('');
        setQuestion('');
      }
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Dokument konnte nicht gelöscht werden",
        variant: "destructive"
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('de-DE');
  };

  if (!profile || profile.permission_lvl < 4) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button 
          variant="outline" 
          onClick={() => navigate(-1)}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Button>
        <h1 className="text-3xl font-bold">Dokumenten-Analyse</h1>
      </div>

      <Tabs defaultValue="upload" className="space-y-6">
        <div className="hidden sm:block">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload">Hochladen</TabsTrigger>
            <TabsTrigger value="documents">Meine Dokumente</TabsTrigger>
            <TabsTrigger value="qa">Fragen & Antworten</TabsTrigger>
          </TabsList>
        </div>
        <div className="sm:hidden">
          <Select value="upload" onValueChange={(value) => {
            // Handle tab switching for mobile
            const tabs = ['upload', 'documents', 'qa'];
            const event = new CustomEvent('tabChange', { detail: value });
            document.dispatchEvent(event);
          }}>
            <SelectTrigger className="w-full mb-4">
              <SelectValue placeholder="Bereich auswählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upload">Hochladen</SelectItem>
              <SelectItem value="documents">Meine Dokumente</SelectItem>
              <SelectItem value="qa">Fragen & Antworten</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Dokument hochladen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFileUpload} className="space-y-4">
                <div>
                  <Label htmlFor="file">Datei auswählen (PDF, PNG, JPG, JPEG)</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    required
                  />
                  {selectedFile && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Ausgewählt: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  )}
                </div>
                
                {loading && uploadProgress > 0 && (
                  <div className="space-y-2">
                    <Progress value={uploadProgress} className="w-full" />
                    <p className="text-sm text-center text-muted-foreground">
                      {uploadProgress < 50 ? 'Datei wird hochgeladen...' : 
                       uploadProgress < 75 ? 'Datei wird verarbeitet...' : 
                       'KI-Analyse läuft...'}
                    </p>
                  </div>
                )}
                
                <Button type="submit" disabled={loading || !selectedFile} className="w-full">
                  {loading ? 'Wird verarbeitet...' : 'Dokument hochladen und analysieren'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>Hochgeladene Dokumente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {documents.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Keine Dokumente vorhanden
                  </p>
                ) : (
                  documents.map((doc: any) => (
                    <div key={doc.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h3 className="font-semibold">{doc.file_name}</h3>
                          {doc.content_summary && (
                            <p className="text-sm text-muted-foreground">
                              {doc.content_summary.substring(0, 150)}...
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Hochgeladen: {formatDate(doc.created_at)}</span>
                            {doc.subject && (
                              <>
                                <Separator orientation="vertical" className="h-3" />
                                <span>Fach: {doc.subject}</span>
                              </>
                            )}
                            {doc.grade_level && (
                              <>
                                <Separator orientation="vertical" className="h-3" />
                                <span>Klasse: {doc.grade_level}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {doc.file_type?.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedDocument(doc);
                            setAnswer('');
                            setQuestion('');
                          }}
                          className="gap-2"
                        >
                          <MessageSquare className="h-4 w-4" />
                          Fragen stellen
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteDocument(doc.id)}
                          className="gap-2"
                        >
                          <Trash2 className="h-4 w-4" />
                          Löschen
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qa">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Frage stellen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedDocument ? (
                  <>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="font-semibold text-sm">Ausgewähltes Dokument:</p>
                      <p className="text-sm">{selectedDocument.file_name}</p>
                      {selectedDocument.subject && (
                        <p className="text-xs text-muted-foreground">
                          {selectedDocument.subject} - {selectedDocument.grade_level || 'Keine Klassenstufe'}
                        </p>
                      )}
                    </div>
                    
                    <form onSubmit={handleQuestion} className="space-y-4">
                      <div>
                        <Label htmlFor="question">Ihre Frage</Label>
                        <Textarea
                          id="question"
                          value={question}
                          onChange={(e) => setQuestion(e.target.value)}
                          placeholder="Stellen Sie eine Frage zu diesem Dokument..."
                          className="min-h-32"
                          required
                        />
                      </div>
                      
                      <Button type="submit" disabled={qaLoading} className="w-full">
                        {qaLoading ? 'KI denkt nach...' : 'Frage stellen'}
                      </Button>
                    </form>
                  </>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Bitte wählen Sie zuerst ein Dokument aus der Liste aus
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>KI-Antwort</CardTitle>
              </CardHeader>
              <CardContent>
                {qaLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : answer ? (
                  <div className="space-y-4">
                    <div className="prose prose-sm max-w-none">
                      <div className="whitespace-pre-wrap">{answer}</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Keine Antwort vorhanden. Stellen Sie eine Frage!
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DocumentAnalysis;