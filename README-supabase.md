# API Backend with Supabase

This project is a RESTful API backend built with Express.js and Supabase PostgreSQL database that handles authentication, user management, and subscriptions. It follows the file upload API plan outlined in `plan.md`.

## Tech Stack

- Node.js
- Express.js
- Supabase (PostgreSQL)
- JWT Authentication

## Features

- **Authentication**: User signup, login, JWT validation
- **User Management**: Create, read, update user profiles
- **Subscription Management**: Track and manage user subscriptions
- **API Key Management**: For authenticating with the file upload API
- **File Upload API**: Generate signed URLs for direct file uploads to storage providers
- **Analytics Tracking**: Track file uploads and usage

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v7 or higher)
- Supabase account and project

### Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd <project-folder>
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file with the following variables:
   ```
   PORT=5500
   JWT_SECRET=your_jwt_secret
   JWT_EXPIRES_IN="1d"
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```

4. Set up Supabase database:
   - Go to the Supabase dashboard
   - Navigate to the SQL editor
   - Run the SQL commands from `supabase-migration.sql`

5. Start the development server:
   ```bash
   npm run dev
   ```

## API Routes

### Authentication

- `POST /api/v1/auth/sign-up` - Register a new user
- `POST /api/v1/auth/sign-in` - Login a user
- `POST /api/v1/auth/sign-out` - Logout a user

### Users

- `GET /api/v1/users` - Get all users (admin only)
- `GET /api/v1/users/:id` - Get user by ID
- `GET /api/v1/users/me/profile` - Get current user profile
- `PUT /api/v1/users/me/profile` - Update current user

### Subscriptions

- `GET /api/v1/subscriptions` - Get all subscriptions for authenticated user
- `POST /api/v1/subscriptions` - Create a new subscription
- `GET /api/v1/subscriptions/:id` - Get subscription by ID
- `PUT /api/v1/subscriptions/:id` - Update a subscription
- `DELETE /api/v1/subscriptions/:id` - Delete a subscription
- `PUT /api/v1/subscriptions/:id/cancel` - Cancel a subscription

## File Upload API (Future Implementation)

As outlined in `plan.md`, the file upload API will include:

- `POST /upload/auth/validate` - Validate API key
- `POST /upload/signed-url` - Generate a signed URL for direct upload
- `POST /upload/analytics/track` - Track successful upload for analytics

## Migration from MongoDB to Supabase

This project has been migrated from MongoDB to Supabase PostgreSQL. The migration involves:

1. **Database Schema**: Creating tables in Supabase that correspond to MongoDB models
2. **Row Level Security**: Implementing security policies for data access
3. **Controllers**: Updated to use Supabase queries instead of Mongoose
4. **Authentication**: Using JWT with Supabase user management

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
