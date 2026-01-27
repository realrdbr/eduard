
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Trash2, Plus, Palette, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ColorPicker } from '@/components/ColorPicker';

const ThemeSettings = () => {
  const navigate = useNavigate();
  const { currentTheme, userThemes, presets, setTheme, createTheme, updateTheme, deleteTheme, loading } = useTheme();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<any>(null);
  const [newThemeName, setNewThemeName] = useState('');
  const [customColors, setCustomColors] = useState({
    background: '0 0% 100%',
    foreground: '222.2 84% 4.9%',
    primary: '222.2 47.4% 11.2%',
    'primary-foreground': '210 40% 98%',
    secondary: '210 40% 96.1%',
    'secondary-foreground': '222.2 47.4% 11.2%',
    accent: '210 40% 96.1%',
    'accent-foreground': '222.2 47.4% 11.2%',
    muted: '210 40% 96.1%',
    'muted-foreground': '215.4 16.3% 46.9%',
    border: '214.3 31.8% 91.4%',
    card: '0 0% 100%',
    'card-foreground': '222.2 84% 4.9%',
    destructive: '0 84.2% 60.2%',
    'destructive-foreground': '210 40% 98%',
    popover: '0 0% 100%',
    'popover-foreground': '222.2 84% 4.9%',
    input: '214.3 31.8% 91.4%',
    ring: '222.2 84% 4.9%'
  });

  const handlePresetSelect = async (preset: any) => {
    await setTheme(preset);
    toast({
      title: "Theme geändert",
      description: `${preset.name} wurde angewendet.`,
    });
  };

  const handleCreateTheme = async () => {
    if (!newThemeName.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen Namen für das Theme ein.",
        variant: "destructive",
      });
      return;
    }

    await createTheme(newThemeName, customColors);
    toast({
      title: "Theme erstellt",
      description: `${newThemeName} wurde erstellt und angewendet.`,
    });
    setIsCreateDialogOpen(false);
    setNewThemeName('');
  };

  const handleEditTheme = (theme: any) => {
    setEditingTheme(theme);
    setCustomColors(theme.colors);
    setIsEditDialogOpen(true);
  };

  const handleUpdateTheme = async () => {
    if (!editingTheme) return;

    await updateTheme(editingTheme.id, customColors);
    toast({
      title: "Theme aktualisiert",
      description: `${editingTheme.name} wurde aktualisiert.`,
    });
    setIsEditDialogOpen(false);
    setEditingTheme(null);
  };

  const handleDeleteTheme = async (themeId: string, themeName: string) => {
    await deleteTheme(themeId);
    toast({
      title: "Theme gelöscht",
      description: `${themeName} wurde gelöscht.`,
    });
  };

  const colorInputs = [
    { key: 'background', label: 'Hintergrund', description: 'Haupthintergrundfarbe der Anwendung' },
    { key: 'foreground', label: 'Vordergrund', description: 'Haupttextfarbe' },
    { key: 'primary', label: 'Primär', description: 'Hauptakzentfarbe für Buttons und Links' },
    { key: 'primary-foreground', label: 'Primär Text', description: 'Textfarbe auf primärer Farbe' },
    { key: 'secondary', label: 'Sekundär', description: 'Sekundäre Farbe für weniger wichtige Elemente' },
    { key: 'secondary-foreground', label: 'Sekundär Text', description: 'Textfarbe auf sekundärer Farbe' },
    { key: 'accent', label: 'Akzent', description: 'Akzentfarbe für Highlights und Hover-Effekte' },
    { key: 'accent-foreground', label: 'Akzent Text', description: 'Textfarbe auf Akzentfarbe' },
    { key: 'muted', label: 'Gedämpft', description: 'Gedämpfte Hintergrundfarbe für subtile Bereiche' },
    { key: 'muted-foreground', label: 'Gedämpft Text', description: 'Textfarbe für weniger wichtige Informationen' },
    { key: 'border', label: 'Rahmen', description: 'Farbe für Rahmen und Trennlinien' },
    { key: 'card', label: 'Karte', description: 'Hintergrundfarbe für Karten und Container' },
    { key: 'card-foreground', label: 'Karte Text', description: 'Textfarbe auf Karten' }
  ];

  const previewColors = [
    { key: 'background', label: 'BG' },
    { key: 'primary', label: 'Pri' },
    { key: 'secondary', label: 'Sec' },
    { key: 'accent', label: 'Acc' }
  ];

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      {/* Back Button */}
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zurück
        </Button>
        <h1 className="text-3xl font-bold text-foreground mb-2">Theme-Einstellungen</h1>
        <p className="text-muted-foreground">
          Passen Sie das Aussehen der Anwendung nach Ihren Wünschen an
        </p>
      </div>

      <Tabs defaultValue="presets" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="presets">Vorlagen</TabsTrigger>
          <TabsTrigger value="custom">Eigene Themes</TabsTrigger>
          <TabsTrigger value="create">Neues Theme</TabsTrigger>
        </TabsList>

        <TabsContent value="presets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Vordefinierte Themes</CardTitle>
              <CardDescription>
                Wählen Sie aus unseren vordefinierten Farbschemas
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {presets.map((preset) => (
                <Card 
                  key={preset.name} 
                  className={`cursor-pointer border-2 transition-all hover:shadow-md ${
                    currentTheme?.name === preset.name 
                      ? 'border-primary bg-primary/5 shadow-md' 
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => handlePresetSelect(preset)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium">{preset.name}</h3>
                      {currentTheme?.name === preset.name && (
                        <Badge variant="default">Aktiv</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-1 h-8 mb-2">
                      {previewColors.map(({ key, label }) => (
                        <div
                          key={key}
                          className="rounded flex items-center justify-center text-xs font-bold"
                          style={{ 
                            backgroundColor: `hsl(${preset.colors[key as keyof typeof preset.colors]})`,
                            color: key === 'background' ? `hsl(${preset.colors.foreground})` : `hsl(${preset.colors[`${key}-foreground` as keyof typeof preset.colors] || preset.colors.background})`
                          }}
                          title={`${key}: ${preset.colors[key as keyof typeof preset.colors]}`}
                        >
                          {label}
                        </div>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" className="w-full">
                      <Eye className="h-4 w-4 mr-2" />
                      Anwenden
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="custom" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ihre eigenen Themes</CardTitle>
              <CardDescription>
                Verwalten Sie Ihre benutzerdefinierten Farbschemas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Themes werden geladen...</p>
                </div>
              ) : userThemes.length === 0 ? (
                <div className="text-center py-8">
                  <Palette className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Sie haben noch keine eigenen Themes erstellt.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Wechseln Sie zum Tab "Neues Theme", um Ihr erstes Theme zu erstellen.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {userThemes.map((theme) => (
                    <Card 
                      key={theme.id} 
                      className={`border-2 transition-all ${
                        currentTheme?.id === theme.id 
                          ? 'border-primary bg-primary/5 shadow-md' 
                          : 'border-border'
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-medium truncate">{theme.name}</h3>
                          {currentTheme?.id === theme.id && (
                            <Badge variant="default">Aktiv</Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-1 h-8 mb-3">
                          {previewColors.map(({ key, label }) => (
                            <div
                              key={key}
                              className="rounded flex items-center justify-center text-xs font-bold"
                              style={{ 
                                backgroundColor: `hsl(${theme.colors[key as keyof typeof theme.colors]})`,
                                color: key === 'background' ? `hsl(${theme.colors.foreground})` : `hsl(${theme.colors[`${key}-foreground` as keyof typeof theme.colors] || theme.colors.background})`
                              }}
                              title={`${key}: ${theme.colors[key as keyof typeof theme.colors]}`}
                            >
                              {label}
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => setTheme(theme)}
                            className="flex-1"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Anwenden
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleEditTheme(theme)}
                          >
                            <Palette className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive" 
                            onClick={() => handleDeleteTheme(theme.id!, theme.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Neues Theme erstellen</CardTitle>
              <CardDescription>
                Erstellen Sie Ihr eigenes Farbschema mit unserem einfachen Farbwähler
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="themeName">Theme-Name</Label>
                <Input
                  id="themeName"
                  value={newThemeName}
                  onChange={(e) => setNewThemeName(e.target.value)}
                  placeholder="Mein Theme"
                  className="mt-1"
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {colorInputs.map(({ key, label, description }) => (
                  <ColorPicker
                    key={key}
                    label={label}
                    value={customColors[key as keyof typeof customColors]}
                    onChange={(value) => setCustomColors(prev => ({
                      ...prev,
                      [key]: value
                    }))}
                    description={description}
                  />
                ))}
              </div>

              <div className="pt-4 border-t">
                <div className="mb-4">
                  <Label className="text-sm font-medium mb-2 block">Vorschau</Label>
                  <div className="grid grid-cols-4 gap-2 h-16">
                    {previewColors.map(({ key, label }) => (
                      <div
                        key={key}
                        className="rounded border flex items-center justify-center font-medium"
                        style={{ 
                          backgroundColor: `hsl(${customColors[key as keyof typeof customColors]})`,
                          color: key === 'background' 
                            ? `hsl(${customColors.foreground})` 
                            : `hsl(${customColors[`${key}-foreground` as keyof typeof customColors] || customColors.background})`
                        }}
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
                <Button onClick={handleCreateTheme} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Theme erstellen
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Theme Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Theme bearbeiten: {editingTheme?.name}</DialogTitle>
            <DialogDescription>
              Passen Sie die Farben Ihres Themes mit unserem Farbwähler an
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 md:grid-cols-2">
            {colorInputs.map(({ key, label, description }) => (
              <ColorPicker
                key={key}
                label={label}
                value={customColors[key as keyof typeof customColors]}
                onChange={(value) => setCustomColors(prev => ({
                  ...prev,
                  [key]: value
                }))}
                description={description}
              />
            ))}
          </div>

          <div className="border-t pt-4">
            <Label className="text-sm font-medium mb-2 block">Vorschau</Label>
            <div className="grid grid-cols-4 gap-2 h-12 mb-4">
              {previewColors.map(({ key, label }) => (
                <div
                  key={key}
                  className="rounded border flex items-center justify-center font-medium text-sm"
                  style={{ 
                    backgroundColor: `hsl(${customColors[key as keyof typeof customColors]})`,
                    color: key === 'background' 
                      ? `hsl(${customColors.foreground})` 
                      : `hsl(${customColors[`${key}-foreground` as keyof typeof customColors] || customColors.background})`
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleUpdateTheme}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ThemeSettings;
