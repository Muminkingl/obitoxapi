# API Backend with API Key Authentication

This API backend connects to your Supabase database and uses API key authentication for all endpoints. It's designed to work with your Next.js frontend project that generates API keys in the format `ox_<random_string>`.

## Features

- **API Key Authentication**: All endpoints require a valid API key header
- **Subscription Management**: Create, read, update, and delete subscriptions
- **User Profile Access**: Get user information based on the API key
- **Workflow Automation**: Email reminders for upcoming subscription renewals

## Setup Instructions

### 1. Database Setup

The API connects to your existing Supabase database. If you need to create the subscriptions table, run this SQL in the Supabase SQL editor:

```sql
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL CHECK (char_length(name) >= 2),
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'EUR', 'GBP')),
  frequency VARCHAR(10) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  category VARCHAR(20) NOT NULL CHECK (category IN ('sports', 'news', 'entertainment', 'lifestyle', 'technology', 'finance', 'politics', 'other')),
  payment_method VARCHAR(255) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  renewal_date TIMESTAMP WITH TIME ZONE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable row level security for subscriptions table
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policies for subscriptions table
CREATE POLICY "Users can view their own subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own subscriptions" ON public.subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions" ON public.subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions" ON public.subscriptions
  FOR DELETE USING (auth.uid() = user_id);
```

### 2. Environment Variables

Create a `.env` file with the following:

```
PORT=5500
SERVER_URL="http://localhost:5500"
NODE_ENV=development

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### 3. Installation & Running

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run in production mode
npm start
```

## API Authentication

All API requests must include the API key in the header:

```
x-api-key: ox_your_api_key_here
```

The API key must be generated from your frontend application and must be in the format `ox_<random_string>`. The API validates that the key exists in the `api_keys` table and is associated with a valid user.

## API Endpoints

### Subscriptions

- **GET /api/v1/subscriptions**  
  Get all subscriptions for the authenticated user

- **GET /api/v1/subscriptions/:id**  
  Get a specific subscription by ID

- **POST /api/v1/subscriptions**  
  Create a new subscription
  ```json
  {
    "name": "Netflix",
    "price": 15.99,
    "currency": "USD",
    "frequency": "monthly",
    "category": "entertainment",
    "paymentMethod": "Credit Card",
    "startDate": "2023-01-01T00:00:00Z"
  }
  ```

- **PUT /api/v1/subscriptions/:id**  
  Update an existing subscription

- **DELETE /api/v1/subscriptions/:id**  
  Delete a subscription

- **GET /api/v1/subscriptions/upcoming-renewals**  
  Get upcoming renewals (defaults to next 30 days)

### Users

- **GET /api/v1/users/me**  
  Get the current user's profile based on the API key

### Workflows

- **POST /api/v1/workflows/subscription/reminder**  
  Send reminders for upcoming subscription renewals

## Error Handling

The API returns appropriate HTTP status codes:

- **200**: Success
- **201**: Resource created
- **400**: Bad request
- **401**: Unauthorized (invalid API key)
- **403**: Forbidden
- **404**: Resource not found
- **500**: Server error

## Security

- API keys are validated with every request
- The API tracks usage of each API key
- API keys can only access data belonging to their associated user
- Data is validated before being stored or returned

## Integration with Frontend

This API is designed to work with your Next.js frontend. Users should create API keys in the frontend, which stores them in the Supabase `api_keys` table. These keys can then be used to access this API.
