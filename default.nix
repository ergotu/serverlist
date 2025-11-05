{mkBunDerivation, ...}:
mkBunDerivation {
  pname = "server-list";
  version = "0.0.1";

  src = ./.;

  bunNix = ./bun.nix;

  index = "./src/app.js";

  buildPhase = ''
    bun run build \
      --minify
  '';

  installPhase = ''
    mkdir -p $out/dist

    cp -R ./dist $out
  '';

  meta = {
    description = "A server list of my/friends Game Servers";
    license = "AGPL-3.0-or-later";
    maintainers = [];
  };
}
