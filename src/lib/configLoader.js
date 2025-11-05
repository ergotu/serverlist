import fs from "node:fs";
import { validateServersConfig, setConfigDefaults } from "./configValidator.js";

/**
 * Load and validate server configuration
 */
export function loadServerConfig(configPath = "./src/servers.json") {
  try {
    console.log(`[CONFIG] Reading config file: ${configPath}`);
    const configData = fs.readFileSync(configPath, "utf8");
    console.log(`[CONFIG] Config file size: ${configData.length} bytes`);
    
    const rawServers = JSON.parse(configData);
    console.log(`[CONFIG] Parsed ${Object.keys(rawServers).length} raw server configurations`);
    console.log(`[CONFIG] Raw server keys: [${Object.keys(rawServers).join(', ')}]`);

    // Apply defaults to all server configs
    const servers = {};
    for (const [key, config] of Object.entries(rawServers)) {
      const beforeDefaults = { ...config };
      servers[key] = setConfigDefaults(config);
      console.log(`[CONFIG] Applied defaults to server: ${key}`);
      console.log(`[CONFIG]   Before: ${JSON.stringify(beforeDefaults)}`);
      console.log(`[CONFIG]   After:  ${JSON.stringify(servers[key])}`);
    }

    // Validate configuration
    console.log(`[CONFIG] Validating server configurations...`);
    const validation = validateServersConfig(servers);
    if (validation.hasErrors) {
      console.error("[CONFIG] Server configuration validation errors:");
      for (const [serverKey, errors] of Object.entries(validation.errors)) {
        console.error(`[CONFIG]   ${serverKey}:`);
        for (const error of errors) {
          console.error(`[CONFIG]     - ${error}`);
        }
      }
      throw new Error("Invalid server configuration");
    }

    console.log(`[CONFIG] Successfully loaded ${Object.keys(servers).length} server configurations`);
    return servers;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(`[CONFIG] Configuration file not found: ${configPath}`);
      throw new Error(`Server configuration file not found: ${configPath}`);
    }
    console.error(`[CONFIG] Error loading configuration: ${error.message}`);
    throw error;
  }
}

/**
 * Get servers sorted by priority
 */
export function getServersSortedByPriority(servers) {
  return Object.entries(servers)
    .sort(([, a], [, b]) => (a.priority || 999) - (b.priority || 999))
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
}

