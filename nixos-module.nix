{
  config,
  lib,
  pkgs,
  server-list-package,
  ...
}:
with lib; let
  cfg = config.services.server-list;

  # Use the server-list package passed from the flake
  server-list = server-list-package;

  # Use provided servers config or fall back to default from src/servers.json
  serversConfig =
    if cfg.servers != {}
    then cfg.servers
    else builtins.fromJSON (builtins.readFile ./src/servers.json);

  # Create a configuration file for the service
  configFile = pkgs.writeText "servers.json" (builtins.toJSON serversConfig);

  # Create environment file
  envFile = pkgs.writeText "server-list.env" ''
    NODE_ENV=${cfg.environment}
    PORT=${toString cfg.port}
    LOG_LEVEL=${cfg.logLevel}
    ENABLE_RATE_LIMIT=${
      if cfg.enableRateLimit
      then "true"
      else "false"
    }
    ${optionalString (cfg.extraEnvVars != {})
      (concatStringsSep "\n" (mapAttrsToList (name: value: "${name}=${value}") cfg.extraEnvVars))}
  '';
in {
  options.services.server-list = {
    enable = mkEnableOption "Server List service";

    port = mkOption {
      type = types.port;
      default = 3000;
      description = "Port to listen on";
    };

    environment = mkOption {
      type = types.enum ["development" "production"];
      default = "production";
      description = "Node.js environment";
    };

    logLevel = mkOption {
      type = types.enum ["error" "warn" "info" "debug"];
      default = "info";
      description = "Log level";
    };

    enableRateLimit = mkOption {
      type = types.bool;
      default = true;
      description = "Enable rate limiting";
    };

    servers = mkOption {
      type = types.attrs;
      default = {};
      description = "Server configuration object. If empty, uses default from src/servers.json";
      example = literalExpression ''
        {
          "example.com:27015" = {
            host = "example.com";
            port = 27015;
            game = "counterstrike2";
            series = "counterstrike";
            friendlyName = "My CS2 Server";
            needsConnectString = true;
            icon = "https://example.com/cs2.png";
            password = false;
            gamedig = true;
            description = "A great CS2 server";
            priority = 1;
          };
        }
      '';
    };

    extraEnvVars = mkOption {
      type = types.attrsOf types.str;
      default = {};
      description = "Additional environment variables";
      example = literalExpression ''
        {
          CUSTOM_VAR = "value";
          ANOTHER_VAR = "another_value";
        }
      '';
    };

    user = mkOption {
      type = types.str;
      default = "server-list";
      description = "User to run the service as";
    };

    group = mkOption {
      type = types.str;
      default = "server-list";
      description = "Group to run the service as";
    };

    dataDir = mkOption {
      type = types.path;
      default = "/var/lib/server-list";
      description = "Directory to store application data";
    };
  };

  config = mkIf cfg.enable {
    # Create user and group
    users.users.${cfg.user} = {
      isSystemUser = true;
      group = cfg.group;
      home = cfg.dataDir;
      createHome = true;
      description = "Server List service user";
    };

    users.groups.${cfg.group} = {};

    # Create systemd service
    systemd.services.server-list = {
      description = "Server List web application";
      wantedBy = ["multi-user.target"];
      after = ["network.target"];

      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        WorkingDirectory = cfg.dataDir;

        # Copy configuration files to data directory and run the service
        ExecStartPre = [
          "${pkgs.coreutils}/bin/mkdir -p ${cfg.dataDir}"
          "${pkgs.coreutils}/bin/install -o ${cfg.user} -g ${cfg.group} -m 644 ${configFile} ${cfg.dataDir}/servers.json"
          "${pkgs.coreutils}/bin/chown -R ${cfg.user}:${cfg.group} ${cfg.dataDir}"
        ];

        ExecStart = "${server-list}/bin/server-list --config ${cfg.dataDir}/servers.json";

        EnvironmentFile = envFile;

        # Security settings
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ReadWritePaths = [cfg.dataDir];

        # Restart settings
        Restart = "always";
        RestartSec = "10s";

        # Resource limits
        LimitNOFILE = 65536;
      };

      environment = {
        NODE_ENV = cfg.environment;
        PORT = toString cfg.port;
      };
    };

    # Open firewall port if needed
    networking.firewall.allowedTCPPorts = mkIf cfg.enable [cfg.port];

    # Add the package to system packages
    environment.systemPackages = [server-list];
  };
}
