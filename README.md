# PDF Generation Microservice (HTML → PDF + S3 Upload)

## Description

A microservice that generates PDFs from HTML using Puppeteer and uploads files to AWS S3 via multi-part upload with streaming (PassThrough).

---

## Features

- PDF generation from HTML  
- Upload to S3 using multi-part upload  
- Stream-based data handling to optimize memory usage  
- HTML input validation middleware  
- Built with TypeScript and Express

---

## Running the Service

```bash
npm install
npm run dev