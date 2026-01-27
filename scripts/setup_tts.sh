#!/bin/bash

# Install required Python packages for TTS
echo "Installing Python dependencies for TTS..."

# Check if Python3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Python3 is not installed. Please install Python3 first."
    exit 1
fi

# Install pyttsx3 and required dependencies
pip3 install pyttsx3

# On Linux, you might need espeak
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Installing espeak for Linux..."
    sudo apt-get update
    sudo apt-get install -y espeak espeak-data
fi

# On macOS, espeak should work automatically
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macOS detected. Using built-in TTS engine."
fi

# Create public/audio directory if it doesn't exist
mkdir -p public/audio

# Make the Python script executable
chmod +x scripts/tts_generator.py

echo "TTS setup complete! You can now use Python-based TTS functionality."