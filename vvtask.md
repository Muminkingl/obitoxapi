### S3 docs

setup; import ObitoX from '@obitox/upload';

const client = new ObitoX({
  apiKey: process.env.OBITOX_API_KEY,
  apiSecret: process.env.OBITOX_API_SECRET
});

const s3 = client.s3({
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
  bucket: 'my-bucket',
  region: 'us-east-1'
});


custom endpoint s3; const s3 = client.s3({
  accessKey: 'minioadmin',
  secretKey: 'minioadmin123',
  bucket: 'local-bucket',
  endpoint: 'http://localhost:9000',
  region: 'us-east-1'
});


basic upload; const url = await s3.upload(file, {
  filename: 'document.txt'
});


progress tracing ; const url = await s3.upload(file, {
  filename: 'video.mp4',
  onProgress: (percent, uploaded, total) => {
    console.log(`${percent}% — ${uploaded}/${total} bytes`);
  }
});


singed url expire; 
const url = await s3.upload(file, {
  filename: 'doc.txt',
  expiresIn: 3600
});

smart expire ;
// 1. Auto-Detect (Default in Browser)
// SDK automatically uses navigator.connection
const url = await s3.upload(file, {
  filename: 'video.mp4'
});

// 2. Manual Override (Server-side or custom)
const url = await s3.upload(file, {
  filename: 'video.mp4',
  networkInfo: {
    type: '4g',
    downlink: 10,  // Mbps
    rtt: 50        // ms
  }
});

Automatic: In the browser, the SDK automatically uses navigator.connection to optimize timeouts.







magic byte validation ; const url = await s3.upload(file, {
  filename: 'photo.jpg',
  validation: 'images'
});

automatic multipart ; 
// Automatic for large files
const url = await s3.upload(largeFile, {
  filename: 'archive.zip',
  onProgress: (p) => console.log(p)
});



batch upload ; 
const result = await s3.batchUpload({
  files: [
    { filename: 'a.txt', contentType: 'text/plain', fileSize: 100 },
    { filename: 'b.jpg', contentType: 'image/jpeg', fileSize: 500 }
  ]
});
console.log(result.summary);







download url ; const url = await s3.getSignedDownloadUrl({
  fileKey: 'doc.txt',
  expiresIn: 3600
});


list files; 
const res = await s3.list({ maxKeys: 100 });
res.files.forEach(f => console.log(f.key));


delete files ; 
await s3.delete({ fileKey: 'doc.txt' });


conf cors; 
await s3.configureCors({
  origins: ['https://example.com'],
  allowedMethods: ['GET', 'POST']
});


file metadata; 

const meta = await s3.getMetadata({ key: 'doc.txt' });



webhook auto trigger ; const url = await s3.upload(file, {
  filename: 'report.pdf',
  webhook: {
    url: 'https://api.myapp.com/hooks',
    trigger: 'auto'
  }
});
