import { Router } from 'express';
import { validateApiKey, validateApiKeyPost } from '../controllers/apikey.controller.js';
import apiKeyMiddleware from '../middlewares/apikey.middleware.optimized.js';

const apiKeyRouter = Router();

// Validate API key and return user information (GET)
// Now uses Redis cache middleware for faster validation
apiKeyRouter.get('/validate', apiKeyMiddleware, validateApiKey);

// Validate API key and return user information (POST)
// Now uses Redis cache middleware for faster validation
apiKeyRouter.post('/validate', apiKeyMiddleware, validateApiKeyPost);

export default apiKeyRouter;