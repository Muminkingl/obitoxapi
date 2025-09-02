# API Key Validation Service

A simple API service that validates API keys against your Supabase database and returns user information.

## Features

- Validates API keys in the format `ox_<random_string>`
- Checks against the `api_keys` table in your Supabase database
- Returns user information and profile data associated with the API key
- Updates the `last_used_at` timestamp when an API key is used

## Setup

1. Set up your environment variables:

```
# Server configuration
PORT=5500

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm start
```

## API Endpoints

### Validate API Key

```
GET /api/v1/apikeys/validate?apiKey=ox_your_key_here
```

or

```
POST /api/v1/apikeys/validate
Content-Type: application/json

{
  "apiKey": "ox_your_key_here"
}
```

You can also pass the API key in the header:

```
GET /api/v1/apikeys/validate
x-api-key: ox_your_key_here
```

### Response

A successful response will look like:

```json
{
  "success": true,
  "message": "Valid API key",
  "data": {
    "api_key": {
      "id": "api-key-uuid",
      "name": "My API Key",
      "status": "active",
      "created_at": "2023-05-01T12:00:00Z",
      "last_used_at": "2023-05-15T15:30:00Z"
    },
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe"
    },
    "plan": "pro",
    "profile": {
      "id": "profile-uuid",
      "subscription_plan": "pro",
      "other_profile_data": "..."
    }
  }
}
```

## Database Structure

This service expects your Supabase database to have the following structure:

### api_keys Table

```sql
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  key_value TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE
);
```

The API key validation endpoint will look for the `key_value` field to match the provided API key.

## Error Handling

- **401**: Invalid or missing API key
- **404**: User not found
- **500**: Server error