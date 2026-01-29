### Supabase documentation 


First upload `import ObitoX from 'obitox';

const client = new ObitoX({
  apiKey: process.env.OBITOX_API_KEY,
  apiSecret: process.env.OBITOX_API_SECRET
});

const url = await client.uploadFile(file, {
  provider: 'SUPABASE',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseToken: process.env.SUPABASE_SERVICE_ROLE_KEY,
  bucket: 'avatars'
});

console.log('Uploaded:', url);`


Public Bucket upload  : `const url = await client.uploadFile(file, {
  provider: 'SUPABASE',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseToken: process.env.SUPABASE_SERVICE_ROLE_KEY,
  bucket: 'avatars'  // Public bucket
});

// https://xxx.supabase.co/storage/v1/object/public/avatars/photo.jpg`


Private Bucket upload ; `const url = await client.uploadFile(file, {
  provider: 'SUPABASE',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseToken: process.env.SUPABASE_SERVICE_ROLE_KEY,
  bucket: 'admin',  // Private bucket
  expiresIn: 3600   // Signed URL valid for 1 hour
});

// https://xxx.supabase.co/storage/v1/object/sign/admin/document.pdf?token=...`




Public file acces download ; `const downloadUrl = await client.downloadFile({
  provider: 'SUPABASE',
  filename: 'photo.jpg',
  bucket: 'avatars'
});`


Private file signed url ; `const downloadUrl = await client.downloadFile({
  provider: 'SUPABASE',
  filename: 'invoice.pdf',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseToken: process.env.SUPABASE_SERVICE_ROLE_KEY,
  bucket: 'admin',
  expiresIn: 300  // 5 minutes
});`



List bucket ; `const supabaseProvider = client.providers.get('SUPABASE');

const buckets = await supabaseProvider.listBuckets({
  provider: 'SUPABASE',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseToken: process.env.SUPABASE_SERVICE_ROLE_KEY
});

buckets.forEach(bucket => {
  console.log(`${bucket.name} - Public: ${bucket.public}`);
});`


