import aj from '../config/arcjet.js';
import logger from '../utils/logger.js';

const arcjetMiddleware = async (req, res, next) => {
  try {
    // Skip Arcjet for API key validation and upload endpoints
    if (req.path.includes('/api/v1/apikeys/validate') || 
        req.path.includes('/api/v1/upload/') || 
        req.path.includes('/api/v1/analytics/')) {
      return next();
    }
    
    const decision = await aj.protect(req, { requested: 1 });

    if(decision.isDenied()) {
      if(decision.reason.isRateLimit()) return res.status(429).json({ error: 'Rate limit exceeded' });
      if(decision.reason.isBot()) return res.status(403).json({ error: 'Bot detected' });

      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  } catch (error) {
    logger.warn('Arcjet Middleware Error:', error.message);
    next(error);
  }
};

export default arcjetMiddleware;