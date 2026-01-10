# MetaMesh Plugin: File Info

A MetaMesh plugin that extracts basic file information including type, MIME type, and size.

## Description

This is the first plugin in the processing chain. It extracts fundamental file metadata:

- **File type detection**: Uses magic bytes (`file-type`) with extension fallback
- **MIME type**: Detected from content or extension
- **File stats**: Size, name, extension

## Metadata Fields

| Field | Description |
|-------|-------------|
| `fileType` | Category: `video`, `audio`, `document`, `subtitle`, `torrent`, `archive`, `other` |
| `mimeType` | MIME type (e.g., `video/mp4`) |
| `sizeByte` | File size in bytes |
| `fileName` | Base filename |
| `extension` | File extension (lowercase) |
| `filePath` | Original file path |

## Dependencies

- No plugin dependencies (this runs first)

## Configuration

No configuration required.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/manifest` | GET | Plugin manifest |
| `/configure` | POST | Update configuration |
| `/process` | POST | Process a file |

## Running Locally

```bash
npm install
npm run build
npm start
```

## Docker

```bash
docker build -t metamesh-plugin-file-info .
docker run -p 8080:8080 metamesh-plugin-file-info
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP server host |

## License

MIT
