#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const net = require("net");

const PORTS_FILE = path.join(__dirname, "..", ".dev-ports.json");
const DEV_ASSETS_SEED = path.join(__dirname, "..", "dev_assets_seed");
const DEV_ASSETS = path.join(__dirname, "..", "dev_assets");
const FIXED_FRONTEND_PORT = 4051;
const FIXED_BACKEND_PORT = 4050;
const PREVIEW_PROXY_START_PORT = 4052;

/**
 * Check if a port is available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host: "localhost" });
    sock.on("connect", () => {
      sock.destroy();
      resolve(false);
    });
    sock.on("error", () => resolve(true));
  });
}

/**
 * Find a free port starting from a given port
 */
async function findFreePort(startPort = PREVIEW_PROXY_START_PORT, blockedPorts = new Set()) {
  let port = startPort;
  while (blockedPorts.has(port) || !(await isPortAvailable(port))) {
    port++;
    if (port > 65535) {
      throw new Error("No available ports found");
    }
  }
  return port;
}

/**
 * Load existing ports from file
 */
function loadPorts() {
  try {
    if (fs.existsSync(PORTS_FILE)) {
      const data = fs.readFileSync(PORTS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn("Failed to load existing ports:", error.message);
  }
  return null;
}

/**
 * Save ports to file
 */
function savePorts(ports) {
  try {
    fs.writeFileSync(PORTS_FILE, JSON.stringify(ports, null, 2));
  } catch (error) {
    console.error("Failed to save ports:", error.message);
    throw error;
  }
}

/**
 * Verify that saved ports are still available
 */
async function verifyPorts(ports) {
  const hasUniquePorts =
    new Set([ports.frontend, ports.backend, ports.preview_proxy]).size === 3;
  const frontendIsFixed = ports.frontend === FIXED_FRONTEND_PORT;
  const backendIsFixed = ports.backend === FIXED_BACKEND_PORT;
  const previewProxyInRange = ports.preview_proxy >= PREVIEW_PROXY_START_PORT;
  const frontendAvailable = await isPortAvailable(FIXED_FRONTEND_PORT);
  const backendAvailable = await isPortAvailable(FIXED_BACKEND_PORT);
  const previewProxyAvailable = await isPortAvailable(ports.preview_proxy);

  if (
    process.argv[2] === "get" &&
    (!frontendIsFixed ||
      !frontendAvailable ||
      !backendAvailable ||
      !previewProxyAvailable ||
      !previewProxyInRange ||
      !hasUniquePorts ||
      !backendIsFixed)
  ) {
    console.log(
      `Port check failed: frontend:${ports.frontend}=fixed(${frontendIsFixed}) available(${frontendAvailable}), backend:${ports.backend}=fixed(${backendIsFixed}) available(${backendAvailable}), preview_proxy:${ports.preview_proxy} available(${previewProxyAvailable}) in_range(${previewProxyInRange}), unique=${hasUniquePorts}`
    );
  }

  return (
    frontendIsFixed &&
    frontendAvailable &&
    backendAvailable &&
    previewProxyAvailable &&
    previewProxyInRange &&
    hasUniquePorts &&
    backendIsFixed
  );
}

/**
 * Allocate ports for development
 */
async function allocatePorts() {
  const blockedPorts = new Set([FIXED_FRONTEND_PORT, FIXED_BACKEND_PORT]);

  if (!(await isPortAvailable(FIXED_FRONTEND_PORT))) {
    throw new Error(`Frontend fixed port ${FIXED_FRONTEND_PORT} is already in use`);
  }

  if (!(await isPortAvailable(FIXED_BACKEND_PORT))) {
    throw new Error(`Backend fixed port ${FIXED_BACKEND_PORT} is already in use`);
  }

  // Try to load existing ports first
  const existingPorts = loadPorts();
  const normalizedExistingPorts = existingPorts
    ? {
        ...existingPorts,
        frontend: FIXED_FRONTEND_PORT,
        backend: FIXED_BACKEND_PORT,
      }
    : null;

  if (normalizedExistingPorts) {
    // Verify existing ports are still available
    if (await verifyPorts(normalizedExistingPorts)) {
      if (process.argv[2] === "get") {
        console.log("Reusing existing dev ports:");
        console.log(`Frontend: ${normalizedExistingPorts.frontend}`);
        console.log(`Backend: ${normalizedExistingPorts.backend}`);
        console.log(`Preview Proxy: ${normalizedExistingPorts.preview_proxy}`);
      }
      return normalizedExistingPorts;
    } else {
      if (process.argv[2] === "get") {
        console.log(
          "Existing ports are no longer available, finding new ones..."
        );
      }
    }
  }

  // Find new free ports
  const previewProxyPort = await findFreePort(PREVIEW_PROXY_START_PORT, blockedPorts);

  const ports = {
    frontend: FIXED_FRONTEND_PORT,
    backend: FIXED_BACKEND_PORT,
    preview_proxy: previewProxyPort,
    timestamp: new Date().toISOString(),
  };

  savePorts(ports);

  if (process.argv[2] === "get") {
    console.log("Allocated new dev ports:");
    console.log(`Frontend: ${ports.frontend}`);
    console.log(`Backend: ${ports.backend}`);
    console.log(`Preview Proxy: ${ports.preview_proxy}`);
  }

  return ports;
}

/**
 * Get ports (allocate if needed)
 */
async function getPorts() {
  const ports = await allocatePorts();
  copyDevAssets();
  return ports;
}

/**
 * Copy dev_assets_seed to dev_assets
 */
function copyDevAssets() {
  try {
    if (!fs.existsSync(DEV_ASSETS)) {
      // Copy dev_assets_seed to dev_assets
      fs.cpSync(DEV_ASSETS_SEED, DEV_ASSETS, { recursive: true });

      if (process.argv[2] === "get") {
        console.log("Copied dev_assets_seed to dev_assets");
      }
    }
  } catch (error) {
    console.error("Failed to copy dev assets:", error.message);
  }
}

/**
 * Clear saved ports
 */
function clearPorts() {
  try {
    if (fs.existsSync(PORTS_FILE)) {
      fs.unlinkSync(PORTS_FILE);
      console.log("Cleared saved dev ports");
    } else {
      console.log("No saved ports to clear");
    }
  } catch (error) {
    console.error("Failed to clear ports:", error.message);
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];

  switch (command) {
    case "get":
      getPorts()
        .then((ports) => {
          console.log(JSON.stringify(ports));
        })
        .catch(console.error);
      break;

    case "clear":
      clearPorts();
      break;

    case "frontend":
      getPorts()
        .then((ports) => {
          console.log(JSON.stringify(ports.frontend, null, 2));
        })
        .catch(console.error);
      break;

    case "backend":
      getPorts()
        .then((ports) => {
          console.log(JSON.stringify(ports.backend, null, 2));
        })
        .catch(console.error);
      break;

    case "preview_proxy":
      getPorts()
        .then((ports) => {
          console.log(JSON.stringify(ports.preview_proxy, null, 2));
        })
        .catch(console.error);
      break;

    default:
      console.log("Usage:");
      console.log(
        "  node setup-dev-environment.js get           - Setup dev environment (ports + assets)"
      );
      console.log(
        "  node setup-dev-environment.js frontend      - Get frontend port only"
      );
      console.log(
        "  node setup-dev-environment.js backend       - Get backend port only"
      );
      console.log(
        "  node setup-dev-environment.js preview_proxy - Get preview proxy port only"
      );
      console.log(
        "  node setup-dev-environment.js clear         - Clear saved ports"
      );
      break;
  }
}

module.exports = { getPorts, clearPorts, findFreePort };
