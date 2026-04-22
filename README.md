# PDF Generation Microservice (HTML/Markdown → PDF + S3 Upload)

## Description

A microservice that generates PDFs from HTML or Markdown content using Puppeteer and uploads files to AWS S3 via multi-part upload with streaming (PassThrough).

---

## Features

- PDF generation from HTML or Markdown content
- Markdown to HTML conversion with GitHub Flavored Markdown support
- Upload to S3 using multi-part upload  
- Stream-based data handling to optimize memory usage  
- Input validation middleware for both HTML and Markdown
- Built with TypeScript and Express
- Uses BullMQ as the task queue to handle asynchronous PDF generation and uploading operations.
- GET `/pdf/:jobId/url` endpoint to fetch a cached presigned AWS S3 URL for the generated PDF by job ID, enabling secure and efficient PDF access.

---

## API Endpoints

### Generate PDF from Any Content (Auto-Detection)
```bash
POST /pdf
Content-Type: application/json

{
  "content": "<h1>Hello World</h1><p>This is HTML content</p>"
}
```

OR

```bash
POST /pdf
Content-Type: application/json

{
  "content": "# Hello World\n\nThis is **markdown** content with *formatting*."
}
```

The service automatically detects whether you're sending HTML or Markdown content!

### Get PDF URL by Job ID
```bash
GET /pdf/:jobId/url
```

## Running the Service

```bash
npm install
npm run dev
```
