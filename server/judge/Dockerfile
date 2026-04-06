# ThinkFlow Judge Container
# Industry-standard sandboxed code execution environment
# Contains: GCC 12, OpenJDK 17, Python 3.11, Node.js 20

FROM ubuntu:22.04

# Avoid interactive prompts during install
ENV DEBIAN_FRONTEND=noninteractive

# Install all compilers and runtimes in a single layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    # C/C++ compiler
    gcc \
    g++ \
    # Java
    default-jdk-headless \
    # Python
    python3 \
    python3-pip \
    # Node.js (via NodeSource)
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    # Cleanup to reduce image size
    && apt-get purge -y curl ca-certificates \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Remove package managers and network tools for security
RUN apt-get purge -y wget 2>/dev/null; \
    rm -f /usr/bin/apt /usr/bin/apt-get /usr/bin/dpkg 2>/dev/null; \
    rm -rf /usr/lib/apt 2>/dev/null; \
    true

# Create non-root judge user
RUN useradd -m -u 1001 -s /bin/false judge

# Create working directory
RUN mkdir -p /sandbox && chown judge:judge /sandbox

# Set working directory
WORKDIR /sandbox

# Switch to non-root user
USER judge

# Default command (overridden at runtime)
CMD ["echo", "ThinkFlow Judge Container Ready"]
