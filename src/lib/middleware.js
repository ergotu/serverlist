/**
 * Custom middleware for security and rate limiting
 */

const requestCounts = new Map();
const RATE_LIMIT_WINDOW = (process.env.RATE_LIMIT_WINDOW || 5) * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "200", 10);

/**
 * Simple rate limiting middleware
 */
export function rateLimiter(req, res, next) {
  if (process.env.ENABLE_RATE_LIMIT !== "true") {
    return next();
  }

  const clientIp = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  // Clean old entries
  for (const [ip, data] of requestCounts.entries()) {
    if (now - data.firstRequest > RATE_LIMIT_WINDOW) {
      requestCounts.delete(ip);
    }
  }

  // Check current client
  const clientData = requestCounts.get(clientIp);

  if (!clientData) {
    requestCounts.set(clientIp, {
      firstRequest: now,
      count: 1,
    });
    return next();
  }

  if (now - clientData.firstRequest > RATE_LIMIT_WINDOW) {
    requestCounts.set(clientIp, {
      firstRequest: now,
      count: 1,
    });
    return next();
  }

  clientData.count++;

  if (clientData.count > RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: "Too many requests",
      retryAfter: Math.ceil(
        (RATE_LIMIT_WINDOW - (now - clientData.firstRequest)) / 1000,
      ),
    });
  }

  next();
}

/**
 * Access logging middleware
 */
export function accessLogger(req, res, next) {
  const startTime = Date.now();
  
  // Check if access logging should be enabled
  const isProduction = process.env.NODE_ENV === 'production';
  const logLevel = process.env.LOG_LEVEL;
  
  // Enable access logging if:
  // 1. Explicitly set to debug, OR
  // 2. In development mode (regardless of log level)
  const shouldLog = logLevel === 'debug' || !isProduction;
  
  if (shouldLog) {
    const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';
    const method = req.method;
    const url = req.originalUrl || req.url;
    const contentLength = req.get('Content-Length') || '0';
    const referer = req.get('Referer') || '-';
    
    // Log the incoming request with more details
    console.log(`[${new Date().toISOString()}] ACCESS: ${clientIp} "${method} ${url}" "${userAgent}" referer:"${referer}" content-length:${contentLength}`);
    
    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;
      const responseSize = res.get('Content-Length') || '-';
      const statusClass = Math.floor(statusCode / 100);
      const statusEmoji = statusClass === 2 ? '✅' : statusClass === 3 ? '↩️' : statusClass === 4 ? '❌' : '💥';
      
      console.log(`[${new Date().toISOString()}] RESPONSE: ${clientIp} "${method} ${url}" ${statusCode} ${responseSize}bytes ${duration}ms ${statusEmoji}`);
    });
  }
  
  next();
}

/**
 * Security headers middleware
 */
export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
}
