
hello claude in this project i have a issus 
first of all this project is running in 2 way 
1; thw hole project is running on Cloudflare worker CF unless the worker
2; the workers,cron jobs Running on digital ocean ssh which run 'node ecosystem.ejs' and its working only for job 

i have a issus now this project is running in production the cloudflare worker is running on this domain also api.obitox.dev , but the ssh still on ip address i didnt added my domain to that ssh yet 64.23.251.191

SO the issus is one thing
i made this test i wanted to test how obitox is work on live i made this test , when i run it i got this results  `PS D:\MUMIN\ObitoX\obitoxapi> node d:\MUMIN\ObitoX\obitoxapi\test\uploadcare\test-uploadcare-image-upload.js

╔══════════════════════════════════════════════════════════════╗
║   UPLOADCARE PROVIDER — Image Upload + Webhook Live Test    ║ 
║   Docs source: vvtask.md                                   ║  
║   Webhook: webhook.site/4c6a814e-4048-4df8-b759-76a7b981e61b ║
╚══════════════════════════════════════════════════════════════╝


━━━ Setup ━━━
  ✅ ObitoX client created
  ✅ uploadcare provider created
  ✅ uploadcare.upload is a function
  ✅ uploadcare.download is a function
  ✅ uploadcare.delete is a function

━━━ Test 1: Basic Image Upload ━━━
✅ Uploaded to Uploadcare: https://ucarecdn.com/967b82bb-4e3d-4696-98e1-0a7369244
36a/test-image.jpg
  ✅ upload returns a string
  ✅ URL is reachable (https)
  ✅ URL contains ucarecdn domain
  🔗 Uploaded URL: https://ucarecdn.com/967b82bb-4e3d-4696-98e1-0a736924436a/test-image.jpg

━━━ Test 2: Upload with Progress Tracking ━━━
  📊 Progress: 100%   ✅ Uploaded to Uploadcare: https://ucarecdn.com/59bd4741-1c
90-42f0-9417-e7841dcd7fdb/test-progress.jpg

  ✅ onProgress callback fired
  ✅ upload returned URL
  🔗 Uploaded URL: https://ucarecdn.com/59bd4741-1c90-42f0-9417-e7841dcd7fdb/test-progress.jpg

━━━ Test 3: Auto Image Optimization ━━━
✅ Uploaded to Uploadcare: https://ucarecdn.com/3d58bd4f-c465-46e9-97eb-ffc1ebdc2
311/test-opt-auto.jpg
✅ Image optimization applied
  ✅ auto-optimized upload returns URL
  🔗 Optimized URL: https://ucarecdn.com/3d58bd4f-c465-46e9-97eb-ffc1ebdc2311/-/preview/-/format/webp/-/quality/smart/-/progressive/yes/test-opt-auto.jpg       

━━━ Test 4: Manual Image Optimization ━━━
✅ Uploaded to Uploadcare: https://ucarecdn.com/72db7d03-df6d-48d0-8ea5-fdacc8a03
bd0/test-opt-manual.jpg
✅ Image optimization applied
  ✅ manual-optimized upload returns URL
  🔗 Optimized URL: https://ucarecdn.com/72db7d03-df6d-48d0-8ea5-fdacc8a03bd0/-/preview/-/format/webp/-/quality/best/-/progressive/yes/test-opt-manual.jpg      

━━━ Test 5: Webhook — Auto Trigger ━━━
  📡 Webhook receiver: https://webhook.site/4c6a814e-4048-4df8-b759-76a7b981e61b✅ Uploaded to Uploadcare: https://ucarecdn.com/814275e6-96ae-4959-9be7-6761bf20d
806/test-webhook-auto.jpg
  ✅ webhook auto — upload returned URL
  ✅ webhook auto — URL is on ucarecdn
  🔗 File URL: https://ucarecdn.com/814275e6-96ae-4959-9be7-6761bf20d806/test-webhook-auto.jpg
  ✉️  Webhook should appear at: https://webhook.site/4c6a814e-4048-4df8-b759-76a
7b981e61b

━━━ Test 6: Webhook — Manual Trigger ━━━
  📡 Webhook receiver: https://webhook.site/4c6a814e-4048-4df8-b759-76a7b981e61b✅ Uploaded to Uploadcare: https://ucarecdn.com/fc642d08-57ed-4f4c-abfb-4da5b0380
cbe/test-webhook-manual.jpg
  ✅ webhook manual — upload returned URL
  ✅ webhook manual — URL is on ucarecdn
  🔗 File URL: https://ucarecdn.com/fc642d08-57ed-4f4c-abfb-4da5b0380cbe/test-webhook-manual.jpg
  ✉️  Webhook should appear at: https://webhook.site/4c6a814e-4048-4df8-b759-76a
7b981e61b

━━━ Test 8: Delete File ━━━
✅ Uploaded to Uploadcare: https://ucarecdn.com/3f69d06e-c335-493f-a0e3-bbeb21b3b
872/test-delete.jpg
  🗂  Uploaded for deletion: https://ucarecdn.com/3f69d06e-c335-493f-a0e3-bbeb21
b3b872/test-delete.jpg
✅ Deleted Uploadcare file: https://ucarecdn.com/3f69d06e-c335-493f-a0e3-bbeb21b3
b872/test-delete.jpg
  ✅ delete completed without error

━━━ Test 7: Get CDN Download URL ━━━
  ✅ download returns a string
  ✅ download URL starts with http
  🔗 Download URL: https://ucarecdn.com/967b82bb-4e3d-4696-98e1-0a736924436a/test-image.jpg

════════════════════════════════════════════════════════════════
📊  Results: 19 passed / 0 failed / 19 total
🎯  ALL TESTS PASSED — uploadcare provider is working correctly!
════════════════════════════════════════════════════════════════

👉  Check your webhook inbox:
    https://webhook.site/4c6a814e-4048-4df8-b759-76a7b981e61b

PS D:\MUMIN\ObitoX\obitoxapi> ` so it 100/100 but when i see the log from CLoudflare worker by typing `npx wrangler tail --format pretty` i got this `
 ⛅️ wrangler 4.70.0 (update available 4.71.0)
─────────────────────────────────────────────
Successfully created tail, expires at 2026-03-06T17:44:44Z
Connected to obitox-api, waiting for logs...
POST https://api.obitox.dev/api/v1/upload/uploadcare/signed-url - Ok @ 3/6/2026, 2:44:48 PM
  (error) {"0":"T","1":"h","2":"e","3":" ","4":"'","5":"c","6":"a","7":"c","8":"h","9":"e","10":"'","11":" ","12":"f","13":"i","14":"e","15":"l","16":"d","17":" ","18":"o","19":"n","20":" ","21":"'","22":"R","23":"e","24":"q","25":"u","26":"e","27":"s","28":"t","29":"I","30":"n","31":"i","32":"t","33":"i","34":"a","35":"l","36":"i","37":"z","38":"e","39":"r","40":"D","41":"i","42":"c","43":"t","44":"'","45":" ","46":"i","47":"s","48":" ","49":"n","50":"o","51":"t","52":" ","53":"i","54":"m","55":"p","56":"l","57":"e","58":"m","59":"e","60":"n","61":"t","62":"e","63":"d","64":".","timestamp":"2026-03-06T11:44:52.384Z","level":"error","message":"[rate_1772797488097] Error (4287ms):"}
  (error) {"timestamp":"2026-03-06T11:44:52.384Z","level":"error","message":"tier cache error:","error":{}}
  (error) {"timestamp":"2026-03-06T11:44:52.384Z","level":"error","message":"quota manager error:","error":{}}
  (log) {"timestamp":"2026-03-06T11:44:52.384Z","level":"info","message":"Uploadcare signed URL generated","requestId":"req_1772797492384_1ieo3e189","totalTime":0}
POST https://api.obitox.dev/api/v1/upload/uploadcare/signed-url - Ok @ 3/6/2026, 2:44:54 PM
  (error) {"0":"T","1":"h","2":"e","3":" ","4":"'","5":"c","6":"a","7":"c","8":"h","9":"e","10":"'","11":" ","12":"f","13":"i","14":"e","15":"l","16":"d","17":" ","18":"o","19":"n","20":" ","21":"'","22":"R","23":"e","24":"q","25":"u","26":"e","27":"s","28":"t","29":"I","30":"n","31":"i","32":"t","33":"i","34":"a","35":"l","36":"i","37":"z","38":"e","39":"r","40":"D","41":"i","42":"c","43":"t","44":"'","45":" ","46":"i","47":"s","48":" ","49":"n","50":"o","51":"t","52":" ","53":"i","54":"m","55":"p","56":"l","57":"e","58":"m","59":"e","60":"n","61":"t","62":"e","63":"d","64":".","timestamp":"2026-03-06T11:44:58.330Z","level":"error","message":"[rate_1772797494043] Error (4287ms):"}
  (error) {"timestamp":"2026-03-06T11:44:58.330Z","level":"error","message":"tier cache error:","error":{}}
  (error) {"timestamp":"2026-03-06T11:44:58.330Z","level":"error","message":"quota manager error:","error":{}}
  (log) {"timestamp":"2026-03-06T11:44:58.330Z","level":"info","message":"Uploadcare signed URL generated","requestId":"req_1772797498330_cjlgevd1n","totalTime":0}
  (error) {"timestamp":"2026-03-06T11:45:02.797Z","level":"error","message":"The 'cache' field on 'RequestInitializerDict' is not implemented."}
POST https://api.obitox.dev/api/v1/upload/uploadcare/signed-url - Ok @ 3/6/2026, 2:45:04 PM
  (warn) {"0":"T","1":"h","2":"e","3":" ","4":"'","5":"c","6":"a","7":"c","8":"h","9":"e","10":"'","11":" ","12":"f","13":"i","14":"e","15":"l","16":"d","17":" 
","18":"o","19":"n","20":" ","21":"'","22":"R","23":"e","24":"q","25":"u","26":"e","27":"s","28":"t","29":"I","30":"n","31":"i","32":"t","33":"i","34":"a","35":"l","36":"i","37":"z","38":"e","39":"r","40":"D","41":"i","42":"c","43":"t","44":"'","45":" ","46":"i","47":"s","48":" ","49":"n","50":"o","51":"t","52":" ","53":"i","54":"m","55":"p","56":"l","57":"e","58":"m","59":"e","60":"n","61":"t","62":"e","63":"d","64":".","timestamp":"2026-03-06T11:45:08.963Z","level":"warn","message":"Redis cache read error:"}
  (error) {"0":"T","1":"h","2":"e","3":" ","4":"'","5":"c","6":"a","7":"c","8":"h","9":"e","10":"'","11":" ","12":"f","13":"i","14":"e","15":"l","16":"d","17":" ","18":"o","19":"n","20":" ","21":"'","22":"R","23":"e","24":"q","25":"u","26":"e","27":"s","28":"t","29":"I","30":"n","31":"i","32":"t","33":"i","34":"a","35":"l","36":"i","37":"z","38":"e","39":"r","40":"D","41":"i","42":"c","43":"t","44":"'","45":" ","46":"i","47":"s","48":" ","49":"n","50":"o","51":"t","52":" ","53":"i","54":"m","55":"p","56":"l","57":"e","58":"m","59":"e","60":"n","61":"t","62":"e","63":"d","64":".","timestamp":"2026-03-06T11:45:13.363Z","level":"error","message":"[rate_1772797509076] Error (4287ms):"}
  (error) {"timestamp":"2026-03-06T11:45:13.363Z","level":"error","message":"tier cache error:","error":{}}
  (error) {"timestamp":"2026-03-06T11:45:13.363Z","level":"error","message":"quota manager error:","error":{}}
  (log) {"timestamp":"2026-03-06T11:45:13.363Z","level":"info","message":"Uploadcare signed URL generated","requestId":"req_1772797513363_b3q1l4bqf","totalTime":0}
  (warn) {"0":"T","1":"h","2":"e","3":" ","4":"'","5":"c","6":"a","7":"c","8":"h","9":"e","10":"'","11":" ","12":"f","13":"i","14":"e","15":"l","16":"d","17":" 
","18":"o","19":"n","20":" ","21":"'","22":"R","23":"e","24":"q","25":"u","26":"e","27":"s","28":"t","29":"I","30":"n","31":"i","32":"t","33":"i","34":"a","35":"l","36":"i","37":"z","38":"e","39":"r","40":"D","41":"i","42":"c","43":"t","44":"'","45":" ","46":"i","47":"s","48":" ","49":"n","50":"o","51":"t","52":" ","53":"i","54":"m","55":"p","56":"l","57":"e","58":"m","59":"e","60":"n","61":"t","62":"e","63":"d","64":".","timestamp":"2026-03-06T11:45:13.363Z","level":"warn","message":"Redis cache write error:"}
POST https://api.obitox.dev/api/v1/upload/uploadcare/signed-url - Ok @ 3/6/2026, 2:45:15 PM
  (error) {"0":"T","1":"h","2":"e","3":" ","4":"'","5":"c","6":"a","7":"c","8":"h","9":"e","10":"'","11":" ","12":"f","13":"i","14":"e","15":"l","16":"d","17":" ","18":"o","19":"n","20":" ","21":"'","22":"R","23":"e","24":"q","25":"u","26":"e","27":"s","28":"t","29":"I","30":"n","31":"i","32":"t","33":"i","34":"a","35":"l","36":"i","37":"z","38":"e","39":"r","40":"D","41":"i","42":"c","43":"t","44":"'","45":" ","46":"i","47":"s","48":" ","49":"n","50":"o","51":"t","52":" ","53":"i","54":"m","55":"p","56":"l","57":"e","58":"m","59":"e","60":"n","61":"t","62":"e","63":"d","64":".","timestamp":"2026-03-06T11:45:19.462Z","level":"error","message":"[rate_1772797515175] Error (4287ms):"}
  (error) {"timestamp":"2026-03-06T11:45:19.462Z","level":"error","message":"tier cache error:","error":{}}
  (error) {"timestamp":"2026-03-06T11:45:19.462Z","level":"error","message":"quota manager error:","error":{}}
  (log) {"timestamp":"2026-03-06T11:45:19.462Z","level":"info","message":"Uploadcare signed URL generated","requestId":"req_1772797519462_c3a5qresl","totalTime":0}
DELETE https://api.obitox.dev/api/v1/upload/uploadcare/delete - Ok @ 3/6/2026, 2:45:21 PM
  (error) {"0":"T","1":"h","2":"e","3":" ","4":"'","5":"c","6":"a","7":"c","8":"h","9":"e","10":"'","11":" ","12":"f","13":"i","14":"e","15":"l","16":"d","17":" ","18":"o","19":"n","20":" ","21":"'","22":"R","23":"e","24":"q","25":"u","26":"e","27":"s","28":"t","29":"I","30":"n","31":"i","32":"t","33":"i","34":"a","35":"l","36":"i","37":"z","38":"e","39":"r","40":"D","41":"i","42":"c","43":"t","44":"'","45":" ","46":"i","47":"s","48":" ","49":"n","50":"o","51":"t","52":" ","53":"i","54":"m","55":"p","56":"l","57":"e","58":"m","59":"e","60":"n","61":"t","62":"e","63":"d","64":".","timestamp":"2026-03-06T11:45:25.383Z","level":"error","message":"[rate_1772797521096] Error (4287ms):"}
  (error) {"timestamp":"2026-03-06T11:45:25.383Z","level":"error","message":"tier cache error:","error":{}}
  (error) {"timestamp":"2026-03-06T11:45:25.383Z","level":"error","message":"quota manager error:","error":{}}
  (log) {"timestamp":"2026-03-06T11:45:25.383Z","level":"info","message":"[req_1772797525383_titaq4wvy] Deleting from Uploadcare: 3f69d06e-c335-493f-a0e3-bbeb21b3b872"}
` so i got this issus and in the https://webhook.site/#!/view/4c6a814e-4048-4df8-b759-76a7b981e61b i didnt got any notify so the issus is ere i asked one of my dev to see what caused this he said this he might be wrong but idk what i do to fix this 