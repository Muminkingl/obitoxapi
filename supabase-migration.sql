-- SUPABASE DATABASE SETUP FOR EXISTING FUNCTIONALITY

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table (to replace MongoDB User model)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL CHECK (char_length(name) >= 2),
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create subscriptions table (to replace MongoDB Subscription model)
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
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable row level security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policies for users table
CREATE POLICY "Users can view their own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own data" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Create policies for subscriptions table
CREATE POLICY "Users can view their own subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own subscriptions" ON public.subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions" ON public.subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions" ON public.subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- Create function to automatically update renewal_date if not provided
CREATE OR REPLACE FUNCTION public.calculate_renewal_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.renewal_date IS NULL THEN
    CASE NEW.frequency
      WHEN 'daily' THEN NEW.renewal_date := NEW.start_date + INTERVAL '1 day';
      WHEN 'weekly' THEN NEW.renewal_date := NEW.start_date + INTERVAL '7 days';
      WHEN 'monthly' THEN NEW.renewal_date := NEW.start_date + INTERVAL '30 days';
      WHEN 'yearly' THEN NEW.renewal_date := NEW.start_date + INTERVAL '365 days';
    END CASE;
  END IF;

  -- Auto-update the status if renewal date has passed
  IF NEW.renewal_date < NOW() THEN
    NEW.status := 'expired';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for renewal date calculation
CREATE TRIGGER set_renewal_date
BEFORE INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.calculate_renewal_date();

-- Create function for user authentication
CREATE OR REPLACE FUNCTION public.authenticate_user(
  email_input TEXT,
  password_hash TEXT
) RETURNS TABLE (
  user_id UUID,
  user_name VARCHAR,
  user_email VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id AS user_id,
    name AS user_name,
    email AS user_email
  FROM public.users
  WHERE email = email_input AND password = password_hash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
