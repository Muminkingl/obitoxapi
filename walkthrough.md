### R2 



Credints `
const R2_ACCESS_KEY = '8105c2c257b314edbc01fa0667cac2da';
const R2_SECRET_KEY = '23b01e76dde5d81b913a36473676c077149bacf79049f0ba894ca7db08858e31';
const R2_ACCOUNT_ID = 'b0cab7bc004505800b231cb8f9a793f4';
const R2_BUCKET = 'test';

`



Setup ;
import ObitoX from '@obitox/upload';

const client = new ObitoX({
  apiKey: process.env.OBITOX_API_KEY,
  apiSecret: process.env.OBITOX_API_SECRET
});

const r2 = client.r2({
  accessKey: process.env.R2_ACCESS_KEY,
  secretKey: process.env.R2_SECRET_KEY,
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  bucket: 'my-bucket'
});


Basic upload ;
const fileUrl = await r2.upload(fileBuffer, {
  filename: 'document.pdf',
  contentType: 'application/pdf'
});
console.log(fileUrl);



prgress tracong ;
const url = await r2.upload(stream, {
  filename: 'video.mp4',
  onProgress: (p, uploaded, total) => {
    console.log(`${p}% - ${uploaded}/${total}`);
  }
});



smart expire ; 
Network-aware signed URL expiration

Automatically adjusts signed URL expiry based on connection speed to ensure uploads complete even on slow networks.

const url = await r2.upload(file, {
  filename: 'temp.zip',
  networkInfo: { type: '3g', downlink: 1.5, rtt: 300 }
});


file validation ; 
const url = await r2.upload(file, {
  filename: 'img.jpg',
  validation: 'images'
});



batch upload ;

const result = await r2.batchUpload({
  files: [
    { buffer: buf1, filename: '1.jpg' },
    { buffer: buf2, filename: '2.jpg' }
  ]
});
console.log(result.summary);


Accesse token jwt ;
const { token } = await r2.generateAccessToken({
  bucket: 'my-bucket',
  permissions: ['read', 'write'],
  expiresIn: 3600
});


download url ; const { downloadUrl } = await r2.getSignedDownloadUrl({
  fileKey: 'private.pdf',
  expiresIn: 60
});

list files ; 
const { files } = await r2.list({
  prefix: 'photos/',
  limit: 100
});

delete files; 
await r2.delete({
  fileUrl: 'https://...'
});

Auto cors configration ; await r2.configureCors({
  origins: ['https://example.com'],
  allowedMethods: ['GET']
});





check cors conf ; 
const result = await r2.verifyCors();
if (result.isValid) console.log('CORS OK');


auto trigger webhook ; const url = await r2.upload(file, {
  webhook: { url: '...', trigger: 'auto' }
});


manual trigger ; 
const url = await r2.upload(file, {
  webhook: { url: '...', trigger: 'manual' }
});


