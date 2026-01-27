import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface OfflineTTSProps {
  text: string;
  voiceId?: string;
  onComplete?: () => void;
}

const OfflineTTS: React.FC<OfflineTTSProps> = ({ text, voiceId, onComplete }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const { toast } = useToast();

  const playTTS = () => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Try to find a German voice
      const voices = speechSynthesis.getVoices();
      const germanVoice = voices.find(voice => 
        voice.lang.includes('de') || voice.name.includes('German')
      );
      
      if (germanVoice) {
        utterance.voice = germanVoice;
      }
      
      utterance.lang = 'de-DE';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 0.8;
      
      utterance.onstart = () => {
        setIsPlaying(true);
      };
      
      utterance.onend = () => {
        setIsPlaying(false);
        onComplete?.();
      };
      
      utterance.onerror = (event) => {
        setIsPlaying(false);
        toast({
          title: "TTS Fehler",
          description: "Fehler bei der Sprachwiedergabe",
          variant: "destructive"
        });
      };
      
      speechSynthesis.speak(utterance);
    } else {
      toast({
        title: "Nicht unterstützt",
        description: "Text-to-Speech wird in diesem Browser nicht unterstützt",
        variant: "destructive"
      });
    }
  };

  const stopTTS = () => {
    speechSynthesis.cancel();
    setIsPlaying(false);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={isPlaying ? stopTTS : playTTS}
        size="sm"
        variant="outline"
        className="flex items-center gap-2"
      >
        {isPlaying ? (
          <>
            <VolumeX className="h-4 w-4" />
            Stoppen
          </>
        ) : (
          <>
            <Volume2 className="h-4 w-4" />
            Abspielen
          </>
        )}
      </Button>
      {text && (
        <span className="hidden text-xs text-muted-foreground">
          Offline TTS bereit
        </span>
      )}
    </div>
  );
};

export default OfflineTTS;