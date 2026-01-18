# AWS S3 Implementation - Task Checklist

## 🎯 Phase 1: Core S3 Upload Support (Week 1)

### Pre-Work
- [ ] Review R2 code structure (`controllers/providers/r2/`)
- [ ] Set up test AWS S3 buckets (us-east-1, eu-west-1, ap-south-1)
- [ ] Get AWS test credentials (access key + secret)
- [ ] Verify AWS SDK is installed (`@aws-sdk/client-s3`)

---

## Day 1: Configuration Files

### Create Region Config
- [x] Create `utils/aws/s3-regions.js`
- [x] Add 8 regions config (US, EU, Asia)
- [x] Add `isValidRegion()` function
- [x] Add `getRegionEndpoint()` function
- [x] Test: Validate region lookup works

### Create Storage Class Config
- [x] Create `utils/aws/s3-storage-classes.js`
- [x] Add 3 storage classes (STANDARD, STANDARD_IA, GLACIER_INSTANT_RETRIEVAL)
- [x] Add cost information
- [x] Add `isValidStorageClass()` function
- [x] Test: Validate storage class lookup works

### Create S3 Config Helper
- [x] Create `controllers/providers/s3/s3.config.js`
- [x] Copy validation logic from R2
- [x] Add S3-specific credential validation
- [x] Add S3 URL formatting functions
- [x] Add S3 error formatting
- [ ] Test: Run validation functions

---

## Day 2: Main Controller

### Create S3 Signed URL Controller
- [ ] Create `controllers/providers/s3/s3.signed-url.js`
- [ ] Copy base structure from `r2.signed-url.js`
- [ ] Add S3-specific imports (`S3Client`, `PutObjectCommand`)
- [ ] Extract S3 params (s3AccessKey, s3SecretKey, s3Bucket, s3Region, s3StorageClass)
- [ ] Add region validation
- [ ] Add storage class validation
- [ ] Create S3Client with region
- [ ] Add StorageClass to PutObjectCommand
- [ ] Add ServerSideEncryption: 'AES256'
- [ ] Generate presigned URL
- [ ] Build region-specific public URL
- [ ] Test: Generate URL manually with curl

---

## Day 3: Integration

### Add Routes
- [ ] Update `routes/upload.routes.js`
- [ ] Add `POST /s3/signed-url` route
- [ ] Import S3 controller
- [ ] Apply middleware (apiKey, rateLimit)
- [ ] Test: Route accessible

### Update Middleware
- [ ] Update `combined-rate-limit.middleware.js`
- [ ] Add 's3' to allowed providers (if needed)
- [ ] Test: Middleware allows S3 requests

### Add Analytics
- [ ] Copy R2 analytics pattern
- [ ] Track S3 uploads separately
- [ ] Log region, storage class, bucket
- [ ] Test: Analytics logged correctly

---

## Day 4: Testing

### Manual Testing
- [ ] Test us-east-1 upload
- [ ] Test eu-west-1 upload
- [ ] Test ap-south-1 upload
- [ ] Test all 8 regions
- [ ] Test STANDARD storage class
- [ ] Test STANDARD_IA storage class
- [ ] Test GLACIER_INSTANT_RETRIEVAL storage class
- [ ] Test invalid region error
- [ ] Test invalid storage class error
- [ ] Test missing credentials error

### Performance Testing
- [ ] Measure response time (<15ms target)
- [ ] Verify no external API calls
- [ ] Test concurrent requests
- [ ] Test quota system integration

### Real Upload Testing
- [ ] Upload 1KB file to S3
- [ ] Upload 1MB file to S3
- [ ] Upload 10MB file to S3
- [ ] Verify files appear in S3 bucket
- [ ] Verify storage class is correct
- [ ] Verify encryption enabled (SSE-S3)

---

## Day 5: Documentation & Polish

### Documentation
- [ ] Update API docs with S3 endpoint
- [ ] Add request/response examples
- [ ] Add region list
- [ ] Add storage class list
- [ ] Create IAM policy template
- [ ] Add "Beta" tag to S3 docs

### Code Polish
- [ ] Add detailed code comments
- [ ] Ensure error messages are clear
- [ ] Add request ID logging
- [ ] Clean up console.logs
- [ ] Final code review

### Launch Prep
- [ ] Create announcement draft
- [ ] Update changelog
- [ ] Notify team
- [ ] Beta launch! 🚀

---

## Success Criteria

### Must Have ✅
- [/] All 8 regions work
- [/] All 3 storage classes work
- [/] Response time <15ms (P95)
- [/] Files upload successfully to S3
- [/] Analytics track S3 usage
- [/] Error handling works
- [/] Documentation complete

### Performance ✅
- [/] Zero external API calls on hot path
- [/] Same scalability as R2
- [/] Quota system tracks S3 uploads
- [/] Rate limiting works

### Quality ✅
- [/] Code follows R2 patterns
- [/] Error messages are helpful
- [/] Logs are detailed
- [/] Tests pass

---

## Phase 2 Preview (Week 2)

- [ ] CloudFront CDN URLs
- [ ] Multipart uploads (>100MB files)
- [ ] Add 10 more regions (total 18)
- [ ] Add 4 more storage classes (total 7)

---

**Current Status:** Ready to start Day 1! 🚀
