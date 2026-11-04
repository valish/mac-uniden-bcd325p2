#!/bin/zsh
set -eu
cd -- "${0:A:h}"
# Finder may start with a smaller PATH than an interactive terminal.
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@24/bin:/opt/homebrew/opt/node@22/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node(NOn); do
    if [[ "$("$candidate" -p 'Number(process.versions.node.split(".")[0]) >= 22')" == true ]]; then
      export PATH="${candidate:h}:$PATH"
      break
    fi
  done
fi
if ! command -v node >/dev/null 2>&1; then
  print 'Node.js 22 or newer is required. Install the current LTS from https://nodejs.org, then open this file again.'
  read '?Press Return to close. '
  exit 1
fi
exec node src/cli.mjs serve --open
