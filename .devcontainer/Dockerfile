# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/devcontainers/base:ubuntu

ARG USERNAME=vscode

# Select zsh as default shell for $USERNAME
RUN chsh -s $(which zsh) $USERNAME
SHELL [ "/bin/zsh", "-i", "-c" ]

# Change to $USERNAME user
USER $USERNAME
WORKDIR /home/$USERNAME

RUN echo "export SHELL=zsh" >> ~/.zshrc

# Install zsh syntax highlighting plugin
RUN git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ~/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting \
  && omz plugin enable zsh-syntax-highlighting

# Install zsh autosuggestions plugin
RUN git clone https://github.com/zsh-users/zsh-autosuggestions ~/.oh-my-zsh/custom/plugins/zsh-autosuggestions \
  && omz plugin enable zsh-autosuggestions

# Install nvm
RUN cp .zshrc .zshrc.bak && \
  wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && \
  mv .zshrc.bak .zshrc && rm .zshrc.b* && \
  omz plugin enable nvm

# Enable nvm autoload
RUN sed -i "/source \$ZSH\/oh-my-zsh.sh/i\
zstyle ':omz:plugins:nvm' autoload yes\n\
zstyle ':omz:plugins:nvm' silent-autoload yes\n\
" "$HOME/.zshrc"

# Install lts as default Node version
RUN nvm install --lts

# Install playwright browsers
RUN npx playwright install-deps && npx playwright install

# Copy OMZ scripts
COPY --chown=$USERNAME:$USERNAME ./omz/ .oh-my-zsh/custom/

# Point scripts to Node LTS version
RUN LTS_VERSION=$(node -v) && \
  sed -i "s/LTS_VERSION/$LTS_VERSION/" ~/.oh-my-zsh/custom/node-config.zsh

CMD [ "/bin/zsh" ]