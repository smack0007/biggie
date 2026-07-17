FROM debian:trixie-slim
LABEL maintainer="Zachary Snow <zachary.snow+docker@gmail.com>"

# Set locale so Unicode characters render correctly in locale-aware tools (e.g. tmux).
ENV LANG=C.UTF-8

ENV PATH=/root/.deno/bin:$PATH

RUN apt-get update \
    && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      git \
      gnupg \
      lsb-release \
      unzip \
      wget \
    && bash -c "$(wget -O - https://apt.llvm.org/llvm.sh)" \
    && export LLVM_VERSION="$(dpkg -l | grep "^ii.*clang" | awk '{print $2}' | sed 's/.*-\([0-9]*\)$/\1/' | head -1)" \
    && apt-get install -y clang-format-$LLVM_VERSION \
    && curl -fsSL https://deno.land/install.sh | sh \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/clang-$LLVM_VERSION /usr/local/bin/clang \
    && ln -s /usr/bin/clang-format-$LLVM_VERSION /usr/local/bin/clang-format