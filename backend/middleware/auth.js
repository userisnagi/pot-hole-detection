// API Key Authentication Middleware
// Currently disabled - allows all requests (open API for same network)

const validateApiKey = (req, res, next) => {
  // API key validation is disabled - allow all requests
  // Anyone on the same network can send data
  next();
};

export default validateApiKey;

