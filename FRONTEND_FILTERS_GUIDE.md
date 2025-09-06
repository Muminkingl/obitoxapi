# 🎯 Frontend Filters Implementation Guide

## 🚀 Overview

Your file upload SDK now supports **complete frontend filtering** with granular usage tracking! This guide shows your developers how to implement all the filters using the new database structure.

## 📊 Database Structure

### New Tables Created:
- **`file_uploads`** - Individual file upload records
- **`daily_usage`** - Aggregated daily statistics  
- **`api_requests`** - Individual API call records

### Helpful Views:
- **`provider_usage_detailed`** - Provider usage with file type breakdown
- **`daily_usage_summary`** - Daily usage summaries

## 🎯 Supported Filters

### 1. ✅ Provider Filters
```sql
-- Get usage by specific provider
SELECT * FROM provider_usage_detailed 
WHERE api_key_id = $1 AND provider = 'vercel';

-- Get usage by multiple providers
SELECT * FROM provider_usage_detailed 
WHERE api_key_id = $1 AND provider IN ('supabase', 'uploadcare');
```

### 2. ✅ File Type Filters
```sql
-- Get usage by specific file type
SELECT * FROM file_uploads 
WHERE api_key_id = $1 AND file_type = 'image/jpeg';

-- Get usage by file type category
SELECT * FROM file_uploads 
WHERE api_key_id = $1 AND file_type LIKE 'image/%';

-- Get file type breakdown for a provider
SELECT 
  file_type,
  COUNT(*) as count,
  SUM(file_size) as total_size
FROM file_uploads 
WHERE api_key_id = $1 AND provider = 'vercel'
GROUP BY file_type;
```

### 3. ✅ Calendar Range Filters

#### Today
```sql
SELECT * FROM daily_usage_summary 
WHERE api_key_id = $1 AND usage_date = CURRENT_DATE;
```

#### Yesterday
```sql
SELECT * FROM daily_usage_summary 
WHERE api_key_id = $1 AND usage_date = CURRENT_DATE - INTERVAL '1 day';
```

#### Last 7 Days
```sql
SELECT * FROM daily_usage_summary 
WHERE api_key_id = $1 
AND usage_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY usage_date DESC;
```

#### Last 30 Days
```sql
SELECT * FROM daily_usage_summary 
WHERE api_key_id = $1 
AND usage_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY usage_date DESC;
```

#### Custom Date Range
```sql
SELECT * FROM daily_usage_summary 
WHERE api_key_id = $1 
AND usage_date BETWEEN $2 AND $3
ORDER BY usage_date DESC;
```

## 🔥 Advanced Filter Combinations

### Provider + File Type + Date Range
```sql
SELECT 
  provider,
  file_type,
  usage_date,
  total_uploads,
  total_file_size
FROM daily_usage 
WHERE api_key_id = $1 
AND provider = 'vercel'
AND file_type = 'image/jpeg'
AND usage_date BETWEEN $2 AND $3
ORDER BY usage_date DESC;
```

### Multiple Providers + File Types + Date Range
```sql
SELECT 
  provider,
  file_type,
  usage_date,
  total_uploads,
  total_file_size
FROM daily_usage 
WHERE api_key_id = $1 
AND provider IN ('supabase', 'vercel', 'uploadcare')
AND file_type IN ('image/jpeg', 'image/png', 'video/mp4')
AND usage_date BETWEEN $2 AND $3
ORDER BY usage_date DESC;
```

## 📈 Analytics Queries

### Total Usage by Provider (Last 30 Days)
```sql
SELECT 
  provider,
  SUM(total_uploads) as total_uploads,
  SUM(total_file_size) as total_file_size,
  AVG(total_file_size) as avg_file_size
FROM daily_usage_summary 
WHERE api_key_id = $1 
AND usage_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY provider
ORDER BY total_file_size DESC;
```

### File Type Distribution
```sql
SELECT 
  file_type,
  COUNT(*) as upload_count,
  SUM(file_size) as total_size,
  AVG(file_size) as avg_size
FROM file_uploads 
WHERE api_key_id = $1 
AND upload_status = 'success'
GROUP BY file_type
ORDER BY upload_count DESC;
```

### Daily Usage Trends
```sql
SELECT 
  usage_date,
  SUM(total_uploads) as daily_uploads,
  SUM(total_file_size) as daily_size
FROM daily_usage_summary 
WHERE api_key_id = $1 
AND usage_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY usage_date
ORDER BY usage_date DESC;
```

## 🎨 Frontend Implementation Examples

### React/Next.js Hook Example
```typescript
import { useState, useEffect } from 'react';
import { supabase } from './supabase';

interface UsageFilters {
  provider?: string[];
  fileType?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
}

export function useUsageAnalytics(apiKeyId: string, filters: UsageFilters) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsage() {
      setLoading(true);
      
      let query = supabase
        .from('daily_usage_summary')
        .select('*')
        .eq('api_key_id', apiKeyId);

      // Apply provider filter
      if (filters.provider?.length) {
        query = query.in('provider', filters.provider);
      }

      // Apply date range filter
      if (filters.dateRange) {
        query = query
          .gte('usage_date', filters.dateRange.start)
          .lte('usage_date', filters.dateRange.end);
      }

      const { data, error } = await query.order('usage_date', { ascending: false });
      
      if (!error) {
        setData(data);
      }
      
      setLoading(false);
    }

    fetchUsage();
  }, [apiKeyId, filters]);

  return { data, loading };
}
```

### Vue.js Composable Example
```typescript
import { ref, computed, watch } from 'vue';
import { supabase } from './supabase';

export function useUsageAnalytics(apiKeyId: string) {
  const data = ref(null);
  const loading = ref(true);
  const filters = ref({
    provider: [],
    fileType: [],
    dateRange: null
  });

  const filteredData = computed(() => {
    if (!data.value) return [];
    
    return data.value.filter(item => {
      // Apply filters here
      if (filters.value.provider.length && !filters.value.provider.includes(item.provider)) {
        return false;
      }
      // Add more filter logic
      return true;
    });
  });

  async function fetchData() {
    loading.value = true;
    const { data: result, error } = await supabase
      .from('daily_usage_summary')
      .select('*')
      .eq('api_key_id', apiKeyId);
    
    if (!error) {
      data.value = result;
    }
    loading.value = false;
  }

  watch([apiKeyId, filters], fetchData, { immediate: true });

  return {
    data: filteredData,
    loading,
    filters,
    fetchData
  };
}
```

## 🚀 Quick Start

### Step 1: Run Database Setup
```sql
-- 1. Create the tables
\i create_usage_tables.sql

-- 2. Migrate existing data
\i migrate_existing_usage_data.sql
```

### Step 2: Update Your Controllers
The controllers are already updated to write to the new tables automatically!

### Step 3: Test Your Filters
```sql
-- Test provider filter
SELECT * FROM provider_usage_detailed WHERE provider = 'vercel';

-- Test file type filter  
SELECT * FROM file_uploads WHERE file_type = 'image/jpeg';

-- Test date range filter
SELECT * FROM daily_usage_summary WHERE usage_date >= '2025-01-01';
```

## 🎯 Filter Options Reference

### Provider Options
- `supabase` - Supabase Storage
- `vercel` - Vercel Blob
- `uploadcare` - Uploadcare

### File Type Categories
- **Images**: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- **Videos**: `video/mp4`, `video/avi`, `video/mov`
- **Audio**: `audio/mp3`, `audio/wav`, `audio/ogg`
- **Documents**: `application/pdf`, `text/plain`, `application/json`
- **Archives**: `application/zip`, `application/gzip`

### Date Range Options
- **Today**: `CURRENT_DATE`
- **Yesterday**: `CURRENT_DATE - INTERVAL '1 day'`
- **Last 7 days**: `CURRENT_DATE - INTERVAL '7 days'`
- **Last 30 days**: `CURRENT_DATE - INTERVAL '30 days'`
- **Custom range**: `BETWEEN 'start_date' AND 'end_date'`

## 🎉 You're All Set!

Your frontend can now implement:
- ✅ **Provider filters** - Filter by storage provider
- ✅ **File type filters** - Filter by MIME type or category  
- ✅ **Calendar range filters** - Today, yesterday, custom ranges
- ✅ **Combined filters** - Mix and match any combination
- ✅ **Real-time updates** - Data updates automatically as files are uploaded

The database structure is optimized for fast queries and your controllers are already writing to the new tables! 🚀
