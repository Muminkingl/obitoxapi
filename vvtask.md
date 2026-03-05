
// 1. Setup
const client = new ObitoX({
    apiKey: "ox_f2cbdb9b53cd69ab174632d5adff542c8218508418d16c94", // Replace with valid ones if needed, wait user told us to use existing initialization
    apiSecret: "sk_0474c339594284c9c2af03ce876b7d534be423c3b0775e8a001ac8edd69b3562"
});

const uploadcare = client.uploadcare({
    publicKey: "b538618c3e84a2fe4e0c",
    secretKey: "8b1d61a69487046cf61d"
});


### Uploadcare provider

Setup
Initialize the ObitoX client with your Uploadcare credentials

`// app/lib/obitox.ts
import ObitoX from '@obitox/upload';

const client = new ObitoX({
  apiKey: process.env.OBITOX_API_KEY!,
  apiSecret: process.env.OBITOX_API_SECRET!
});

export const uploadcare = client.uploadcare({
  publicKey: process.env.UPLOADCARE_PUBLIC_KEY!,
  secretKey: process.env.UPLOADCARE_SECRET_KEY!
});`



Basic Upload
`// app/api/upload/route.ts
import { uploadcare } from '@/lib/obitox';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  const fileUrl = await uploadcare.upload(file, {
    filename: file.name
  });

  return NextResponse.json({ url: fileUrl });
}`




Auto Image Optimization
Automatically convert to WebP/AVIF and optimize quality

`// app/api/upload/route.ts
const fileUrl = await uploadcare.upload(file, {
  filename: file.name,
  imageOptimization: { auto: true }
});
return NextResponse.json({ url: fileUrl });`


Manual Optimization
`const fileUrl = await uploadcare.upload(file, {
  filename: file.name,
  imageOptimization: {
    format: 'webp',
    quality: 'best',
    progressive: true,
    stripMeta: 'all',
    adaptiveQuality: true
  }
});`

Progress Tracking
Monitor upload progress in real-time
`// Client component
'use client';
const res = await fetch('/api/upload', {
  method: 'POST',
  body: formData
});
// Server-side progress via streaming:
const fileUrl = await uploadcare.upload(file, {
  filename: file.name,
  onProgress: (percent) => console.log(`${percent}%`)
});`

Magic Bytes Validation
Validate file content matches extension

Client-Side Feature: This is an ObitoX SDK feature that runs in the browser/client to validate files before upload.

`const url = await uploadcare.upload(file, {
  filename: 'photo.jpg',
  validation: 'images'
});`


Scan & Delete
Automatically detect and remove infected files

`const fileUrl = await uploadcare.upload(file, {
  filename: 'document.pdf',
  checkVirus: true
});

Server-Side Feature: This is a server-side feature powered by Uploadcare. Infected files are automatically deleted from storage to protect your users.`


URL-Based Processing
Transform images just by changing the URL

Resize
https://ucarecdn.com/uuid/-/resize/800x600/photo.jpg
Convert Format
https://ucarecdn.com/uuid/-/format/webp/photo.jpg
Crop & Quality
https://ucarecdn.com/uuid/-/crop/300x300/center/-/quality/best/photo.jpg`




Get CDN URL
`// app/api/download/route.ts
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')!;
  const downloadUrl = await uploadcare.download({ fileUrl: url });
  return NextResponse.json({ downloadUrl });
}`


Delete File

`// app/api/file/route.ts
export async function DELETE(request: NextRequest) {
  const { fileUrl } = await request.json();
  await uploadcare.delete({ fileUrl });
  return NextResponse.json({ deleted: true });
}`



Webhooks

Auto Trigger
Server confirms automatically
`const url = await uploadcare.upload(file, {
  filename: 'report.jpg',
  webhook: {
    url: 'https://myapp.com/webhooks/upload',
    trigger: 'auto',
    metadata: { userId: 'user_456' }
  }
});`

Manual triger
`const url = await uploadcare.upload(file, {
  filename: 'invoice.jpg',
  webhook: {
    url: 'https://myapp.com/webhooks/upload',
    secret: 'webhook_secret_123',
    trigger: 'manual',
    autoConfirm: false,
    metadata: { userId: 'user_123' }
  }
});`
