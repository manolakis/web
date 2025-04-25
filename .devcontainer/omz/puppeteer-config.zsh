export PUPPETEER_SKIP_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=$(find "$HOME/.cache/ms-playwright" -type f -name "chrome" -executable | head -n 1)
export CHROME_PATH=$PUPPETEER_EXECUTABLE_PATH