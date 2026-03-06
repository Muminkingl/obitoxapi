### Supabase 

Setup 
// app/lib/obitox.ts
import ObitoX from '@obitox/upload';

const client = new ObitoX({
  apiKey: process.env.OBITOX_API_KEY!,
  apiSecret: process.env.OBITOX_API_SECRET!
});

export const supabase = client.supabase({
  url: process.env.SUPABASE_URL!,
  token: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  bucket: 'avatars'
});


public bucket upliad 
// app/api/upload/route.ts
import { supabase } from '@/lib/obitox';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  const fileUrl = await supabase.upload(file, {
    filename: file.name
  });

  return NextResponse.json({ url: fileUrl });
}

progress tracki;
// Client-side progress via XHR or fetch stream
const fileUrl = await supabase.upload(file, {
  filename: file.name,
  onProgress: (percent) => console.log(`${percent}%`)
});

private bucket upload ; 
// Server action or API route
const privateBucket = client.supabase({
  url: process.env.SUPABASE_URL!,
  token: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  bucket: 'private-docs'
});

const signedUrl = await privateBucket.upload(file, {
  filename: 'contract.pdf'
});

file validation; 

const url = await supabase.upload(file, {
  filename: 'photo.jpg',
  validation: 'images'
});


delete file ; 
await supabase.delete({
  fileUrl: 'https://...supabase.co/storage/v1/object/public/avatars/photo.jpg'
});

download url ; 
const { downloadUrl } = await supabase.download({
  filename: 'photo.jpg',
  expiresIn: 60 // 1 minute
});



list bucket ; 
const buckets = await supabase.listBuckets();
return NextResponse.json(buckets); 

webhook auto trigger ; const url = await supabase.upload(file, {
  filename: 'report.jpg',
  webhook: {
    url: 'https://myapp.com/webhooks/upload',
    trigger: 'auto',
    metadata: { userId: '123' }
  }
});


manual trigger ;
const url = await supabase.upload(file, {
  filename: 'invoice.jpg',
  webhook: {
    url: 'https://myapp.com/webhooks/upload',
    secret: 's_123',
    trigger: 'manual',
    autoConfirm: false,
    metadata: { userId: '123' }
  }
});

