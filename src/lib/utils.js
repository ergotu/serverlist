/**
 * Calculate available series from servers configuration
 */
export function getAvailableSeries(servers)
{
  return [
    ...new Set(Object.values(servers).map((server) => server.series)),
  ];
}

/**
 * Extract allowed hosts from servers configuration
 */
export function getAllowedHosts(servers)
{
  const hosts = Object.values(servers).map((server) => server.host);
  return [
    ...new Set(hosts),
  ];
}


/**
 * Create a standardized error response
 */
export function createErrorResponse(status, message)
{
  return {
    status,
    message,
  };
}
