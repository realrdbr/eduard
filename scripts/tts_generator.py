#!/usr/bin/env python3
import pyttsx3
import sys
import json
import os
from datetime import datetime

def create_tts_announcement(text, title="TTS Durchsage", voice_rate=200):
    """
    Creates a TTS announcement using pyttsx3
    """
    try:
        # Initialize the TTS engine
        engine = pyttsx3.init()
        
        # Set properties
        engine.setProperty('rate', voice_rate)  # Speed of speech
        engine.setProperty('volume', 0.9)      # Volume level (0.0 to 1.0)
        
        # Try to set German voice if available
        voices = engine.getProperty('voices')
        for voice in voices:
            if 'german' in voice.name.lower() or 'deutsch' in voice.name.lower():
                engine.setProperty('voice', voice.id)
                break
        
        # Create audio file path
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        audio_file = f"tts_announcement_{timestamp}.wav"
        audio_path = os.path.join(os.getcwd(), "public", "audio", audio_file)
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(audio_path), exist_ok=True)
        
        # Save to file
        engine.save_to_file(text, audio_path)
        engine.runAndWait()
        
        # Also speak it immediately
        engine.say(text)
        engine.runAndWait()
        
        return {
            "success": True,
            "message": f"TTS-Durchsage '{title}' wurde erfolgreich erstellt",
            "audio_file": audio_file,
            "audio_path": audio_path,
            "text": text
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Kein Text angegeben"}))
        return
    
    # Get arguments
    text = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else "TTS Durchsage"
    
    # Create TTS
    result = create_tts_announcement(text, title)
    
    # Print result as JSON
    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    main()