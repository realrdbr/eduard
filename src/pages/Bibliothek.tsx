import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEnhancedPermissions } from '@/hooks/useEnhancedPermissions';
import { supabase } from '@/integrations/supabase/client';
import { useSessionRequest } from '@/hooks/useSessionRequest';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  Book, 
  Search, 
  Plus, 
  BookOpen, 
  Clock, 
  Users, 
  ArrowLeft,
  ScanLine,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  Edit,
  Trash2,
  UserSearch
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface BookType {
  id: string;
  isbn?: string;
  title: string;
  author: string;
  publisher?: string;
  publication_year?: number;
  genre?: string;
  total_copies: number;
  available_copies: number;
  description?: string;
  cover_image_url?: string;
}

interface UserSuggestion {
  id: number;
  name: string;
  username: string;
  keycard_number?: string;
}

interface BookSuggestion {
  id: string;
  title: string;
  author: string;
  isbn?: string;
}

interface LoanType {
  id: string;
  book_id: string;
  user_id: number;
  keycard_number?: string;
  loan_date: string;
  due_date: string;
  return_date?: string;
  is_returned: boolean;
  notes?: string;
  books: BookType;
  permissions?: {
    name: string;
    username: string;
  };
}

const Bibliothek = () => {
  const navigate = useNavigate();
  const { profile, loading, sessionId } = useAuth();
  const { hasPermission, isLoaded, reloadPermissions } = useEnhancedPermissions();
  const { withSession } = useSessionRequest();
  const { toast } = useToast();

  const [books, setBooks] = useState<BookType[]>([]);
  const [loans, setLoans] = useState<LoanType[]>([]);
  const [myLoans, setMyLoans] = useState<LoanType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'title' | 'author' | 'genre'>('title');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<BookType | null>(null);
  const [newBook, setNewBook] = useState({
    isbn: '',
    title: '',
    author: '',
    publisher: '',
    publication_year: '',
    genre: '',
    total_copies: 1,
    description: ''
  });
  const [scanKeycard, setScanKeycard] = useState('');
  const [scanBookBarcode, setScanBookBarcode] = useState('');
  const [scannedBooks, setScannedBooks] = useState<BookType[]>([]);
  const [multipleBarcodes, setMultipleBarcodes] = useState('');
  const [userSuggestions, setUserSuggestions] = useState<UserSuggestion[]>([]);
  const [bookSuggestions, setBookSuggestions] = useState<BookSuggestion[]>([]);
  const [showUserSuggestions, setShowUserSuggestions] = useState(false);
  const [showBookSuggestions, setShowBookSuggestions] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userLoans, setUserLoans] = useState<LoanType[]>([]);
  const [showAddBookDialog, setShowAddBookDialog] = useState(false);
  const [showLoanDialog, setShowLoanDialog] = useState(false);
  const [showEditBookDialog, setShowEditBookDialog] = useState(false);
  const [editingBook, setEditingBook] = useState<BookType | null>(null);
  const [activeTab, setActiveTab] = useState('books'); // Default to books tab
  const [keycardNameMap, setKeycardNameMap] = useState<Record<string, string>>({});

  const canManageBooks = hasPermission('library_manage_books');
  const canManageLoans = hasPermission('library_manage_loans');
  const canViewAllUsers = hasPermission('library_view_all_users');
  const isLibrarian = canManageBooks || canManageLoans;

  console.log('Permissions:', { 
    canManageBooks, 
    canManageLoans, 
    canViewAllUsers,
    permissionLevel: profile?.permission_lvl,
    isLoaded 
  });

  useEffect(() => {
    if (!loading && !profile) {
      navigate('/auth');
      return;
    }

    if (!isLoaded) return; // wait for permissions to load

    if (profile && !(hasPermission('library_view') || (profile.permission_lvl ?? 0) >= 10)) {
      navigate('/');
      return;
    }

    loadData();
  }, [profile, loading, isLoaded, hasPermission, navigate]);

  // Force permission reload when component mounts
  useEffect(() => {
    if (profile?.id) {
      console.log('Reloading permissions for user:', profile.id, profile.permission_lvl);
      reloadPermissions();
    }
  }, [profile?.id, reloadPermissions]);

  const loadData = async () => {
    if (!profile) return;
    
    try {
      setIsLoading(true);
      
      // Load books
      const { data: booksData, error: booksError } = await supabase
        .from('books')
        .select('*')
        .order('title');

      if (booksError) throw booksError;
      setBooks(booksData || []);

      // Load my loans (via edge function to bypass RLS issues)
      const { data: myLoansResp, error: myLoansErr } = await supabase.functions.invoke('loan-service', {
        body: {
          action: 'list_my_loans',
          profileId: profile.id,
          sessionId: sessionId
        }
      });

      if (myLoansErr) throw myLoansErr;
      if (myLoansResp?.error) throw new Error(myLoansResp.error);
      setMyLoans(myLoansResp?.loans || []);

      if (canManageLoans) {
        // Use Edge Function with service role to avoid RLS friction and ensure consistency
        const { data: allLoansResp, error: allLoansErr } = await supabase.functions.invoke('loan-service', {
          body: {
            action: 'list_all_loans',
            sessionId: sessionId
          }
        });

        if (allLoansErr) throw allLoansErr;
        if (allLoansResp?.error) throw new Error(allLoansResp.error);
        const allLoansData = allLoansResp?.loans || [];
        setLoans(allLoansData);

        // Resolve user names by keycard number for loans without joined permissions
        const keycardsToResolve = (allLoansData || [])
          .filter((l: any) => l.keycard_number && !(l as any).permissions?.name)
          .map((l: any) => l.keycard_number) as string[];
        const uniqueKeycards = Array.from(new Set(keycardsToResolve));
        if (uniqueKeycards.length > 0) {
          const { data: usersByKey, error: usersErr } = await supabase.rpc('resolve_keycards_to_names', {
            keycards: uniqueKeycards
          });
          if (!usersErr && usersByKey) {
            const map: Record<string, string> = {};
            (usersByKey as any[]).forEach((u) => {
              if (u.keycard_number) map[u.keycard_number] = u.name;
            });
            setKeycardNameMap(map);
          }
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Daten konnten nicht geladen werden."
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddBook = async () => {
    if (!newBook.title || !newBook.author) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Titel und Autor sind Pflichtfelder."
      });
      return;
    }

    try {
      const { data: resp, error: fnErr } = await supabase.functions.invoke('book-service', {
        body: {
          action: 'add_book',
          book: {
            title: newBook.title,
            author: newBook.author,
            isbn: newBook.isbn || null,
            publisher: newBook.publisher || null,
            publication_year: newBook.publication_year ? parseInt(newBook.publication_year) : null,
            genre: newBook.genre || null,
            total_copies: newBook.total_copies,
            description: newBook.description || null
          },
          sessionId: sessionId
        }
      });

      if (fnErr || !resp?.success) {
        throw new Error(resp?.error || fnErr?.message || 'Hinzufügen fehlgeschlagen');
      }

      toast({
        title: "Erfolg",
        description: "Buch wurde hinzugefügt."
      });

      setNewBook({
        isbn: '',
        title: '',
        author: '',
        publisher: '',
        publication_year: '',
        genre: '',
        total_copies: 1,
        description: ''
      });
      setShowAddBookDialog(false);
      loadData();
    } catch (error) {
      console.error('Error adding book:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Buch konnte nicht hinzugefügt werden."
      });
    }
  };

  const handleEditBook = async () => {
    if (!editingBook || !editingBook.title || !editingBook.author) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Titel und Autor sind Pflichtfelder."
      });
      return;
    }

    try {
      const { data: resp, error: fnErr } = await supabase.functions.invoke('book-service', {
        body: {
          action: 'update_book',
          book: {
            id: editingBook.id,
            title: editingBook.title,
            author: editingBook.author,
            isbn: editingBook.isbn || null,
            publisher: editingBook.publisher || null,
            publication_year: editingBook.publication_year || null,
            genre: editingBook.genre || null,
            total_copies: editingBook.total_copies,
            description: editingBook.description || null
          },
          sessionId: sessionId
        }
      });

      if (fnErr || !resp?.success) {
        throw new Error(resp?.error || fnErr?.message || 'Aktualisierung fehlgeschlagen');
      }

      toast({
        title: "Erfolg",
        description: "Buch wurde aktualisiert."
      });

      setShowEditBookDialog(false);
      setEditingBook(null);
      loadData();
    } catch (error) {
      console.error('Error updating book:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Buch konnte nicht aktualisiert werden."
      });
    }
  };

  const handleDeleteBook = async (book: BookType) => {
    if (!confirm(`Sind Sie sicher, dass Sie "${book.title}" löschen möchten?`)) {
      return;
    }

    try {
      const { data: resp, error: fnErr } = await supabase.functions.invoke('book-service', {
        body: {
          action: 'delete_book',
          bookId: book.id,
          sessionId: sessionId
        }
      });

      if (fnErr || !resp?.success) {
        throw new Error(resp?.error || fnErr?.message || 'Löschen fehlgeschlagen');
      }

      toast({
        title: "Erfolg",
        description: "Buch wurde gelöscht."
      });

      loadData();
    } catch (error) {
      console.error('Error deleting book:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Buch konnte nicht gelöscht werden."
      });
    }
  };

  const handleAddScannedBook = async () => {
    if (!scanBookBarcode.trim()) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte Titel oder Barcode eingeben."
      });
      return;
    }

    const searchTerm = scanBookBarcode.trim().toLowerCase();

    // Enhanced search: Try ISBN first, then title and author search
    let bookData = null;
    let searchError = null;

    // First try exact ISBN match
    const { data: isbnMatch, error: isbnError } = await supabase
      .from('books')
      .select('*')
      .eq('isbn', scanBookBarcode.trim())
      .maybeSingle();

    if (isbnMatch) {
      bookData = isbnMatch;
    } else {
      // Then try title and author search
      const { data: titleMatches, error: titleError } = await supabase
        .from('books')
        .select('*')
        .or(`title.ilike.%${searchTerm}%,author.ilike.%${searchTerm}%`);

      searchError = titleError;

      if (titleMatches && titleMatches.length > 0) {
        // Sort by relevance: exact title match first, then partial matches
        const sortedMatches = titleMatches.sort((a, b) => {
          const aExactTitle = a.title.toLowerCase() === searchTerm;
          const bExactTitle = b.title.toLowerCase() === searchTerm;
          if (aExactTitle && !bExactTitle) return -1;
          if (!aExactTitle && bExactTitle) return 1;
          return 0;
        });
        bookData = sortedMatches[0]; // Take the best match
      }
    }

    if (searchError || !bookData) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: searchError?.message || `Kein Buch mit "${scanBookBarcode}" gefunden. Versuchen Sie einen anderen Titel oder Barcode.`
      });
      return;
    }

    // Check if already in list
    if (scannedBooks.find(book => book.id === bookData.id)) {
      toast({
        variant: "destructive",
        title: "Hinweis",
        description: "Buch bereits in der Liste."
      });
      return;
    }

    setScannedBooks(prev => [...prev, bookData]);
    setScanBookBarcode('');
    
    toast({
      title: "Buch hinzugefügt",
      description: `"${bookData.title}" wurde hinzugefügt.`
    });
  };

  const handleRemoveScannedBook = (bookId: string) => {
    setScannedBooks(prev => prev.filter(book => book.id !== bookId));
  };

  const handleBulkLoanBooks = async () => {
    if (!selectedUser) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte zuerst einen Benutzer suchen."
      });
      return;
    }

    if (scannedBooks.length === 0) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Keine Bücher ausgewählt."
      });
      return;
    }

    try {
      let successCount = 0;
      let errorCount = 0;

      for (const book of scannedBooks) {
        if (book.available_copies <= 0) {
          console.error(`Book ${book.title} not available`);
          errorCount++;
          continue;
        }

        try {
          const { data: loanResult, error: loanFunctionError } = await supabase.functions.invoke('loan-book', {
            body: {
              book_id: book.id,
              user_id: selectedUser.id,
              keycard_number: selectedUser.keycard_number,
              sessionId: sessionId
            }
          });

          if (loanFunctionError || !loanResult?.success) {
            throw new Error(loanResult?.error || 'Ausleihe fehlgeschlagen');
          }

          successCount++;
        } catch (sessionError) {
          console.error('Loan operation failed:', sessionError);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: "Erfolg",
          description: `${successCount} Buch${successCount > 1 ? 'er' : ''} ausgeliehen.`
        });
      }

      if (errorCount > 0) {
        toast({
          variant: "destructive",
          title: "Warnung",
          description: `${errorCount} Buch${errorCount > 1 ? 'er' : ''} konnten nicht ausgeliehen werden.`
        });
      }

      // Clear scanned books and refresh data
      setScannedBooks([]);
      handleSearchUser(); // Refresh user loans
      loadData(); // Refresh books
      setActiveTab('all-loans');
    } catch (error) {
      console.error('Error loaning books:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Ausleihe konnte nicht erstellt werden."
      });
    }
  };

  const handleSearchUser = async () => {
    if (!scanKeycard.trim()) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte Keycard-Nummer oder Namen eingeben."
      });
      return;
    }

    try {
      let pickedUserId: number | null = null;

      // 1) Try keycard lookup via Edge Function (preferred)
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'search_by_keycard',
          keycard_number: scanKeycard.trim(),
          sessionId: sessionId
        }
      });

      if (!error && data?.user) {
        setSelectedUser(data.user);
        pickedUserId = data.user.id;
      } else {
        // 2) Fallback: search by username/name (SECURITY DEFINER RPC)
        const { data: usersFound, error: usersErr } = await supabase.rpc('search_user_directory', {
          search_term: scanKeycard.trim(),
          current_user_id: profile?.id || null
        });

        if (usersErr) throw usersErr;
        if (!usersFound || usersFound.length === 0) {
          toast({
            variant: "destructive",
            title: "Fehler",
            description: "Kein Benutzer gefunden."
          });
          return;
        }

        // Prefer exact username match, otherwise first result
        const exactUser = usersFound.find((u: any) => u.username?.toLowerCase() === scanKeycard.trim().toLowerCase());
        const picked = exactUser || usersFound[0];
        pickedUserId = picked.id;
        setSelectedUser({ ...picked, keycard_number: null, keycard_active: true });
        // Fetch keycard info via edge function to avoid RLS/session context issues
        try {
          const { data: info, error: infoErr } = await supabase.functions.invoke('admin-users', {
            body: {
              action: 'get_user_by_id',
              targetUserId: picked.id,
              sessionId: sessionId
            }
          });
          if (!infoErr && info?.success && info?.user) {
            setSelectedUser((prev: any) => prev ? { ...prev, keycard_number: info.user.keycard_number, keycard_active: info.user.keycard_active } : { ...picked, keycard_number: info.user.keycard_number, keycard_active: info.user.keycard_active });
          }
        } catch (e) {
          console.error('Keycard lookup failed:', e);
        }
        toast({ title: 'Benutzer ausgewählt', description: `${picked.name} (@${picked.username})` });
      }

      if (!pickedUserId) {
        toast({ variant: 'destructive', title: 'Fehler', description: 'Benutzer konnte nicht bestimmt werden.' });
        return;
      }

      // Load user's active loans
      const { data: userLoansData, error: userLoansError } = await supabase
        .from('loans')
        .select(`*, books (*)`)
        .eq('user_id', pickedUserId)
        .eq('is_returned', false);

      if (userLoansError) throw userLoansError;
      setUserLoans(userLoansData || []);
    } catch (error) {
      console.error('Error searching user:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Benutzer konnte nicht gefunden werden."
      });
    }
  };

  const handleLoanBookByBarcode = async () => {
    if (!selectedUser) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte zuerst einen Benutzer suchen."
      });
      return;
    }

    const barcodes = multipleBarcodes.trim() ? 
      multipleBarcodes.split('\n').map(b => b.trim()).filter(b => b) : 
      scanBookBarcode.trim() ? [scanBookBarcode.trim()] : [];

    if (barcodes.length === 0) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte Barcode(s) eingeben."
      });
      return;
    }

    try {
      let successCount = 0;
      let errorCount = 0;

      for (const barcode of barcodes) {
        // Find book by barcode (assuming ISBN or a barcode field exists)
        const { data: bookData, error: bookError } = await supabase
          .from('books')
          .select('*')
          .eq('isbn', barcode)
          .maybeSingle();

        if (bookError || !bookData) {
          console.error(`Book with barcode ${barcode} not found`);
          errorCount++;
          continue;
        }

        if (bookData.available_copies <= 0) {
          console.error(`Book ${bookData.title} not available`);
          errorCount++;
          continue;
        }

        try {
          console.log('Creating loan with session:', sessionId, 'for user:', selectedUser.id, 'book:', bookData.id, 'librarian:', profile!.id);
          
          // Try Edge Function approach first
          const { data: loanResult, error: loanFunctionError } = await supabase.functions.invoke('loan-book', {
            body: {
              book_id: bookData.id,
              user_id: selectedUser.id,
              keycard_number: selectedUser.keycard_number,
              sessionId: sessionId
            }
          });

          console.log('Loan function result:', { loanResult, loanFunctionError });

          if (loanFunctionError) {
            throw new Error(`Edge Function Error: ${loanFunctionError.message}`);
          }
          
          if (!loanResult?.success) {
            throw new Error(loanResult?.error || 'Ausleihe fehlgeschlagen');
          }
        } catch (sessionError) {
          console.error('Loan operation failed:', sessionError);
          errorCount++;
          continue;
        }

        successCount++;
      }

      if (successCount > 0) {
        toast({
          title: "Erfolg",
          description: `${successCount} Buch${successCount > 1 ? 'er' : ''} ausgeliehen.`
        });
      }

      if (errorCount > 0) {
        toast({
          variant: "destructive",
          title: "Warnung",
          description: `${errorCount} Buch${errorCount > 1 ? 'er' : ''} konnten nicht ausgeliehen werden.`
        });
      }

      setScanBookBarcode('');
      setMultipleBarcodes('');
      handleSearchUser(); // Refresh user loans
      loadData(); // Refresh books
      setActiveTab('all-loans');
    } catch (error) {
      console.error('Error loaning books:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Ausleihe konnte nicht erstellt werden."
      });
    }
  };

  const handleReturnBookByBarcode = async () => {
    if (!selectedUser) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte zuerst einen Benutzer suchen."
      });
      return;
    }

    const barcodes = multipleBarcodes.trim() ? 
      multipleBarcodes.split('\n').map(b => b.trim()).filter(b => b) : 
      scanBookBarcode.trim() ? [scanBookBarcode.trim()] : [];

    if (barcodes.length === 0) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte Barcode(s) eingeben."
      });
      return;
    }

    try {
      let successCount = 0;
      let errorCount = 0;

      for (const barcode of barcodes) {
        // Find book by ISBN first
        const { data: book, error: bookErr } = await supabase
          .from('books')
          .select('id, available_copies')
          .eq('isbn', barcode)
          .maybeSingle();
        if (bookErr || !book) {
          console.error(`Book with ISBN ${barcode} not found`);
          errorCount++;
          continue;
        }

        // Find active loan for this user and book
        const { data: loan, error: loanErr } = await supabase
          .from('loans')
          .select('id')
          .eq('user_id', selectedUser.id)
          .eq('book_id', book.id)
          .eq('is_returned', false)
          .maybeSingle();
        if (loanErr || !loan) {
          console.error(`Active loan not found for user ${selectedUser.id} and book ${book.id}`);
          errorCount++;
          continue;
        }

        // Use Edge Function to process return with service role (avoids RLS)
        const { data: ret, error: retErr } = await supabase.functions.invoke('loan-service', {
          body: {
            action: 'return_book',
            loan_id: loan.id,
            sessionId: sessionId
          }
        });
        if (retErr || ret?.error) {
          console.error('Return via edge function failed:', retErr || ret?.error);
          errorCount++;
          continue;
        }

        successCount++;
      }

      if (successCount > 0) {
        toast({
          title: "Erfolg",
          description: `${successCount} Buch${successCount > 1 ? 'er' : ''} zurückgegeben.`
        });
      }

      if (errorCount > 0) {
        toast({
          variant: "destructive",
          title: "Warnung",
          description: `${errorCount} Buch${errorCount > 1 ? 'er' : ''} konnten nicht zurückgegeben werden.`
        });
      }

      setScanBookBarcode('');
      setMultipleBarcodes('');
      handleSearchUser();
      loadData();
      setActiveTab('loans');
    } catch (error) {
      console.error('Error returning books:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Rückgabe konnte nicht verarbeitet werden."
      });
    }
  };

  const handleLoanBook = async (book: BookType) => {
    if (!selectedUser) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte zuerst einen Benutzer suchen."
      });
      return;
    }

    try {
      if (book.available_copies <= 0) {
        toast({
          variant: "destructive",
          title: "Fehler",
          description: "Buch ist nicht verfügbar."
        });
        return;
      }

      // Use loan-service edge function
      const { data, error } = await supabase.functions.invoke('loan-service', {
        body: {
          action: 'loan_book',
          bookId: book.id,
          userId: selectedUser.id,
          keycardNumber: scanKeycard.trim(),
          sessionId: sessionId
        }
      });

      if (error || (data && !data.success)) {
        throw new Error(data?.error || error?.message || 'Ausleihe fehlgeschlagen');
      }

      toast({
        title: "Erfolg",
        description: "Buch wurde ausgeliehen."
      });

      setShowLoanDialog(false);
      setSelectedBook(null);
      setScanKeycard('');
      setActiveTab('all-loans');
      loadData();
      if (selectedUser) {
        handleSearchUser();
      }
    } catch (error) {
      console.error('Error loaning book:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Buch konnte nicht ausgeliehen werden."
      });
    }
  };

  // User suggestion search
  const searchUserSuggestions = async (query: string) => {
    if (query.length < 2) {
      setUserSuggestions([]);
      setShowUserSuggestions(false);
      return;
    }

    try {
      const { data } = await supabase.rpc('search_user_directory', {
        search_term: query,
        current_user_id: profile?.id || null
      });

      if (data) {
        setUserSuggestions(data);
        setShowUserSuggestions(true);
      }
    } catch (error) {
      console.error('Error searching users:', error);
    }
  };

  // Book suggestion search
  const searchBookSuggestions = async (query: string) => {
    if (query.length < 2) {
      setBookSuggestions([]);
      setShowBookSuggestions(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('books')
        .select('id, title, author, isbn')
        .or(`title.ilike.%${query}%,author.ilike.%${query}%,isbn.ilike.%${query}%`)
        .limit(10);

      if (!error && data) {
        setBookSuggestions(data);
        setShowBookSuggestions(true);
      }
    } catch (error) {
      console.error('Error searching books:', error);
    }
  };

  const handleReturnBook = async (loan: LoanType) => {
    try {
      // Use Edge Function with service role credentials
      const { data: ret, error: retErr } = await supabase.functions.invoke('loan-service', {
        body: {
          action: 'return_book',
          loan_id: loan.id,
          sessionId: sessionId
        }
      });

      if (retErr || ret?.error) {
        throw new Error(retErr?.message || ret?.error || 'Rückgabe fehlgeschlagen');
      }

      toast({
        title: "Erfolg",
        description: "Buch wurde zurückgegeben."
      });

      handleSearchUser();
      loadData();
      setActiveTab('loans');
    } catch (error) {
      console.error('Error returning book:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Rückgabe konnte nicht verarbeitet werden."
      });
    }
  };

  const filteredBooks = books
    .filter(book => {
      if (!searchTerm) return true;
      
      const search = searchTerm.toLowerCase().trim();
      const title = book.title.toLowerCase();
      const author = book.author.toLowerCase();
      const genre = (book.genre || '').toLowerCase();
      const isbn = (book.isbn || '').toLowerCase();
      
      // Exact matches first
      if (title.includes(search) || author.includes(search) || isbn.includes(search)) {
        return true;
      }
      
      // Fuzzy matching for partial words
      const searchWords = search.split(' ').filter(word => word.length > 2);
      return searchWords.some(word => 
        title.includes(word) || 
        author.includes(word) || 
        genre.includes(word) ||
        isbn.includes(word)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'author') return a.author.localeCompare(b.author);
      if (sortBy === 'genre') return (a.genre || '').localeCompare(b.genre || '');
      return 0;
    });

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString();
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Book className="h-12 w-12 animate-bounce mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Bibliothek wird geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate('/')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Book className="h-8 w-8 text-primary" />
                Schulbibliothek
              </h1>
              <p className="text-muted-foreground">
                {canManageBooks ? 'Bibliotheksverwaltung' : 'Bücher suchen und ausleihen'}
              </p>
            </div>
          </div>
          
          {(canManageBooks || isLibrarian) && (
            <Button onClick={() => setShowAddBookDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Neues Buch
            </Button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={`grid w-full ${canManageLoans ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="books">
              <BookOpen className="h-4 w-4 mr-2" />
              Bücher
            </TabsTrigger>
            {!canManageBooks && (
              <TabsTrigger value="my-loans">
                <Clock className="h-4 w-4 mr-2" />
                Meine Ausleihen ({myLoans.length})
              </TabsTrigger>
            )}
            {canManageLoans && (
              <TabsTrigger value="loan-management">
                <UserSearch className="h-4 w-4 mr-2" />
                Ausleihen verwalten
              </TabsTrigger>
            )}
            {canManageLoans && (
              <TabsTrigger value="all-loans">
                <Users className="h-4 w-4 mr-2" />
                Alle Ausleihen
              </TabsTrigger>
            )}
          </TabsList>

          {/* Books Tab */}
          <TabsContent value="books" className="space-y-4">
            <div className="flex gap-4 items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Bücher suchen..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title">Nach Titel</SelectItem>
                  <SelectItem value="author">Nach Autor</SelectItem>
                  <SelectItem value="genre">Nach Genre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredBooks.map((book) => (
                <Card key={book.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg">{book.title}</CardTitle>
                    <CardDescription>{book.author}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {book.genre && (
                      <Badge variant="secondary">{book.genre}</Badge>
                    )}
                    
                    <div className="flex justify-between text-sm">
                      <span>Verfügbar:</span>
                      <span className={book.available_copies > 0 ? 'text-green-600' : 'text-red-600'}>
                        {book.available_copies} / {book.total_copies}
                      </span>
                    </div>

                    {book.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {book.description}
                      </p>
                    )}

                    {(canManageBooks || isLibrarian) ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            setEditingBook(book);
                            setShowEditBookDialog(true);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Bearbeiten
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1"
                          onClick={() => handleDeleteBook(book)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Löschen
                        </Button>
                      </div>
                    ) : (
                      canManageLoans && book.available_copies > 0 && (
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            setSelectedBook(book);
                            setShowLoanDialog(true);
                          }}
                        >
                          <ScanLine className="h-4 w-4 mr-2" />
                          Ausleihen
                        </Button>
                      )
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* My Loans Tab - Only for non-librarians */}
          {!canManageBooks && (
            <TabsContent value="my-loans" className="space-y-4">
              {myLoans.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8">
                    <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium">Keine Ausleihen</p>
                    <p className="text-muted-foreground">Sie haben derzeit keine Bücher ausgeliehen.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {myLoans.map((loan) => (
                    <Card key={loan.id}>
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <h3 className="font-semibold text-lg">{loan.books.title}</h3>
                            <p className="text-muted-foreground">{loan.books.author}</p>
                            <div className="flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-1">
                                <CalendarDays className="h-4 w-4" />
                                Ausgeliehen: {format(new Date(loan.loan_date), 'dd.MM.yyyy', { locale: de })}
                              </div>
                              <div className={`flex items-center gap-1 ${isOverdue(loan.due_date) ? 'text-red-600' : 'text-green-600'}`}>
                                {isOverdue(loan.due_date) ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                                Rückgabe bis: {format(new Date(loan.due_date), 'dd.MM.yyyy', { locale: de })}
                              </div>
                            </div>
                            {isOverdue(loan.due_date) && (
                              <Badge variant="destructive">Überfällig</Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {/* Loan Management Tab - Only for librarians */}
          {canManageLoans && (
            <TabsContent value="loan-management" className="space-y-6">
              {/* Hidden user search - will be integrated later */}
              <div className="hidden">
                <Card>
                  <CardHeader>
                    <CardTitle>Benutzer suchen</CardTitle>
                    <CardDescription>Scannen Sie die Keycard eines Schülers</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <ScanLine className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={scanKeycard}
                          onChange={(e) => setScanKeycard(e.target.value)}
                          placeholder="Keycard scannen..."
                          className="pl-10"
                        />
                      </div>
                      <Button onClick={handleSearchUser}>
                        <UserSearch className="h-4 w-4 mr-2" />
                        Suchen
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Main Layout: User Selection left, Preview right */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - User Selection and Book Scanner */}
                <div className="space-y-4">
                  {/* User Selection */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Benutzer auswählen</CardTitle>
                      <CardDescription>Keycard scannen für Ausleihe/Rückgabe</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <ScanLine className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            value={scanKeycard}
                            onChange={(e) => {
                              const value = e.target.value;
                              setScanKeycard(value);
                              searchUserSuggestions(value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSearchUser();
                                setShowUserSuggestions(false);
                              } else if (e.key === 'Escape') {
                                setShowUserSuggestions(false);
                              }
                            }}
                            onFocus={() => {
                              if (scanKeycard.length >= 2) {
                                searchUserSuggestions(scanKeycard);
                              }
                            }}
                            onBlur={() => {
                              setTimeout(() => setShowUserSuggestions(false), 200);
                            }}
                            placeholder="Keycard scannen..."
                            className="pl-10"
                          />
                          {/* User suggestions dropdown */}
                          {showUserSuggestions && userSuggestions.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                              {userSuggestions.map((user) => (
                                <div
                                  key={user.id}
                                  className="p-2 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                                  onClick={() => {
                                    setScanKeycard(user.keycard_number || user.username);
                                    setShowUserSuggestions(false);
                                    handleSearchUser();
                                  }}
                                >
                                  <div className="font-medium">{user.name}</div>
                                  <div className="text-sm text-gray-500">
                                    {user.keycard_number ? `Keycard: ${user.keycard_number}` : `Username: ${user.username}`}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button onClick={handleSearchUser} disabled={!scanKeycard.trim()}>
                          <UserSearch className="h-4 w-4 mr-2" />
                          Suchen
                        </Button>
                      </div>
                      
                      {selectedUser && (
                        <div className="p-4 border rounded-lg bg-muted/50">
                          <h3 className="font-semibold">{selectedUser.name}</h3>
                          <p className="text-sm text-muted-foreground">Keycard: {selectedUser.keycard_number}</p>
                          <p className="text-sm text-muted-foreground">
                            Aktuelle Ausleihen: {userLoans.length}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Buchscanner</CardTitle>
                      <CardDescription>Scannen Sie Bücher und fügen Sie sie zur Vorschau hinzu</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <ScanLine className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            value={scanBookBarcode}
                            onChange={(e) => {
                              const value = e.target.value;
                              setScanBookBarcode(value);
                              searchBookSuggestions(value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleAddScannedBook();
                                setShowBookSuggestions(false);
                              } else if (e.key === 'Escape') {
                                setShowBookSuggestions(false);
                              }
                            }}
                            onFocus={() => {
                              if (scanBookBarcode.length >= 2) {
                                searchBookSuggestions(scanBookBarcode);
                              }
                            }}
                            onBlur={() => {
                              setTimeout(() => setShowBookSuggestions(false), 200);
                            }}
                            placeholder="Buchtitel oder Barcode eingeben..."
                            className="pl-10"
                          />
                          {/* Book suggestions dropdown */}
                          {showBookSuggestions && bookSuggestions.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                              {bookSuggestions.map((book) => (
                                <div
                                  key={book.id}
                                  className="p-2 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                                  onClick={() => {
                                    setScanBookBarcode(book.title);
                                    setShowBookSuggestions(false);
                                    handleAddScannedBook();
                                  }}
                                >
                                  <div className="font-medium">{book.title}</div>
                                  <div className="text-sm text-gray-500">
                                    {book.author} {book.isbn && `• ISBN: ${book.isbn}`}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button onClick={handleAddScannedBook} disabled={!scanBookBarcode.trim()}>
                          <Plus className="h-4 w-4 mr-2" />
                          Hinzufügen
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Action Buttons */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Aktionen</CardTitle>
                      <CardDescription>Bücher aus der Vorschau ausleihen oder zurückgeben</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-2">
                        <Button 
                          onClick={handleBulkLoanBooks}
                          disabled={!selectedUser || scannedBooks.length === 0}
                          className="flex-1"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Alle Ausleihen ({scannedBooks.length})
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={() => {
                            // Clear the scanned books list
                            setScannedBooks([]);
                          }}
                          disabled={scannedBooks.length === 0}
                          className="flex-1"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Liste leeren
                        </Button>
                      </div>
                      {!selectedUser && (
                        <p className="text-sm text-muted-foreground text-center">
                          Bitte erst einen Benutzer auswählen
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Right Column - Preview List */}
                <div>
                  <Card className="h-fit">
                    <CardHeader>
                      <CardTitle>Buchvorschau</CardTitle>
                      <CardDescription>Gescannte Bücher ({scannedBooks.length})</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {scannedBooks.length === 0 ? (
                        <div className="text-center py-8">
                          <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                          <p className="text-lg font-medium">Keine Bücher gescannt</p>
                          <p className="text-muted-foreground">Scannen Sie Bücher links, um sie hier anzuzeigen</p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {scannedBooks.map((book) => (
                            <div key={book.id} className="flex justify-between items-start p-3 border rounded-lg">
                              <div className="flex-1">
                                <h4 className="font-medium text-sm">{book.title}</h4>
                                <p className="text-sm text-muted-foreground">{book.author}</p>
                                {book.genre && (
                                  <Badge variant="secondary" className="mt-1 text-xs">
                                    {book.genre}
                                  </Badge>
                                )}
                                <div className="flex justify-between text-xs mt-1">
                                  <span>Verfügbar:</span>
                                  <span className={book.available_copies > 0 ? 'text-green-600' : 'text-red-600'}>
                                    {book.available_copies} / {book.total_copies}
                                  </span>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveScannedBook(book.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* User's Current Loans */}
              {selectedUser && userLoans.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Aktuelle Ausleihen von {selectedUser.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {userLoans.map((loan) => (
                        <div key={loan.id} className="flex justify-between items-center p-3 border rounded">
                          <div>
                            <h4 className="font-medium">{loan.books.title}</h4>
                            <p className="text-sm text-muted-foreground">{loan.books.author}</p>
                            <p className="text-sm text-muted-foreground">
                              Rückgabe bis: {format(new Date(loan.due_date), 'dd.MM.yyyy', { locale: de })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isOverdue(loan.due_date) && (
                              <Badge variant="destructive">Überfällig</Badge>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReturnBook(loan)}
                            >
                              Zurückgeben
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          )}

          {/* All Loans Tab (Librarians only) */}
          {canManageLoans && (
            <TabsContent value="all-loans" className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Buch</TableHead>
                    <TableHead>Benutzer</TableHead>
                    <TableHead>Ausgeliehen</TableHead>
                    <TableHead>Rückgabe bis</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loans.map((loan) => (
                    <TableRow key={loan.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{loan.books.title}</div>
                          <div className="text-sm text-muted-foreground">{loan.books.author}</div>
                        </div>
                      </TableCell>
                       <TableCell>
                         <div>
                           <div className="font-medium">
                             {loan.permissions?.name || (loan.keycard_number ? keycardNameMap[loan.keycard_number] : undefined) || 'Unbekannt'}
                           </div>
                           <div className="text-sm text-muted-foreground">
                             Keycard: {loan.keycard_number || 'Keine'}
                           </div>
                         </div>
                       </TableCell>
                       <TableCell>{format(new Date(loan.loan_date), 'dd.MM.yyyy', { locale: de })}</TableCell>
                      <TableCell className={isOverdue(loan.due_date) && !loan.is_returned ? 'text-red-600' : ''}>
                        {format(new Date(loan.due_date), 'dd.MM.yyyy', { locale: de })}
                      </TableCell>
                      <TableCell>
                        {loan.is_returned ? (
                          <Badge variant="secondary">Zurückgegeben</Badge>
                        ) : isOverdue(loan.due_date) ? (
                          <Badge variant="destructive">Überfällig</Badge>
                        ) : (
                          <Badge variant="default">Ausgeliehen</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {!loan.is_returned && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReturnBook(loan)}
                          >
                            Zurückgeben
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          )}
        </Tabs>

        {/* Add Book Dialog */}
        <Dialog open={showAddBookDialog} onOpenChange={setShowAddBookDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Neues Buch hinzufügen</DialogTitle>
              <DialogDescription>
                Fügen Sie ein neues Buch zur Bibliothek hinzu.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="isbn">ISBN (optional)</Label>
                <Input
                  id="isbn"
                  value={newBook.isbn}
                  onChange={(e) => setNewBook({ ...newBook, isbn: e.target.value })}
                  placeholder="978-3-..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="title">Titel *</Label>
                <Input
                  id="title"
                  value={newBook.title}
                  onChange={(e) => setNewBook({ ...newBook, title: e.target.value })}
                  placeholder="Buchtitel"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="author">Autor *</Label>
                <Input
                  id="author"
                  value={newBook.author}
                  onChange={(e) => setNewBook({ ...newBook, author: e.target.value })}
                  placeholder="Autorname"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="genre">Genre</Label>
                <Input
                  id="genre"
                  value={newBook.genre}
                  onChange={(e) => setNewBook({ ...newBook, genre: e.target.value })}
                  placeholder="z.B. Roman, Sachbuch"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="copies">Anzahl Exemplare</Label>
                <Input
                  id="copies"
                  type="number"
                  min="1"
                  value={newBook.total_copies}
                  onChange={(e) => setNewBook({ ...newBook, total_copies: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Beschreibung</Label>
                <Textarea
                  id="description"
                  value={newBook.description}
                  onChange={(e) => setNewBook({ ...newBook, description: e.target.value })}
                  placeholder="Kurzbeschreibung des Buchs"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddBookDialog(false)}>
                Abbrechen
              </Button>
              <Button type="button" onClick={handleAddBook}>
                Buch hinzufügen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Loan Book Dialog */}
        <Dialog open={showLoanDialog} onOpenChange={setShowLoanDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Buch ausleihen</DialogTitle>
              <DialogDescription>
                {selectedBook && `"${selectedBook.title}" von ${selectedBook.author}`}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="keycard">Keycard-Nummer scannen</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <ScanLine className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="keycard"
                      value={scanKeycard}
                      onChange={(e) => {
                        const value = e.target.value;
                        setScanKeycard(value);
                        searchUserSuggestions(value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setShowUserSuggestions(false);
                        }
                      }}
                      onFocus={() => {
                        if (scanKeycard.length >= 2) {
                          searchUserSuggestions(scanKeycard);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowUserSuggestions(false), 200);
                      }}
                      placeholder="Keycard scannen..."
                      className="pl-10"
                      autoFocus
                    />
                    {/* User suggestions dropdown in dialog */}
                    {showUserSuggestions && userSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {userSuggestions.map((user) => (
                          <div
                            key={user.id}
                            className="p-2 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                            onClick={() => {
                              setScanKeycard(user.keycard_number || user.username);
                              setShowUserSuggestions(false);
                            }}
                          >
                            <div className="font-medium">{user.name}</div>
                            <div className="text-sm text-gray-500">
                              {user.keycard_number ? `Keycard: ${user.keycard_number}` : `Username: ${user.username}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowLoanDialog(false)}>
                Abbrechen
              </Button>
              <Button 
                type="button" 
                onClick={() => selectedBook && handleLoanBook(selectedBook)}
                disabled={!scanKeycard.trim()}
              >
                Ausleihen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Book Dialog */}
        <Dialog open={showEditBookDialog} onOpenChange={setShowEditBookDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Buch bearbeiten</DialogTitle>
              <DialogDescription>
                Bearbeiten Sie die Buchinformationen.
              </DialogDescription>
            </DialogHeader>
            {editingBook && (
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-isbn">ISBN (optional)</Label>
                  <Input
                    id="edit-isbn"
                    value={editingBook.isbn || ''}
                    onChange={(e) => setEditingBook({ ...editingBook, isbn: e.target.value })}
                    placeholder="978-3-..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-title">Titel *</Label>
                  <Input
                    id="edit-title"
                    value={editingBook.title}
                    onChange={(e) => setEditingBook({ ...editingBook, title: e.target.value })}
                    placeholder="Buchtitel"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-author">Autor *</Label>
                  <Input
                    id="edit-author"
                    value={editingBook.author}
                    onChange={(e) => setEditingBook({ ...editingBook, author: e.target.value })}
                    placeholder="Autorname"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-genre">Genre</Label>
                  <Input
                    id="edit-genre"
                    value={editingBook.genre || ''}
                    onChange={(e) => setEditingBook({ ...editingBook, genre: e.target.value })}
                    placeholder="z.B. Roman, Sachbuch"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-copies">Anzahl Exemplare</Label>
                  <Input
                    id="edit-copies"
                    type="number"
                    min="1"
                    value={editingBook.total_copies}
                    onChange={(e) => setEditingBook({ ...editingBook, total_copies: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-description">Beschreibung</Label>
                  <Textarea
                    id="edit-description"
                    value={editingBook.description || ''}
                    onChange={(e) => setEditingBook({ ...editingBook, description: e.target.value })}
                    placeholder="Kurzbeschreibung des Buchs"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditBookDialog(false)}>
                Abbrechen
              </Button>
              <Button type="button" onClick={handleEditBook}>
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Bibliothek;