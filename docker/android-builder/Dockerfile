FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV ANDROID_HOME=/opt/android-sdk
ENV PATH=${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/build-tools/35.0.0:/opt/gradle/bin:${PATH}

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    openjdk-17-jdk \
    unzip \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && npm install -g pnpm@9.12.3 gradle \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p ${ANDROID_HOME}/cmdline-tools \
  && curl -fsSL -o /tmp/android-commandlinetools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
  && unzip -q /tmp/android-commandlinetools.zip -d ${ANDROID_HOME}/cmdline-tools \
  && mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
  && rm /tmp/android-commandlinetools.zip

RUN yes | sdkmanager --licenses >/dev/null \
  && sdkmanager \
    "platform-tools" \
    "platforms;android-35" \
    "build-tools;35.0.0"

COPY entrypoint.sh /usr/local/bin/android-builder-entrypoint
RUN chmod +x /usr/local/bin/android-builder-entrypoint

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/android-builder-entrypoint"]
CMD ["bash"]
