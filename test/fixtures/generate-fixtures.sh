#!/bin/bash
# Generate test fixtures for file-info plugin tests

set -e
cd "$(dirname "$0")"

echo "Generating test fixtures..."

# Create a simple video file (if ffmpeg is available)
if command -v ffmpeg &> /dev/null; then
    echo "Creating test-video.mp4..."
    ffmpeg -y -f lavfi -i testsrc=duration=1:size=160x120:rate=10 \
        -f lavfi -i sine=frequency=440:duration=1 \
        -c:v libx264 -preset ultrafast -c:a aac \
        test-video.mp4 2>/dev/null

    echo "Creating test-audio.mp3..."
    ffmpeg -y -f lavfi -i sine=frequency=440:duration=1 \
        -c:a libmp3lame \
        test-audio.mp3 2>/dev/null
else
    echo "Warning: ffmpeg not found, creating minimal video/audio stubs"
    # Create minimal MP4 file header (not a valid video, but has magic bytes)
    printf '\x00\x00\x00\x1c\x66\x74\x79\x70\x69\x73\x6f\x6d' > test-video.mp4
    # Create minimal MP3 file header
    printf '\xff\xfb\x90\x00' > test-audio.mp3
fi

# Create a simple PNG image (1x1 pixel, red)
echo "Creating test-image.png..."
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\x00\x05\xfe\xd4\x00\x00\x00\x00IEND\xaeB`\x82' > test-image.png

# Create a text file
echo "Creating test-file.txt..."
echo "This is a test file for file-info plugin tests." > test-file.txt

# Create a JSON file
echo "Creating test-file.json..."
echo '{"test": true, "name": "test-fixture"}' > test-file.json

echo "Test fixtures generated:"
ls -la *.mp4 *.mp3 *.png *.txt *.json 2>/dev/null || true
