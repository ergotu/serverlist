import express from "express";
import ejs from "ejs";
import apicache from "apicache";
import fs from "node:fs";
import
{
  loadServerConfig,
  getServersSortedByPriority,
} from "./lib/configLoader.js";
import { getAllowedHosts, getAvailableSeries } from "./lib/utils.js";
import { queryServer, isHostAllowed } from "./lib/serverQuery.js";
import { logger } from "./lib/logger.js";
import { securityHeaders, accessLogger } from "./lib/middleware.js";

// Parse command line arguments
const args = process.argv.slice(2);
let configPath = "./src/servers.json"; // default

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--config" || args[i] === "-c") {
    if (i + 1 < args.length) {
      configPath = args[i + 1];
      i++; // skip next argument since we used it
    } else {
      console.error("Error: --config flag requires a path argument");
      process.exit(1);
    }
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log("Usage: server-list [options]");
    console.log("Options:");
    console.log("  -c, --config <path>  Path to servers.json config file (default: ./src/servers.json)");
    console.log("  -h, --help          Show this help message");
    process.exit(0);
  }
}

const app = express();
const cache = apicache.middleware;

// Trust proxy for rate limiting
app.set("trust proxy", 1);

// Security and middleware
app.use(accessLogger);
app.use(securityHeaders);

// View engine and static files
app.engine("ejs", ejs.renderFile);
app.set("view engine", "ejs");
app.set("views", "./src/views");
app.use(express.static("./src/public"));

// Caching in production
const cacheTimeout = process.env.CACHE_DURATION || "30 seconds";
if (process.env.NODE_ENV === "production")
{
  app.use(cache(cacheTimeout));
  logger.info(`Caching enabled with timeout: ${ cacheTimeout }`);
}

// Load server configuration with hot reloading
let servers = {};
let allowedHosts = [];
let connectedClients = new Set();

function reloadServerConfig() {
  try {
    logger.debug(`Reloading server configuration from: ${configPath}`);
    const newServers = loadServerConfig(configPath);
    const newAllowedHosts = getAllowedHosts(newServers);
    
    logger.debug(`Previous config had ${Object.keys(servers).length} servers`);
    logger.debug(`New config has ${Object.keys(newServers).length} servers`);
    
    // Check if configuration actually changed
    const oldServerKeys = Object.keys(servers).sort();
    const newServerKeys = Object.keys(newServers).sort();
    const configChanged = JSON.stringify(oldServerKeys) !== JSON.stringify(newServerKeys) ||
                         JSON.stringify(servers) !== JSON.stringify(newServers);
    
    if (configChanged) {
      logger.debug(`Configuration changed detected`);
      logger.debug(`Old servers: [${oldServerKeys.join(', ')}]`);
      logger.debug(`New servers: [${newServerKeys.join(', ')}]`);
      
      servers = newServers;
      allowedHosts = newAllowedHosts;
      logger.info(`Server configuration reloaded: ${Object.keys(servers).length} servers`);
      logger.debug(`Updated allowed hosts: [${allowedHosts.join(', ')}]`);
      
      // Notify all connected clients about the configuration change
      const updateData = {
        type: 'config-update',
        servers: getServersSortedByPriority(servers),
        availableSeries: getAvailableSeries(servers)
      };
      
      logger.debug(`Notifying ${connectedClients.size} connected clients of config update`);
      connectedClients.forEach(client => {
        try {
          client.write(`data: ${JSON.stringify(updateData)}\n\n`);
        } catch (error) {
          logger.debug(`Failed to send update to client: ${error.message}`);
          connectedClients.delete(client);
        }
      });
    } else {
      logger.debug(`No configuration changes detected`);
    }
  } catch (error) {
    logger.error(`Failed to reload server configuration: ${error.message}`, error);
  }
}

// Initial load
reloadServerConfig();

// Watch for file changes
if (fs.existsSync(configPath)) {
  logger.debug(`Setting up file watcher for: ${configPath}`);
  fs.watchFile(configPath, { interval: 1000 }, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
      logger.debug(`Configuration file changed (mtime: ${prev.mtime} -> ${curr.mtime}), reloading...`);
      reloadServerConfig();
    }
  });
  logger.info(`Watching configuration file: ${configPath}`);
} else {
  logger.warn(`Configuration file not found for watching: ${configPath}`);
}

/**
 * API endpoint to query server status
 */
app.get("/:game/:ip", async (request, response) =>
{
  const startTime = Date.now();
  const { game, ip } = request.params;
  logger.debug(`API request: ${game}/${ip} from ${request.ip}`);

  try
  {
    const [host, port] = ip.split(":");

    // Validate input
    if (!host || !port || isNaN(parseInt(port, 10)))
    {
      logger.debug(`Invalid input format: host=${host}, port=${port}`);
      return response.status(400).json({
        error: "Invalid host or port format",
      });
    }

    // Validate host is allowed
    if (!isHostAllowed(host, allowedHosts))
    {
      logger.warn(`Forbidden access attempt to ${ host } from ${ request.ip }`);
      logger.debug(`Host ${host} not in allowed hosts: ${allowedHosts.join(', ')}`);
      return response.status(403).json({
        error: "Forbidden",
      });
    }
    
    logger.debug(`Host ${host} is allowed, proceeding with query`);

    // Find server configuration
    const serverInfo = servers[`${ host }:${ port }`];
    logger.debug(`Looking for server config: ${host}:${port}`);
    
    if (!serverInfo)
    {
      logger.debug(`No server configuration found for ${host}:${port}`);
      return response.status(404).json({
        error: "Server not found",
      });
    }
    
    logger.debug(`Found server config: ${JSON.stringify(serverInfo, null, 2)}`);

    // Query the server
    logger.debug(`Querying server: ${game} at ${host}:${port}`);
    const serverData = await queryServer(
      game,
      host,
      parseInt(port, 10),
      serverInfo,
    );

    const responseTime = Date.now() - startTime;
    logger.debug(`API query for ${ ip } completed in ${ responseTime }ms, online: ${serverData.online}`);

    response.json({
      game,
      ip,
      data: serverData,
      meta: {
        responseTime,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error)
  {
    const responseTime = Date.now() - startTime;
    logger.error(`Server query API error: ${ error.message }`, {
      game: request.params.game,
      ip: request.params.ip,
      responseTime,
    });

    return response.status(500).json({
      error: "Internal Server Error",
      meta: {
        responseTime,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

/**
 * Server-Sent Events endpoint for real-time updates
 */
app.get("/events", (request, response) => {
  const clientIp = request.ip || request.connection.remoteAddress;
  logger.debug(`SSE connection established from ${clientIp}`);
  
  // Set headers for Server-Sent Events
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Add client to connected clients set
  connectedClients.add(response);
  logger.debug(`Total SSE clients connected: ${connectedClients.size}`);

  // Send initial connection confirmation
  const welcomeMessage = { type: 'connected', timestamp: new Date().toISOString() };
  response.write(`data: ${JSON.stringify(welcomeMessage)}\n\n`);
  logger.debug(`Sent welcome message to ${clientIp}`);

  // Handle client disconnect
  request.on('close', () => {
    logger.debug(`SSE client ${clientIp} disconnected`);
    connectedClients.delete(response);
    logger.debug(`Remaining SSE clients: ${connectedClients.size}`);
  });

  request.on('error', (error) => {
    logger.debug(`SSE client ${clientIp} error: ${error.message}`);
    connectedClients.delete(response);
    logger.debug(`Remaining SSE clients: ${connectedClients.size}`);
  });
});

/**
 * Health check endpoint
 */
app.get("/health", (_request, response) =>
{
  response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    serverCount: Object.keys(servers).length,
    availableSeries: getAvailableSeries(servers),
  });
});

// file deepcode ignore NoRateLimitingForExpensiveWebOperation: global rate limit above
app.get(`/`, (request, response) =>
{
  logger.debug(`Home page request from ${request.ip}`);
  
  const availableSeries = getAvailableSeries(servers);
  const sortedServers = getServersSortedByPriority(servers);

  logger.debug(`Rendering page with ${Object.keys(sortedServers).length} servers`);
  logger.debug(`Available series: ${availableSeries.join(', ')}`);

  response.render(`index`, {
    servers: sortedServers,
    availableSeries,
  });
});

app.get(`/*splat`, (_request, response) => response.redirect(`/`));

/**
 * Error handling middleware
 */
app.use((error, _req, res, _next) =>
{
  logger.error(`Unhandled error: ${ error.message }`, error);
  res.status(500).json({
    error: "Internal Server Error",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Start the server
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
{
  logger.info(`Server listening on port ${ PORT }`);
  logger.info(`Environment: ${ process.env.NODE_ENV || "development" }`);
  logger.info(`Log level: ${ process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug') }`);
  logger.info(`Config file: ${ configPath }`);
  logger.info(`Loaded ${ Object.keys(servers).length } server configurations`);
  logger.debug(`Server configurations: ${Object.keys(servers).join(', ')}`);
  logger.debug(`Allowed hosts: ${allowedHosts.join(', ')}`);
  logger.debug(`Cache enabled: ${process.env.NODE_ENV === "production"}`);
  if (process.env.NODE_ENV === "production") {
    logger.debug(`Cache timeout: ${process.env.CACHE_DURATION || "30 seconds"}`);
  }
});

// Graceful shutdown
process.on("SIGTERM", () =>
{
  logger.info("SIGTERM received, shutting down gracefully");
  // Close file watcher
  if (fs.existsSync(configPath)) {
    fs.unwatchFile(configPath);
  }
  // Close all SSE connections
  connectedClients.forEach(client => {
    try {
      client.end();
    } catch (error) {
      // Ignore errors when closing connections
    }
  });
  process.exit(0);
});

process.on("SIGINT", () =>
{
  logger.info("SIGINT received, shutting down gracefully");
  // Close file watcher
  if (fs.existsSync(configPath)) {
    fs.unwatchFile(configPath);
  }
  // Close all SSE connections
  connectedClients.forEach(client => {
    try {
      client.end();
    } catch (error) {
      // Ignore errors when closing connections
    }
  });
  process.exit(0);
});
