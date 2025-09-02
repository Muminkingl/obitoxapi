import { Router } from 'express';
import { validateApiKey, validateApiKeyPost } from '../controllers/apikey.controller.js';

const apiKeyRouter = Router();

// Validate API key and return user information (GET)
apiKeyRouter.get('/validate', validateApiKey);

// Validate API key and return user information (POST)
apiKeyRouter.post('/validate', validateApiKeyPost);

export default apiKeyRouter;