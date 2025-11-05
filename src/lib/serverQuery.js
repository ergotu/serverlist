import { GameDig } from "gamedig";
import { handleQuakeServer, handleDwcServer } from "./gameHandlers.js";
import { logger } from "./logger.js";

const QUERY_TIMEOUT = parseInt(process.env.QUERY_TIMEOUT || "5000", 10);

/**
 * Query a server for its status and player information
 */
export async function queryServer(game, host, port, serverInfo)
{
  const startTime = Date.now();
  logger.debug(`Starting query for ${game} at ${host}:${port}, gamedig: ${serverInfo.gamedig}`);

  try
  {
    let serverData = {};

    if (serverInfo.gamedig !== false)
    {
      // Use GameDig for most games
      logger.debug(`Using GameDig for ${host}:${port} with type: ${game}`);
      try
      {
        serverData = await GameDig.query({
          type: game,
          host,
          port,
          timeout: QUERY_TIMEOUT,
        });

        logger.debug(
          `GameDig query successful for ${ host }:${ port } (${ Date.now() - startTime }ms), players: ${serverData.numplayers}/${serverData.maxplayers}`,
        );
      } catch (error)
      {
        logger.warn(
          `GameDig query failed for ${ host }:${ port }: ${ error.message }`,
        );
        logger.debug(`GameDig error details:`, error);
        return {
          online: false,
          error: error.message,
        };
      }
    } else
    {
      // Handle custom game queries
      logger.debug(`Using custom handler for game type: ${game}`);
      switch (game)
      {
        case "quake":
          serverData = await handleQuakeServer(serverInfo);
          break;
        case "dwc":
          serverData = await handleDwcServer(serverInfo);
          break;
        default:
          logger.warn(`Unknown custom game type: ${ game }`);
          serverData = {
            online: false,
          };
      }

      logger.debug(
        `Custom query for ${ game } at ${ host }:${ port } (${ Date.now() - startTime }ms), online: ${serverData.online}`,
      );
    }

    return {
      ...serverData,
      queryTime: Date.now() - startTime,
    };
  } catch (error)
  {
    logger.error(`Server query error for ${ host }:${ port }: ${ error.message }`);
    return {
      online: false,
      error: error.message,
      queryTime: Date.now() - startTime,
    };
  }
}

/**
 * Validate if a host is allowed to be queried
 */
export function isHostAllowed(host, allowedHosts)
{
  return allowedHosts.includes(host);
}

/**
 * Query multiple servers concurrently with proper error handling
 */
export async function queryMultipleServers(serverConfigs)
{
  const serverCount = Object.keys(serverConfigs).length;
  logger.debug(`Starting batch query for ${serverCount} servers`);
  
  const queries = Object.entries(serverConfigs).map(
    async ([serverKey, config]) =>
    {
      const [host, port] = serverKey.split(":");
      logger.debug(`Querying ${serverKey} (${config.game})`);
      try
      {
        const result = await queryServer(
          config.game,
          host,
          parseInt(port, 10),
          config,
        );
        logger.debug(`Query result for ${serverKey}: online=${result.online}`);
        return {
          serverKey,
          config,
          result,
        };
      } catch (error)
      {
        logger.error(`Failed to query ${ serverKey }: ${ error.message }`);
        return {
          serverKey,
          config,
          result: {
            online: false,
            error: error.message,
          },
        };
      }
    },
  );

  const results = await Promise.allSettled(queries);
  const successCount = results.filter(r => r.status === 'fulfilled').length;
  logger.debug(`Batch query completed: ${successCount}/${serverCount} successful`);
  
  return results;
}
