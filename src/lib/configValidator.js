/**
 * Configuration validation utilities
 */

const REQUIRED_FIELDS = [
  "host",
  "port",
  "game",
  "series",
  "friendlyName",
  "icon",
];

const OPTIONAL_FIELDS = [
  "needsConnectString",
  "password",
  "gamedig",
  "description",
  "priority",
  "auth",
  "manualConnectString",
];

/**
 * Validate a single server configuration
 */
export function validateServerConfig(serverKey, config)
{
  const errors = [];

  // Check required fields
  for (const field of REQUIRED_FIELDS)
  {
    if (!(field in config))
    {
      errors.push(`Missing required field: ${ field }`);
    }
  }

  // Validate data types
  if (config.port && typeof config.port !== "number")
  {
    errors.push("Port must be a number");
  }

  if (config.port && (config.port < 1 || config.port > 65535))
  {
    errors.push("Port must be between 1 and 65535");
  }

  if (config.password !== undefined && typeof config.password !== "boolean")
  {
    errors.push("Password field must be boolean");
  }

  if (config.gamedig !== undefined && typeof config.gamedig !== "boolean")
  {
    errors.push("Gamedig field must be boolean");
  }

  if (config.priority !== undefined && typeof config.priority !== "number")
  {
    errors.push("Priority must be a number");
  }

  // Validate server key format matches host:port
  const expectedKey = `${ config.host }:${ config.port }`;
  if (serverKey !== expectedKey)
  {
    errors.push(`Server key "${ serverKey }" should match "${ expectedKey }"`);
  }

  return errors;
}

/**
 * Validate entire servers configuration
 */
export function validateServersConfig(servers)
{
  const allErrors = {};
  let hasErrors = false;

  for (const [serverKey, config] of Object.entries(servers))
  {
    const errors = validateServerConfig(serverKey, config);
    if (errors.length > 0)
    {
      allErrors[serverKey] = errors;
      hasErrors = true;
    }
  }

  return {
    hasErrors,
    errors: allErrors,
  };
}

/**
 * Set default values for optional fields
 */
export function setConfigDefaults(config)
{
  return {
    needsConnectString: false,
    password: false,
    gamedig: true,
    description: "",
    priority: 999,
    ...config,
  };
}
