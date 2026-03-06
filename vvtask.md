in CF i got 
`PS D:\MUMIN\ObitoX\obitoxapi> npx wrangler tail --format pretty

 ⛅️ wrangler 4.70.0 (update available 4.71.0)
─────────────────────────────────────────────
Successfully created tail, expires at 2026-03-07T02:17:07Z
Connected to obitox-api, waiting for logs...
POST https://api.obitox.dev/api/v1/upload/r2/signed-url - Ok @ 3/7/2026, 12:15:22 AM
  (log) {"timestamp":"2026-03-06T21:15:23.020Z","level":"info","message":"[Redis] @upstash/redis HTTP client ready (CF Workers)"}
  (error) {"timestamp":"2026-03-06T21:15:23.717Z","level":"error","message":"[QUOTA] ❌ Redis not available - quota NOT incremented!"}
  (log) {"timestamp":"2026-03-06T21:15:23.717Z","level":"info","message":"R2 signed URL generated","requestId":"req_1772831723717_p69ypwmb2","totalTime":0,"signingTime":0}
POST https://api.obitox.dev/api/v1/upload/r2/signed-url - Ok @ 3/7/2026, 12:15:24 AM
  (error) {"timestamp":"2026-03-06T21:15:24.950Z","level":"error","message":"[QUOTA] ❌ Redis not available - quota NOT incremented!"}
  (log) {"timestamp":"2026-03-06T21:15:24.950Z","level":"info","message":"R2 signed URL generated","requestId":"req_1772831724950_xaga4dqqx","totalTime":0,"signingTime":0}
POST https://api.obitox.dev/api/v1/upload/r2/signed-url - Ok @ 3/7/2026, 12:15:25 AM
  (error) {"timestamp":"2026-03-06T21:15:26.032Z","level":"error","message":"[QUOTA] ❌ Redis not available - quota NOT incremented!"}
  (log) {"timestamp":"2026-03-06T21:15:26.032Z","level":"info","message":"R2 signed URL generated","requestId":"req_1772831726032_ws4wrftll","totalTime":0,"signingTime":0}
POST https://api.obitox.dev/api/v1/upload/r2/signed-url - Ok @ 3/7/2026, 12:15:26 AM
  (error) {"timestamp":"2026-03-06T21:15:26.773Z","level":"error","message":"[QUOTA] ❌ Redis not available - quota NOT incremented!"}
  (log) {"timestamp":"2026-03-06T21:15:26.773Z","level":"info","message":"R2 signed URL generated","requestId":"req_1772831726773_6plt5wi3a","totalTime":0,"signingTime":0}
POST https://api.obitox.dev/api/v1/upload/r2/batch/signed-urls - Ok @ 3/7/2026, 
12:15:27 AM
  (log) {"timestamp":"2026-03-06T21:15:27.705Z","level":"info","message":"[batch_1772831727705_fv7dmhpmd] ✅ Batch complete: 0/2 in 0ms"}
POST https://api.obitox.dev/api/v1/upload/r2/signed-url - Ok @ 3/7/2026, 12:15:27 AM
  (error) {"timestamp":"2026-03-06T21:15:27.986Z","level":"error","message":"[QUOTA] ❌ Redis not available - quota NOT incremented!"}
  (log) {"timestamp":"2026-03-06T21:15:27.986Z","level":"info","message":"R2 signed URL generated","requestId":"req_1772831727986_f4h57i1y3","totalTime":0,"signingTime":0}
POST https://api.obitox.dev/api/v1/webhooks/confirm - Ok @ 3/7/2026, 12:15:28 AM  (log) [Webhook Confirm] 🔄 Enqueueing webhook 3bad1ee5-a94f-466b-a905-7b7be1e00a82...
  (log) [Webhook Confirm] 📤 Enqueue result: true
POST https://api.obitox.dev/api/v1/upload/r2/signed-url - Ok @ 3/7/2026, 12:15:29 AM
  (error) {"timestamp":"2026-03-06T21:15:29.780Z","level":"error","message":"[QUOTA] ❌ Redis not available - quota NOT incremented!"}
  (log) {"timestamp":"2026-03-06T21:15:29.780Z","level":"info","message":"R2 signed URL generated","requestId":"req_1772831729780_ah7oey1q3","totalTime":0,"signingTime":0}
POST https://api.obitox.dev/api/v1/upload/r2/access-token - Ok @ 3/7/2026, 12:15:30 AM
  (log) {"timestamp":"2026-03-06T21:15:30.897Z","level":"info","message":"[token_1772831730897_7h90him4r] ✅ Token generated in 0ms"}
POST https://api.obitox.dev/api/v1/upload/r2/cors/setup - Ok @ 3/7/2026, 12:15:31 AM
POST https://api.obitox.dev/api/v1/upload/r2/cors/verify - Ok @ 3/7/2026, 12:15:31 AM
POST https://api.obitox.dev/api/v1/upload/r2/list - Ok @ 3/7/2026, 12:15:31 AM
  (error) {"timestamp":"2026-03-06T21:15:32.143Z","level":"error","message":"r2 
error:","error":{"$metadata":{"httpStatusCode":200,"attempts":1,"totalRetryDelay":0}}}
POST https://api.obitox.dev/api/v1/upload/r2/download-url - Ok @ 3/7/2026, 12:15:32 AM
  (log) {"timestamp":"2026-03-06T21:15:32.399Z","level":"info","message":"[Redis] @upstash/redis HTTP client ready (CF Workers)"}
  (warn) {"0":"\"","1":"[","2":"o","3":"b","4":"j","5":"e","6":"c","7":"t","8":" ","9":"O","10":"b","11":"j","12":"e","13":"c","14":"t","15":"]","16":"\"","17":" ","18":"i","19":"s","20":" ","21":"n","22":"o","23":"t","24":" ","25":"v","26":"a","27":"l","28":"i","29":"d","30":" ","31":"J","32":"S","33":"O","34":"N","timestamp":"2026-03-06T21:15:33.302Z","level":"warn","message":"Redis cache read error:"}
  (log) {"timestamp":"2026-03-06T21:15:34.045Z","level":"info","message":"[req_1772831734045_3ncz31211] ✅ Download URL generated in 0ms"}
POST https://api.obitox.dev/api/v1/upload/r2/signed-url - Ok @ 3/7/2026, 12:15:34 AM
  (error) {"timestamp":"2026-03-06T21:15:34.285Z","level":"error","message":"[QUOTA] ❌ Redis not available - quota NOT incremented!"}
  (log) {"timestamp":"2026-03-06T21:15:34.285Z","level":"info","message":"R2 signed URL generated","requestId":"req_1772831734285_53ocwkhq1","totalTime":0,"signingTime":0}
POST https://api.obitox.dev/api/v1/upload/r2/delete - Ok @ 3/7/2026, 12:15:35 AM



`


in the test i got 
`
PS D:\MUMIN\ObitoX\obitoxapi> node test/r2/test-r2-file-upload.js

╔══════════════════════════════════════════════════════════════╗
║        R2 PROVIDER — Image Upload + Webhook Live Test        ║
║        Docs source: walkthrough.md                           ║
║        Webhook: webhook.site/4c6a814e-4048-4df8-b759-76a7b...║
╚══════════════════════════════════════════════════════════════╝


━━━ Setup ━━━
  ✅ ObitoX client created
  ✅ r2 provider created
  ✅ r2.upload is a function
  ✅ r2.batchUpload is a function
  ✅ r2.generateAccessToken is a function
  ✅ r2.getSignedDownloadUrl is a function
  ✅ r2.list is a function
  ✅ r2.delete is a function
  ✅ r2.configureCors is a function
  ✅ r2.verifyCors is a function

━━━ Test 1: Basic Upload ━━━
✅ R2 signed URL generated in 0ms
🚀 R2 upload completed in 2296ms
  ✅ upload returns a string
  ✅ URL is reachable (http/https)
  🔗 Uploaded URL: https://pub-b0cab7bc004505800b231cb8f9a793f4.r2.dev/44c96eeb_r2-basic-upload_1772831723717_k389ov.jpg

━━━ Test 2: Progress Tracking ━━━
✅ R2 signed URL generated in 0ms
  📊 Progress: 100% - 307200/307200   🚀 R2 upload completed in 1112ms

  ✅ onProgress callback fired to 100%
  ✅ upload returned URL
  🔗 Uploaded URL: https://pub-b0cab7bc004505800b231cb8f9a793f4.r2.dev/44c96eeb_r2-progress-upload_1772831724950_hedskx.mp4

━━━ Test 3: Smart Expiration ━━━
✅ R2 signed URL generated in 0ms
🚀 R2 upload completed in 736ms
  ✅ smart expire upload returned URL
  🔗 Uploaded URL: https://pub-b0cab7bc004505800b231cb8f9a793f4.r2.dev/44c96eeb_r2-smart-expire_1772831726032_2ubnas.zip

━━━ Test 4: File Validation ━━━
   🔍 Validating file...
   ✅ File validation passed (120 KB)
✅ R2 signed URL generated in 0ms
🚀 R2 upload completed in 931ms
  ✅ validated upload returns URL
  🔗 Uploaded URL: https://pub-b0cab7bc004505800b231cb8f9a793f4.r2.dev/44c96eeb_r2-validation_1772831726773_8jii2p.jpg

━━━ Test 5: Batch Upload ━━━
✅ Generated 2 R2 URLs in 219ms (109.5ms per file)
  ❌ batch upload returns successful summary
  ✅ batch upload returned array of results
  🗂  Summary: {"total":2,"successful":0,"failed":2}

━━━ Test 6: Auto Trigger Webhook ━━━
✅ R2 signed URL generated in 0ms
🚀 R2 upload completed in 970ms
🔗 Webhook configured: 3bad1ee5-a94f-466b-a905-7b7be1e00a82
✅ Webhook confirmed
  ✅ webhook auto returned URL
  🔗 Uploaded URL: https://pub-b0cab7bc004505800b231cb8f9a793f4.r2.dev/44c96eeb_r2-webhook-auto_1772831727986_yk7agr.jpg
  ✉️  Webhook should appear at: https://webhook.site/4c6a814e-4048-4df8-b759-76a
7b981e61b

━━━ Test 7: Manual Trigger Webhook ━━━
✅ R2 signed URL generated in 0ms
🚀 R2 upload completed in 1142ms
🔗 Webhook configured: 0fe19837-1786-4b75-847c-5ac799f07825
  ✅ webhook manual returned URL
  🔗 Uploaded URL: https://pub-b0cab7bc004505800b231cb8f9a793f4.r2.dev/44c96eeb_r2-webhook-manual_1772831729780_x5hid7.jpg
  ✉️  Webhook should appear at: https://webhook.site/4c6a814e-4048-4df8-b759-76a
7b981e61b

━━━ Test 8: Generate Access Token (JWT) ━━━
  ✅ generateAccessToken returns token string
  🔑 Token: eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...

━━━ Test 9: Configure CORS ━━━
  ✅ configureCors completed without error

━━━ Test 10: Verify CORS ━━━
  ❌ verifyCors returned positive result

━━━ Test 11: List Files ━━━
  ❌ List Files (crashed) — R2 API request failed: 500 Internal Server Error - {"
success":false,"provider":"r2","error":"LIST_FAILED","message":"Failed to list files from R2","docs":"https://developers.cloudflare.com/r2/"}

━━━ Test 12: Signed Download URL ━━━
  ✅ getSignedDownloadUrl returns a string
  ✅ download URL starts with http
  🔗 Download URL: https://test.b0cab7bc004505800b231cb8f9a793f4.r2.cloudflarestorage.com/44c96eeb_r2-basic-upload_1772831723717_k389ov.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=8105c2c257b314edbc01fa0667cac2da%2F20260306%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20260306T211534Z&X-Amz-Expires=60&X-Amz-Signature=4a9c28ebc29921f1441c5b0fec6da83bbd40f09fb-b0cab7bc004505800b231cb8f9a793f4.r2.eaders=host&x-amz-checksum-mode=ENABLED&x-dev
/44c96eeb_r2-delete-target_1772831734285_fdew1e.jpg
  ✅ delete completed without error      R2 upload completed in 1052ms
                                      b-b0cab7bc004505800b231cb8f9a793f4.r2.dev
══════════════════════════════════════85_fdew1e.jpg══════════════════════════
📊  Results: 24 passed / 3 failed / 27 total                                ══════════════════════════
⚠️   3 test(s) failed.                  total
════════════════════════════════════════════════════════════════            ══════════════════════════

👉  Check your webhook inbox:
    https://webhook.site/4c6a814e-4048-4df8-b759-76a7b981e61b-4df8-b759-76a7b981e61b

PS D:\MUMIN\ObitoX\obitoxapi>`