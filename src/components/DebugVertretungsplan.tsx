import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const DebugVertretungsplan = () => {
  const [allData, setAllData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vertretungsplan')
        .select('*')
        .order('created_at', { ascending: false });

      console.log('ALL vertretungsplan data:', data);
      console.log('Any errors:', error);
      
      setAllData(data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  return (
    <Card className="m-4">
      <CardHeader>
        <CardTitle>Debug: Alle Vertretungsplan Einträge</CardTitle>
        <Button onClick={fetchAllData} disabled={loading}>
          {loading ? 'Lade...' : 'Neu laden'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p><strong>Anzahl Einträge:</strong> {allData.length}</p>
          {allData.map((entry, index) => (
            <div key={entry.id || index} className="p-2 border rounded">
              <pre className="text-xs overflow-auto">
                {JSON.stringify(entry, null, 2)}
              </pre>
            </div>
          ))}
          {allData.length === 0 && !loading && (
            <p className="text-muted-foreground">Keine Einträge gefunden.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default DebugVertretungsplan;