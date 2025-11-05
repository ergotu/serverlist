import Rcon from "rcon";
import { logger } from "./logger.js";

const QUERY_TIMEOUT = parseInt(process.env.QUERY_TIMEOUT || "5000", 10);
const QUAKE_DELAY = parseInt(process.env.QUAKE_DELAY || "450", 10);

/**
 * Handle Quake 1 server queries using RCON
 */
export async function handleQuakeServer(serverInfo)
{
  try
  {
    const quake1RconPassword = process.env[serverInfo.auth];

    if (!quake1RconPassword)
    {
      logger.warn(
        `Missing RCON password for Quake server: ${ serverInfo.host }:${ serverInfo.port }`,
      );
      return {
        online: false,
      };
    }

    const rcon = new Rcon(
      serverInfo.host,
      serverInfo.port,
      quake1RconPassword,
      {
        tcp: false,
        challenge: false,
      },
    );

    return new Promise((resolve, reject) =>
    {
      let serverData = {
        online: false,
      };
      let resolved = false;

      const timeout = setTimeout(() =>
      {
        if (!resolved)
        {
          resolved = true;
          logger.debug(
            `Quake server query timeout: ${ serverInfo.host }:${ serverInfo.port }`,
          );
          resolve({
            online: false,
          });
        }
      }, QUERY_TIMEOUT);

      rcon
        .on("auth", async () =>
        {
          try
          {
            await rcon.send("status");
          } catch (error)
          {
            logger.error(
              `Failed to send status command to Quake server: ${ error.message }`,
            );
          }
        })
        .on("response", async (response) =>
        {
          try
          {
            const lines = response.split("\n");
            if (lines[0] === "") return; // ignore empty query

            const map = lines[3]?.split(":")[1]?.trim().split(" ")[0] || "";
            const players =
              lines[5]?.split(": ")[1]?.trim().split(" ")[0] || "0";
            const playerArray = Array.from({
              length: parseInt(players, 10),
            }).keys();
            const maxPlayers = lines[5]?.split("(")[1]?.split(" ")[0] || "0";

            serverData = {
              online: true,
              players: playerArray,
              numplayers: players,
              maxplayers: maxPlayers,
              map,
              bots: [],
              raw: {},
            };
          } catch (error)
          {
            logger.error(
              `Error parsing Quake server response: ${ error.message }`,
            );
          }
        })
        .on("end", async () =>
        {
          try
          {
            await rcon.disconnect();
            if (!resolved)
            {
              resolved = true;
              clearTimeout(timeout);

              // Quake servers need extra delay
              setTimeout(() =>
              {
                resolve(serverData);
              }, QUAKE_DELAY);
            }
          } catch (error)
          {
            logger.error(
              `Error disconnecting from Quake server: ${ error.message }`,
            );
          }
        })
        .on("error", (error) =>
        {
          if (!resolved)
          {
            resolved = true;
            clearTimeout(timeout);
            logger.error(`Quake server RCON error: ${ error.message }`);
            resolve({
              online: false,
            });
          }
        });

      rcon.connect().catch((error) =>
      {
        if (!resolved)
        {
          resolved = true;
          clearTimeout(timeout);
          logger.error(`Failed to connect to Quake server: ${ error.message }`);
          resolve({
            online: false,
          });
        }
      });
    });
  } catch (error)
  {
    logger.error(`Quake server handler error: ${ error.message }`);
    return {
      online: false,
    };
  }
}

/**
 * Handle DWC (Nintendo Wi-Fi Connection) server queries
 */
export async function handleDwcServer(serverInfo)
{
  try
  {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT);

    const response = await fetch(
      `http://${ serverInfo.host }:${ serverInfo.port }/json`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "ServerList/1.0",
        },
      },
    );

    clearTimeout(timeoutId);

    if (!response.ok)
    {
      throw new Error(`HTTP ${ response.status }: ${ response.statusText }`);
    }

    const data = await response.json();

    let players = 0;
    for (const game in data)
    {
      if (Array.isArray(data[game]))
      {
        players += data[game].length;
      }
    }

    return {
      online: true,
      players: [],
      numplayers: players,
      maxplayers: players,
      map: "",
      bots: [],
      raw: data,
    };
  } catch (error)
  {
    if (error.name === "AbortError")
    {
      logger.debug(
        `DWC server query timeout: ${ serverInfo.host }:${ serverInfo.port }`,
      );
    } else
    {
      logger.error(`DWC server query error: ${ error.message }`);
    }
    return {
      online: false,
    };
  }
}
