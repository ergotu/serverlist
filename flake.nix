{
  description = "A server list of my/friends Game Servers";

  nixConfig = {
    extra-substituters = [
      "https://cache.nixos.org"
      "https://cache.garnix.io"
    ];
    extra-trusted-public-keys = [
      "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
      "cache.garnix.io:CTFPyKSLcx5RMJKfLo5EEPUObbA78b0YQ2DTCJXqr9g="
    ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    bun2nix.url = "github:baileyluTCD/bun2nix";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    bun2nix,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = nixpkgs.legacyPackages.${system};

        # Build the application package
        server-list = pkgs.callPackage ./. {
          inherit (bun2nix.lib.${system}) mkBunDerivation;
        };
      in {
        # Development shell
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            nodejs
            just
            # For linting
            nodePackages.npm-check-updates
            vtsls
            biome
            alejandra
            nixd
            # bun2nix for dependency management
            bun2nix.packages.${system}.default
          ];

          shellHook = ''
            echo "🚀 Server List development environment ready!"
            echo ""
            echo "Available commands:"
            echo "  just          - Show available just commands"
            echo "  just dev      - Start development server"
            echo "  just start    - Start production server"
            echo "  just lint     - Lint the code"
            echo "  just lint-fix - Lint and fix the code"
            echo "  just update   - Update dependencies"
            echo "  just build    - Build Docker image"
            echo ""
            echo "Versions:"
            echo "  Node.js: $(node --version)"
            echo "  Bun: $(bun --version)"
            echo "  Just: $(just --version)"
          '';
        };

        # Package outputs
        packages = {
          default = server-list;
          inherit server-list;
        };

        # App for nix run
        apps.default = {
          type = "app";
          program = "${server-list}/bin/server-list";
        };

        # NixOS module
        nixosModules.default = {
          config,
          lib,
          pkgs,
          ...
        }: (import ./nixos-module.nix {
          inherit config lib pkgs;
          server-list-package = server-list;
        });
      }
    );
}
